import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import type {
  ActiveRuleRoom,
  JsonValue,
  PlayerSnapshot,
  RuleCommand,
  SandboxRuleContext,
  SandboxRules,
} from './server-rule-contract.js';

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_BROADCAST_BYTES = 8 * 1024;
const RULE_API_FILE = path.resolve('/__bornengine_server_rules__/api.d.ts');
const RULE_API = `
interface PlayerSnapshot {
  readonly sessionId: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly hue: number;
}
interface ValidatedMoveInput {
  readonly sequence: number;
  readonly x: number;
  readonly y: number;
}
type BornEngineJson = null | boolean | number | string | readonly BornEngineJson[] | { readonly [key: string]: BornEngineJson };
interface SandboxRuleContext {
  log(message: string): void;
  players(): readonly PlayerSnapshot[];
  setMovementSpeed(unitsPerSecond: number): void;
  broadcastJson(event: string, payload: BornEngineJson): void;
}
interface SandboxRules {
  onPlayerJoin?(player: PlayerSnapshot, context: SandboxRuleContext): void;
  onPlayerLeave?(player: PlayerSnapshot, context: SandboxRuleContext): void;
  onInput?(player: PlayerSnapshot, input: ValidatedMoveInput, context: SandboxRuleContext): void;
  onMessage?(player: PlayerSnapshot, event: string, payload: BornEngineJson, context: SandboxRuleContext): void;
  onTick?(deltaTime: number, context: SandboxRuleContext): void;
}
`;

type RulesFactory = () => SandboxRules;

export type StagedRulesGeneration = {
  readonly ok: true;
  readonly revision: number;
  readonly scriptPath: string;
  readonly source: string;
  readonly rulesByRoom: ReadonlyMap<string, SandboxRules>;
  readonly createRules: RulesFactory;
  readonly owner: RulesManager;
};

export type RulesStageFailure = { readonly ok: false; readonly diagnostic: string };

export interface RulesManagerOptions {
  readonly scriptsDirectory: string;
  readonly activeRooms: () => readonly ActiveRuleRoom[];
  readonly log?: (message: string) => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' && value !== null || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function';
}

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `(${position.line + 1}:${position.character + 1}) ${message}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateRules(value: unknown): value is SandboxRules {
  if (!isPlainRecord(value)) throw new TypeError('createRules() must return a plain rules object.');
  const hookNames = ['onPlayerJoin', 'onPlayerLeave', 'onInput', 'onMessage', 'onTick'] as const;
  for (const key of Object.keys(value)) {
    if (!(hookNames as readonly string[]).includes(key)) {
      throw new TypeError(`Unknown rule hook: ${key}.`);
    }
  }
  for (const key of hookNames) {
    const hook = value[key];
    if (hook !== undefined && typeof hook !== 'function') {
      throw new TypeError(`Rule hook ${key} must be a function.`);
    }
  }
  return true;
}

function cloneJsonPayload(payload: JsonValue): JsonValue {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(payload);
  } catch (_error) {
    throw new TypeError('broadcastJson payload must be serializable JSON.');
  }
  if (encoded === undefined) throw new TypeError('broadcastJson payload must be serializable JSON.');
  if (Buffer.byteLength(encoded, 'utf8') > MAX_BROADCAST_BYTES) {
    throw new RangeError('broadcastJson payload exceeds the 8 KiB limit.');
  }
  return JSON.parse(encoded) as JsonValue;
}

export class RulesManager {
  private readonly scriptsDirectory: string;
  private readonly activeRooms: () => readonly ActiveRuleRoom[];
  private readonly log: (message: string) => void;
  private revision = 0;
  private currentFactory: RulesFactory = () => ({});
  private currentScriptPath = 'rules.ts';

  constructor(options: RulesManagerOptions) {
    this.scriptsDirectory = path.resolve(options.scriptsDirectory);
    this.activeRooms = options.activeRooms;
    this.log = options.log ?? ((message) => console.log(`[sandbox rules] ${message}`));
  }

  get currentRevision(): number {
    return this.revision;
  }

  async stage(scriptPath: string, source: string): Promise<StagedRulesGeneration | RulesStageFailure> {
    if (!this.isSafeScriptName(scriptPath)) return { ok: false, diagnostic: 'Rule script must be a safe .ts basename.' };
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
      return { ok: false, diagnostic: 'Rule script exceeds the 64 KiB limit.' };
    }

    const nextRevision = this.revision + 1;
    const stagingDirectory = path.join(this.scriptsDirectory, '.staging', `generation-${nextRevision}-${randomUUID()}`);
    const stagedPath = path.join(stagingDirectory, scriptPath);
    await mkdir(this.scriptsDirectory, { recursive: true });

    try {
      await mkdir(stagingDirectory, { recursive: true });
      await writeFile(stagedPath, source, { encoding: 'utf8', flag: 'wx' });
      await this.copyRelativeModules(scriptPath, source, stagingDirectory);
      const diagnostics = this.typeDiagnostics(stagedPath);
      if (diagnostics.length > 0) return { ok: false, diagnostic: diagnostics.join('\n') };

      const moduleUrl = `${pathToFileURL(stagedPath).href}?revision=${nextRevision}`;
      const loaded = await import(moduleUrl) as { readonly createRules?: unknown };
      if (typeof loaded.createRules !== 'function') {
        return { ok: false, diagnostic: 'Rule module must export a synchronous createRules() function.' };
      }
      const factory = loaded.createRules as RulesFactory;
      let probe: unknown;
      try {
        probe = factory();
      } catch (error) {
        return { ok: false, diagnostic: `createRules() probe failed: ${toMessage(error)}` };
      }
      if (probe instanceof Promise) {
        return { ok: false, diagnostic: 'createRules() must be synchronous.' };
      }
      try {
        validateRules(probe);
      } catch (error) {
        return { ok: false, diagnostic: toMessage(error) };
      }

      const rooms = [...this.activeRooms()];
      const rulesByRoom = new Map<string, SandboxRules>();
      for (const room of rooms) {
        if (rulesByRoom.has(room.ruleRoomId)) {
          return { ok: false, diagnostic: `Duplicate active room id: ${room.ruleRoomId}.` };
        }
        let instance: unknown;
        try {
          instance = factory();
          if (instance instanceof Promise) throw new TypeError('createRules() must be synchronous.');
          validateRules(instance);
        } catch (error) {
          return { ok: false, diagnostic: `${room.ruleRoomId}: ${toMessage(error)}` };
        }
        rulesByRoom.set(room.ruleRoomId, this.bindRules(room, instance, scriptPath, nextRevision));
      }

      return {
        ok: true,
        revision: nextRevision,
        scriptPath,
        source,
        rulesByRoom,
        createRules: factory,
        owner: this,
      };
    } catch (error) {
      return { ok: false, diagnostic: toMessage(error) };
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }

  commit(staged: StagedRulesGeneration): boolean {
    if (staged.owner !== this || staged.revision !== this.revision + 1) return false;
    const rooms = [...this.activeRooms()];
    if (rooms.some((room) => !staged.rulesByRoom.has(room.ruleRoomId))) return false;
    if (new Set(rooms.map((room) => room.ruleRoomId)).size !== rooms.length) return false;

    for (const room of rooms) {
      const rules = staged.rulesByRoom.get(room.ruleRoomId);
      if (rules === undefined) return false;
      room.replaceRules(rules);
    }
    this.revision = staged.revision;
    this.currentFactory = staged.createRules;
    this.currentScriptPath = staged.scriptPath;
    return true;
  }

  createRulesForNewRoom(room: ActiveRuleRoom): SandboxRules {
    try {
      const rules: unknown = this.currentFactory();
      if (rules instanceof Promise) throw new TypeError('createRules() must be synchronous.');
      validateRules(rules);
      return this.bindRules(room, rules, this.currentScriptPath, this.revision);
    } catch (error) {
      room.reportRuleError(`${this.currentScriptPath} revision ${this.revision} createRules: ${toMessage(error)}`);
      return {};
    }
  }

  private isSafeScriptName(scriptPath: string): boolean {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}\.ts$/.test(scriptPath) && path.basename(scriptPath) === scriptPath;
  }

  private typeDiagnostics(fileName: string): string[] {
    const options: ts.CompilerOptions = {
      allowImportingTsExtensions: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: ['node'],
    };
    const host = ts.createCompilerHost(options, true);
    const virtualApiPath = path.resolve(RULE_API_FILE);
    const originalFileExists = host.fileExists.bind(host);
    const originalReadFile = host.readFile.bind(host);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.fileExists = (candidate) => path.resolve(candidate) === virtualApiPath || originalFileExists(candidate);
    host.readFile = (candidate) => path.resolve(candidate) === virtualApiPath ? RULE_API : originalReadFile(candidate);
    host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (path.resolve(candidate) === virtualApiPath) {
        return ts.createSourceFile(candidate, RULE_API, languageVersion, true);
      }
      return originalGetSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile);
    };
    const program = ts.createProgram([fileName, virtualApiPath], options, host);
    return ts.getPreEmitDiagnostics(program).map(diagnosticMessage);
  }

  private async copyRelativeModules(scriptPath: string, source: string, stagingDirectory: string): Promise<void> {
    const visited = new Set<string>([scriptPath]);
    const root = await realpath(this.scriptsDirectory);
    const copy = async (relativePath: string, contents: string): Promise<void> => {
      const sourceFile = ts.createSourceFile(relativePath, contents, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
      const modules: string[] = [];
      let unsupportedLoader: string | null = null;
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
            modules.push(node.moduleSpecifier.text);
          }
        } else if (ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
             (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
          unsupportedLoader = 'Use static relative imports in trusted rule modules.';
        }
        node.forEachChild(visit);
      };
      visit(sourceFile);
      if (unsupportedLoader !== null) throw new Error(unsupportedLoader);

      for (const specifier of modules) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          throw new Error(`Server rule imports must be relative: ${specifier}`);
        }
        if (!specifier.endsWith('.ts')) {
          throw new Error(`Server rule imports must include the .ts extension: ${specifier}`);
        }
        const dependency = path.resolve(this.scriptsDirectory, path.dirname(relativePath), specifier);
        const rootRelative = path.relative(root, dependency);
        if (rootRelative.startsWith('..') || path.isAbsolute(rootRelative)) {
          throw new Error(`Server rule import escapes server/scripts: ${specifier}`);
        }
        const fileInfo = await lstat(dependency);
        if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
          throw new Error(`Server rule import must target a regular file: ${specifier}`);
        }
        const resolved = await realpath(dependency);
        const resolvedRelative = path.relative(root, resolved);
        if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
          throw new Error(`Server rule import escapes server/scripts: ${specifier}`);
        }
        const destinationRelative = path.relative(root, resolved);
        if (visited.has(destinationRelative)) continue;
        visited.add(destinationRelative);
        const dependencySource = await readFile(resolved, 'utf8');
        const stagedDependency = path.join(stagingDirectory, destinationRelative);
        await mkdir(path.dirname(stagedDependency), { recursive: true });
        await writeFile(stagedDependency, dependencySource, { encoding: 'utf8', flag: 'wx' });
        await copy(destinationRelative, dependencySource);
      }
    };

    await copy(scriptPath, source);
  }

  private bindRules(room: ActiveRuleRoom, rules: unknown, scriptPath: string, revision: number): SandboxRules {
    const source = rules as SandboxRules;
    const invoke = (hookName: string, callback: (context: SandboxRuleContext) => unknown): void => {
        const commands: RuleCommand[] = [];
        const context: SandboxRuleContext = {
          log: (message) => this.log(`${scriptPath} revision ${revision}: ${String(message).slice(0, 2_000)}`),
          players: () => Object.freeze(room.getRulePlayerSnapshots().map((player) => Object.freeze({ ...player }))),
          setMovementSpeed: (unitsPerSecond) => {
            if (!Number.isFinite(unitsPerSecond)) throw new TypeError('Movement speed must be finite.');
            commands.push({ type: 'set-movement-speed', value: Math.max(30, Math.min(360, unitsPerSecond)) });
          },
          broadcastJson: (event, payload) => {
            if (typeof event !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(event)) {
              throw new TypeError('broadcastJson event must be a 1–64 character identifier.');
            }
            commands.push({ type: 'broadcast-json', event, payload: cloneJsonPayload(payload) });
          },
        };
        try {
          const result = callback(context);
          if (isPromiseLike(result)) {
            void Promise.resolve(result).catch((error: unknown) => {
              room.reportRuleError(`${scriptPath} revision ${revision} ${hookName} async rejection: ${toMessage(error)}`);
            });
            throw new TypeError('Rule hooks must be synchronous.');
          }
          room.applyRuleCommands(commands);
        } catch (error) {
          room.reportRuleError(`${scriptPath} revision ${revision} ${hookName}: ${toMessage(error)}`);
        }
    };

    return {
      onPlayerJoin: source.onPlayerJoin === undefined ? undefined : (player) => {
        invoke('onPlayerJoin', (context) => source.onPlayerJoin?.(player, context));
      },
      onPlayerLeave: source.onPlayerLeave === undefined ? undefined : (player) => {
        invoke('onPlayerLeave', (context) => source.onPlayerLeave?.(player, context));
      },
      onInput: source.onInput === undefined ? undefined : (player, input) => {
        invoke('onInput', (context) => source.onInput?.(player, input, context));
      },
      onMessage: source.onMessage === undefined ? undefined : (player, event, payload) => {
        invoke('onMessage', (context) => source.onMessage?.(player, event, payload, context));
      },
      onTick: source.onTick === undefined ? undefined : (deltaTime) => {
        invoke('onTick', (context) => source.onTick?.(deltaTime, context));
      },
    };
  }
}
