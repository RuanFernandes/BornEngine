import type { ValidatedMoveInput } from '../protocol.js';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface PlayerSnapshot {
  readonly sessionId: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly hue: number;
}

export interface SandboxRuleContext {
  log(message: string): void;
  players(): readonly PlayerSnapshot[];
  setMovementSpeed(unitsPerSecond: number): void;
  broadcastJson(event: string, payload: JsonValue): void;
}

export interface SandboxRules {
  onPlayerJoin?(player: PlayerSnapshot, context: SandboxRuleContext): void;
  onPlayerLeave?(player: PlayerSnapshot, context: SandboxRuleContext): void;
  onInput?(player: PlayerSnapshot, input: ValidatedMoveInput, context: SandboxRuleContext): void;
  onMessage?(player: PlayerSnapshot, event: string, payload: JsonValue, context: SandboxRuleContext): void;
  onTick?(deltaTime: number, context: SandboxRuleContext): void;
}

export type RuleHookName = keyof SandboxRules;

export type RuleCommand =
  | { readonly type: 'set-movement-speed'; readonly value: number }
  | { readonly type: 'broadcast-json'; readonly event: string; readonly payload: JsonValue };

export interface ActiveRuleRoom {
  readonly ruleRoomId: string;
  replaceRules(rules: SandboxRules): void;
  getRulePlayerSnapshots(): readonly PlayerSnapshot[];
  applyRuleCommands(commands: readonly RuleCommand[]): void;
  reportRuleError(message: string): void;
}
