import { GameComponent } from '../game/game-component';
import type { GameContext } from '../core/context';
import type { Vec3 } from '../core/types';
import * as scriptOperations from './internal';
import type { ScriptRuntime } from './script-runtime';

interface ScriptParticleBurstReceiver {
  _receiveScriptParticleBurst(count: number, directionX: number, directionY: number): void;
}

export type ScriptPermission = 'log' | 'self.read' | 'self.transform.write' | 'self.particles.emit';

export interface ScriptLimits {
  maxMemoryBytes: number;
  maxStackBytes: number;
  maxInterruptChecks: number;
}

export type ScriptStatus = 'ready' | 'running' | 'error' | 'unsupported' | 'disposed';

export interface ScriptComponentOptions {
  /** Capabilities are denied unless explicitly listed here. */
  permissions?: readonly ScriptPermission[];
  /** Guest heap, call stack, and execution-interrupt budgets. */
  limits?: Partial<ScriptLimits>;
}

/**
 * The value passed to the guest module's hooks. The native runtime constructs
 * this object per callback and installs only methods allowed by permissions.
 */
export interface ScriptContext {
  readonly self: {
    readonly id?: string;
    readonly position?: Readonly<Vec3>;
    setPosition?(x: number, y: number, z: number): void;
    moveBy?(x: number, y: number, z: number): void;
  };
  log?(message: string): void;
  readonly particles?: {
    emitBurst?(count: number, directionX?: number, directionY?: number): void;
  };
}

export const DEFAULT_SCRIPT_LIMITS: ScriptLimits = {
  maxMemoryBytes: 16 * 1024 * 1024,
  maxStackBytes: 256 * 1024,
  maxInterruptChecks: 10_000,
};

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const MAX_STACK_BYTES = 256 * 1024;
const MAX_INTERRUPT_CHECKS = 1_000_000;

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function normalizedLimits(options?: Partial<ScriptLimits>): ScriptLimits | null {
  const source = options === null || options === undefined ? {} : options;
  const maxMemoryBytes =
    source.maxMemoryBytes === undefined ? DEFAULT_SCRIPT_LIMITS.maxMemoryBytes : source.maxMemoryBytes;
  const maxStackBytes = source.maxStackBytes === undefined ? DEFAULT_SCRIPT_LIMITS.maxStackBytes : source.maxStackBytes;
  const maxInterruptChecks =
    source.maxInterruptChecks === undefined ? DEFAULT_SCRIPT_LIMITS.maxInterruptChecks : source.maxInterruptChecks;
  if (
    !finite(maxMemoryBytes) ||
    Math.floor(maxMemoryBytes) !== maxMemoryBytes ||
    maxMemoryBytes < 64 * 1024 ||
    maxMemoryBytes > MAX_MEMORY_BYTES
  )
    return null;
  if (
    !finite(maxStackBytes) ||
    Math.floor(maxStackBytes) !== maxStackBytes ||
    maxStackBytes < 16 * 1024 ||
    maxStackBytes > MAX_STACK_BYTES
  )
    return null;
  if (
    !finite(maxInterruptChecks) ||
    Math.floor(maxInterruptChecks) !== maxInterruptChecks ||
    maxInterruptChecks < 1 ||
    maxInterruptChecks > MAX_INTERRUPT_CHECKS
  )
    return null;
  return { maxMemoryBytes, maxStackBytes, maxInterruptChecks };
}

function permissionMask(permissions?: readonly ScriptPermission[]): number | null {
  const source = permissions === null || permissions === undefined ? [] : permissions;
  if (!Array.isArray(source)) return null;
  let mask = 0;
  for (let index = 0; index < source.length; index++) {
    switch (source[index]) {
      case 'log':
        mask |= 1;
        break;
      case 'self.read':
        mask |= 2;
        break;
      case 'self.transform.write':
        mask |= 4;
        break;
      case 'self.particles.emit':
        mask |= 8;
        break;
      default:
        return null;
    }
  }
  return mask;
}

/** A self-contained JavaScript behavior attached to one GameObject. */
export class ScriptComponent extends GameComponent {
  readonly runtime: ScriptRuntime;
  readonly source: string;
  private handleValue = 0;
  private statusValue: ScriptStatus = 'error';
  private errorValue: string | null = null;
  private started = false;
  private disposed = false;
  private lastCallbackMsValue = 0;
  private memoryUsedValue = 0;

  constructor(runtime: ScriptRuntime, source: string, options: ScriptComponentOptions = {}) {
    super();
    this.runtime = runtime;
    this.source = typeof source === 'string' ? source : '';

    if (runtime === null || runtime === undefined || !runtime.isSupported) {
      this.fail(scriptOperations.scriptVmError(0) || 'Embedded JavaScript is not supported by this target.');
      this.statusValue = 'unsupported';
      return;
    }
    if (!runtime._register(this)) {
      this.fail('The owning Game is no longer available.');
      return;
    }
    if (typeof source !== 'string' || source.length === 0 || source.length > MAX_SOURCE_BYTES) {
      this.fail('Script source must be a non-empty string no larger than 1 MiB.');
      return;
    }
    const settings = options === null || options === undefined ? {} : options;
    const mask = permissionMask(settings.permissions);
    const limits = normalizedLimits(settings.limits);
    if (mask === null) {
      this.fail('Script permissions contain an unsupported capability.');
      return;
    }
    if (limits === null) {
      this.fail('Script limits are outside the supported memory, stack, or instruction bounds.');
      return;
    }

    let handle = 0;
    try {
      handle = scriptOperations.createScriptVm(mask, limits);
      if (!finite(handle) || handle <= 0 || Math.floor(handle) !== handle) {
        this.fail('Unable to create a JavaScript runtime for this component.');
        return;
      }
      this.handleValue = handle;
      if (!scriptOperations.loadScriptVm(handle, source)) {
        this.fail(scriptOperations.scriptVmError(handle) || 'Unable to load the JavaScript module.');
        scriptOperations.destroyScriptVm(handle);
        this.handleValue = 0;
        return;
      }
      this.statusValue = 'ready';
      this.memoryUsedValue = scriptOperations.scriptVmMemoryUsed(handle);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      if (handle > 0) scriptOperations.destroyScriptVm(handle);
      this.handleValue = 0;
    }
  }

  get status(): ScriptStatus {
    return this.statusValue;
  }
  get error(): string | null {
    return this.errorValue;
  }
  get lastCallbackMs(): number {
    return this.lastCallbackMsValue;
  }
  get memoryUsed(): number {
    return this.memoryUsedValue;
  }

  /** @internal Accept only the GameContext owned by this script runtime. */
  override _canAttachTo(context: GameContext): boolean {
    return this.handleValue !== 0 && !this.disposed && this.runtime._ownsContext(context);
  }

  override onStart(): void {
    if (this.handleValue === 0 || this.disposed || this.started) return;
    this.started = true;
    this.measureCallback(() => {
      const result = scriptOperations.startScriptVm(this.handleValue, this.selfId(), this.selfPosition());
      this.refreshStatus(result);
      this.applyCommands();
    });
  }

  override update(deltaTime: number): void {
    if (this.handleValue === 0 || this.disposed || !this.started || !this.isActiveAndEnabled || !finite(deltaTime))
      return;
    this.measureCallback(() => {
      const result = scriptOperations.updateScriptVm(
        this.handleValue,
        this.selfId(),
        this.selfPosition(),
        Math.max(0, Math.min(60, deltaTime)),
      );
      this.refreshStatus(result);
      this.applyCommands();
    });
  }

  /** Releases the guest VM. Safe before attachment and idempotent. */
  dispose(): void {
    this.release(true);
  }

  override onDestroy(): void {
    this.release(true);
  }

  /** @internal Releases detached components when their Game is disposed. */
  _disposeFromRuntime(): void {
    this.release(true);
  }

  private selfId(): string {
    const owner = this.gameObject;
    return owner === null ? '' : String(owner.id);
  }

  private selfPosition(): Vec3 {
    const owner = this.gameObject;
    return owner === null ? { x: 0, y: 0, z: 0 } : owner.transform.worldPosition;
  }

  private measureCallback(callback: () => void): void {
    const start = Date.now();
    try {
      callback();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
    this.lastCallbackMsValue = Math.max(0, Date.now() - start);
    if (this.handleValue !== 0) this.memoryUsedValue = scriptOperations.scriptVmMemoryUsed(this.handleValue);
  }

  private refreshStatus(nativeStatus: number): void {
    if (nativeStatus === 2 || scriptOperations.scriptVmStatus(this.handleValue) === 2) {
      this.fail(scriptOperations.scriptVmError(this.handleValue) || 'The guest script failed.');
      return;
    }
    if (this.statusValue !== 'disposed' && this.statusValue !== 'unsupported') {
      this.errorValue = null;
      this.statusValue = this.started ? 'running' : 'ready';
    }
  }

  private applyCommands(): void {
    const handle = this.handleValue;
    if (handle === 0) return;
    const count = Math.max(0, Math.min(1024, Math.floor(scriptOperations.scriptCommandCount(handle))));
    const owner = this.gameObject;
    try {
      for (let index = 0; index < count; index++) {
        const kind = scriptOperations.scriptCommandKind(handle, index);
        if (kind === 1) {
          console.log('[BornEngine script ' + this.selfId() + '] ' + scriptOperations.scriptCommandText(handle, index));
        } else if (kind === 2 && owner !== null) {
          owner.transform.setWorldPosition({
            x: scriptOperations.scriptCommandNumber(handle, index, 0),
            y: scriptOperations.scriptCommandNumber(handle, index, 1),
            z: scriptOperations.scriptCommandNumber(handle, index, 2),
          });
        } else if (kind === 3 && owner !== null) {
          const position = owner.transform.worldPosition;
          owner.transform.setWorldPosition({
            x: position.x + scriptOperations.scriptCommandNumber(handle, index, 0),
            y: position.y + scriptOperations.scriptCommandNumber(handle, index, 1),
            z: position.z + scriptOperations.scriptCommandNumber(handle, index, 2),
          });
        } else if (kind === 4 && owner !== null) {
          const components = owner._componentsSnapshot();
          for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
            const receiver = components[componentIndex] as GameComponent & Partial<ScriptParticleBurstReceiver>;
            if (typeof receiver._receiveScriptParticleBurst === 'function') {
              receiver._receiveScriptParticleBurst(
                scriptOperations.scriptCommandNumber(handle, index, 0),
                scriptOperations.scriptCommandNumber(handle, index, 1),
                scriptOperations.scriptCommandNumber(handle, index, 2),
              );
              break;
            }
          }
        }
      }
    } finally {
      scriptOperations.clearScriptCommands(handle);
    }
  }

  private release(runDestroyHook: boolean): void {
    if (this.disposed) return;
    this.disposed = true;
    const handle = this.handleValue;
    if (handle !== 0) {
      try {
        if (runDestroyHook && this.started) {
          const result = scriptOperations.disposeScriptVm(handle, this.selfId(), this.selfPosition());
          this.refreshStatus(result);
          this.applyCommands();
        }
      } catch (error) {
        this.fail(error instanceof Error ? error.message : String(error));
      } finally {
        scriptOperations.destroyScriptVm(handle);
        this.handleValue = 0;
      }
    }
    this.statusValue = 'disposed';
    this.runtime._unregister(this);
  }

  private fail(message: string): void {
    this.errorValue = message;
    this.statusValue = 'error';
  }
}
