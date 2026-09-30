import { Room, type Client } from '@colyseus/core';
import { MapSchema, Schema, type } from '@colyseus/schema';
import {
  INPUT_MIN_INTERVAL_MS,
  PLAYER_SPEED,
  SIMULATION_STEP_SECONDS,
  type ValidatedMoveInput,
  clampPlayerPosition,
  normalizeMoveInput,
} from '../protocol.js';
import { validateAndCompileClientScript } from '../sandbox/client-script.js';
import { registerRuleRoom, unregisterRuleRoom } from '../sandbox/runtime.js';
import type {
  ActiveRuleRoom,
  JsonValue,
  PlayerSnapshot,
  RuleCommand,
  SandboxRuleContext,
  SandboxRules,
} from '../sandbox/server-rule-contract.js';

const MAX_CLIENTS = 8;
const CLIENT_SCRIPT_PUBLISH_INTERVAL_MS = 500;
const CLIENT_REJECTION_MIN_INTERVAL_MS = 250;
const RULE_MESSAGE_MIN_INTERVAL_MS = 100;
const MAX_RULE_MESSAGE_BYTES = 8 * 1024;
const INTERNAL_RULE_CONTEXT = Object.freeze({}) as SandboxRuleContext;

export class SandboxPlayerState extends Schema {
  @type('string') name = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') hue = 0;
}

export class SandboxRoomState extends Schema {
  @type({ map: SandboxPlayerState }) players = new MapSchema<SandboxPlayerState>();
  @type('string') publisherSessionId = '';
}

interface MovementInput {
  x: number;
  y: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

/** Colyseus owns canonical movement and relays only validated client scripts. */
export class SandboxRoom extends Room<{ state: SandboxRoomState }> implements ActiveRuleRoom {
  maxClients = MAX_CLIENTS;
  state = new SandboxRoomState();

  private readonly movementBySession = new Map<string, MovementInput>();
  private readonly lastSequences = new Map<string, number>();
  private readonly lastInputAt = new Map<string, number>();
  private readonly lastPublishAttemptAt = new Map<string, number>();
  private readonly lastRuleMessageAt = new Map<string, number>();
  private readonly lastRejectionAt = new Map<string, Map<string, number>>();
  private scriptRevision = 0;
  private scriptSource = '';
  private scriptJavascript = '';
  private movementSpeed = PLAYER_SPEED;
  private activeRules: SandboxRules = {};

  get ruleRoomId(): string {
    return this.roomId;
  }

  onCreate(): void {
    this.onMessage('input', (client, payload: unknown) => this.acceptInput(client, payload));
    this.onMessage('publishClientScript', (client, payload: unknown) => this.acceptClientScript(client, payload));
    this.onMessage('requestClientScriptSnapshot', (client) => this.sendClientScriptSnapshot(client));
    this.onMessage('ruleMessage', (client, payload: unknown) => this.acceptRuleMessage(client, payload));
    this.setSimulationInterval(() => this.simulate(), SIMULATION_STEP_SECONDS * 1000);
    registerRuleRoom(this);
  }

  onDispose(): void {
    unregisterRuleRoom(this);
  }

  onJoin(client: Client, options: unknown = {}): void {
    const name = isRecord(options) ? options.name : undefined;
    const player = new SandboxPlayerState();
    player.name = this.playerName(name, this.state.players.size);
    const slot = this.state.players.size;
    const spawn = clampPlayerPosition(140 + (slot % 4) * 190, 120 + Math.floor(slot / 4) * 220);
    player.x = spawn.x;
    player.y = spawn.y;
    player.hue = (slot * 71 + 92) % 360;
    this.state.players.set(client.sessionId, player);
    this.movementBySession.set(client.sessionId, { x: 0, y: 0 });
    this.lastSequences.set(client.sessionId, -1);

    if (this.state.publisherSessionId.length === 0) {
      this.state.publisherSessionId = client.sessionId;
      this.broadcast('publisherChanged', { sessionId: client.sessionId });
    }
    this.activeRules.onPlayerJoin?.(this.snapshotPlayer(client.sessionId, player), INTERNAL_RULE_CONTEXT);
    this.sendClientScriptSnapshot(client);
  }

  private sendClientScriptSnapshot(client: Client): void {
    client.send('clientScriptSnapshot', {
      revision: this.scriptRevision,
      source: this.scriptSource,
      javascript: this.scriptJavascript,
    });
  }

  onLeave(client: Client): void {
    const leavingPlayer = this.state.players.get(client.sessionId);
    if (leavingPlayer !== undefined) {
      this.activeRules.onPlayerLeave?.(this.snapshotPlayer(client.sessionId, leavingPlayer), INTERNAL_RULE_CONTEXT);
    }
    this.state.players.delete(client.sessionId);
    this.movementBySession.delete(client.sessionId);
    this.lastSequences.delete(client.sessionId);
    this.lastInputAt.delete(client.sessionId);
    this.lastPublishAttemptAt.delete(client.sessionId);
    this.lastRuleMessageAt.delete(client.sessionId);
    this.lastRejectionAt.delete(client.sessionId);

    if (this.state.publisherSessionId === client.sessionId) {
      const nextPublisher = this.clients.find((connected) => connected.sessionId !== client.sessionId);
      this.state.publisherSessionId = nextPublisher?.sessionId ?? '';
      if (this.state.publisherSessionId.length > 0) {
        this.broadcast('publisherChanged', { sessionId: this.state.publisherSessionId });
      }
    }
  }

  private acceptInput(client: Client, payload: unknown): void {
    if (!this.state.players.has(client.sessionId)) return;
    const lastSequence = this.lastSequences.get(client.sessionId) ?? -1;
    const result = normalizeMoveInput(payload, lastSequence);
    if (!result.ok) {
      this.sendRejection(client, 'inputRejected', { reason: result.reason });
      return;
    }
    const now = Date.now();
    const lastAt = this.lastInputAt.get(client.sessionId) ?? 0;
    if (now - lastAt < INPUT_MIN_INTERVAL_MS) {
      this.sendRejection(client, 'inputRejected', { reason: 'rate-limit' });
      return;
    }
    this.lastInputAt.set(client.sessionId, now);
    this.lastSequences.set(client.sessionId, result.input.sequence);
    this.movementBySession.set(client.sessionId, { x: result.input.x, y: result.input.y });
    client.send('inputAccepted', { sequence: result.input.sequence });
    this.activeRules.onInput?.(
      this.snapshotPlayer(client.sessionId, this.state.players.get(client.sessionId)!),
      result.input,
      INTERNAL_RULE_CONTEXT,
    );
  }

  private acceptRuleMessage(client: Client, payload: unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (player === undefined) return;
    const now = Date.now();
    const lastAt = this.lastRuleMessageAt.get(client.sessionId) ?? 0;
    if (now - lastAt < RULE_MESSAGE_MIN_INTERVAL_MS) {
      this.sendRejection(client, 'ruleMessageRejected', { reason: 'rate-limit' });
      return;
    }
    this.lastRuleMessageAt.set(client.sessionId, now);
    if (!isRecord(payload) || !onlyKeys(payload, ['event', 'payload']) ||
        typeof payload.event !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(payload.event) ||
        !isJsonValue(payload.payload)) {
      this.sendRejection(client, 'ruleMessageRejected', { reason: 'malformed' });
      return;
    }
    let encoded: string;
    try {
      encoded = JSON.stringify(payload.payload);
    } catch (_error) {
      this.sendRejection(client, 'ruleMessageRejected', { reason: 'malformed' });
      return;
    }
    if (Buffer.byteLength(encoded, 'utf8') > MAX_RULE_MESSAGE_BYTES) {
      this.sendRejection(client, 'ruleMessageRejected', { reason: 'payload-too-large' });
      return;
    }
    this.activeRules.onMessage?.(
      this.snapshotPlayer(client.sessionId, player),
      payload.event,
      JSON.parse(encoded) as JsonValue,
      INTERNAL_RULE_CONTEXT,
    );
  }

  private acceptClientScript(client: Client, payload: unknown): void {
    if (client.sessionId !== this.state.publisherSessionId) {
      this.sendRejection(client, 'clientScriptResult', {
        currentRevision: this.scriptRevision,
        result: 'rejected',
        reason: 'publisher-only',
      });
      return;
    }
    if (!isRecord(payload) || !onlyKeys(payload, ['revision', 'source']) ||
        typeof payload.revision !== 'number' || !Number.isSafeInteger(payload.revision) || payload.revision < 1 ||
        typeof payload.source !== 'string') {
      this.sendRejection(client, 'clientScriptResult', {
        currentRevision: this.scriptRevision,
        result: 'rejected',
        reason: 'malformed',
      });
      return;
    }
    if (payload.revision <= this.scriptRevision) {
      this.sendRejection(client, 'clientScriptResult', {
        revision: payload.revision,
        currentRevision: this.scriptRevision,
        result: 'rejected',
        reason: 'stale',
      });
      return;
    }
    if (payload.revision !== this.scriptRevision + 1) {
      this.sendRejection(client, 'clientScriptResult', {
        revision: payload.revision,
        currentRevision: this.scriptRevision,
        result: 'rejected',
        reason: 'revision-gap',
      });
      return;
    }
    const now = Date.now();
    const lastAt = this.lastPublishAttemptAt.get(client.sessionId) ?? 0;
    if (now - lastAt < CLIENT_SCRIPT_PUBLISH_INTERVAL_MS) {
      this.sendRejection(client, 'clientScriptResult', {
        revision: payload.revision,
        currentRevision: this.scriptRevision,
        result: 'rejected',
        reason: 'rate-limit',
      });
      return;
    }
    this.lastPublishAttemptAt.set(client.sessionId, now);
    const result = validateAndCompileClientScript(payload.source);
    if (!result.ok) {
      this.sendRejection(client, 'clientScriptResult', {
        revision: payload.revision,
        currentRevision: this.scriptRevision,
        result: 'rejected',
        reason: 'invalid-script',
        diagnostics: result.diagnostics,
      });
      return;
    }

    this.scriptRevision = payload.revision;
    this.scriptSource = payload.source;
    this.scriptJavascript = result.javascript;
    this.broadcast('clientScriptSnapshot', {
      revision: this.scriptRevision,
      source: this.scriptSource,
      javascript: this.scriptJavascript,
    });
    this.broadcast('clientScriptResult', { revision: this.scriptRevision, result: 'accepted' });
  }

  private sendRejection(client: Client, type: string, payload: unknown): void {
    const now = Date.now();
    let lastByType = this.lastRejectionAt.get(client.sessionId);
    if (lastByType === undefined) {
      lastByType = new Map<string, number>();
      this.lastRejectionAt.set(client.sessionId, lastByType);
    }
    const lastAt = lastByType.get(type);
    if (lastAt !== undefined && now - lastAt < CLIENT_REJECTION_MIN_INTERVAL_MS) return;
    lastByType.set(type, now);
    client.send(type, payload);
  }

  private simulate(): void {
    this.activeRules.onTick?.(SIMULATION_STEP_SECONDS, INTERNAL_RULE_CONTEXT);
    const distance = this.movementSpeed * SIMULATION_STEP_SECONDS;
    for (const [sessionId, player] of this.state.players) {
      const input = this.movementBySession.get(sessionId);
      if (input === undefined) continue;
      const next = clampPlayerPosition(player.x + input.x * distance, player.y + input.y * distance);
      player.x = next.x;
      player.y = next.y;
    }
  }

  private playerName(value: unknown, index: number): string {
    if (typeof value !== 'string') return `Player ${index + 1}`;
    const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
    return name.length === 0 ? `Player ${index + 1}` : name;
  }

  /** Test and dev inspection surface for the currently accepted room code. */
  getClientScriptSnapshot(): { readonly revision: number; readonly source: string; readonly javascript: string } {
    return { revision: this.scriptRevision, source: this.scriptSource, javascript: this.scriptJavascript };
  }

  replaceRules(rules: SandboxRules): void {
    this.activeRules = rules;
  }

  getRulePlayerSnapshots(): readonly PlayerSnapshot[] {
    const snapshots: PlayerSnapshot[] = [];
    for (const [sessionId, player] of this.state.players) snapshots.push(this.snapshotPlayer(sessionId, player));
    return snapshots;
  }

  applyRuleCommands(commands: readonly RuleCommand[]): void {
    for (const command of commands) {
      if (command.type === 'set-movement-speed' &&
          (!Number.isFinite(command.value) || command.value < 30 || command.value > 360)) {
        throw new RangeError('Movement speed command is outside the supported range.');
      }
      if (command.type === 'broadcast-json') {
        if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(command.event) || !isJsonValue(command.payload) ||
            Buffer.byteLength(JSON.stringify(command.payload), 'utf8') > MAX_RULE_MESSAGE_BYTES) {
          throw new TypeError('Broadcast command is not valid bounded JSON.');
        }
      }
    }
    for (const command of commands) {
      if (command.type === 'set-movement-speed') this.movementSpeed = command.value;
      else this.broadcast(command.event, command.payload);
    }
  }

  reportRuleError(message: string): void {
    console.error(`[sandbox room ${this.ruleRoomId}] ${message}`);
  }

  private snapshotPlayer(sessionId: string, player: SandboxPlayerState): PlayerSnapshot {
    return Object.freeze({
      sessionId,
      name: player.name,
      x: player.x,
      y: player.y,
      hue: player.hue,
    });
  }

}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, depth + 1));
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
}
