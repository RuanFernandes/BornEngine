interface SandboxRulePlayer {
  readonly sessionId: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly hue: number;
}

interface SandboxRuleInput {
  readonly sequence: number;
  readonly x: number;
  readonly y: number;
}

type SandboxRuleJson = null | boolean | number | string | readonly SandboxRuleJson[] | {
  readonly [key: string]: SandboxRuleJson;
};

interface SandboxRuleContext {
  log(message: string): void;
  players(): readonly SandboxRulePlayer[];
  setMovementSpeed(unitsPerSecond: number): void;
  broadcastJson(event: string, payload: SandboxRuleJson): void;
}

interface SandboxRules {
  onPlayerJoin?(player: SandboxRulePlayer, context: SandboxRuleContext): void;
  onPlayerLeave?(player: SandboxRulePlayer, context: SandboxRuleContext): void;
  onInput?(player: SandboxRulePlayer, input: SandboxRuleInput, context: SandboxRuleContext): void;
  onMessage?(player: SandboxRulePlayer, event: string, payload: SandboxRuleJson, context: SandboxRuleContext): void;
  onTick?(deltaTime: number, context: SandboxRuleContext): void;
}
