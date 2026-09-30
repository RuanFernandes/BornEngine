interface BornEngineScriptContext {
  readonly self: {
    readonly id?: string;
    readonly position?: Readonly<{ x: number; y: number; z: number }>;
  };
  readonly particles?: {
    emitBurst(count: number, directionX?: number, directionY?: number): void;
  };
  log?(message: string): void;
}

interface BornEngineScriptBehavior {
  onStart?(context: BornEngineScriptContext): void;
  update?(context: BornEngineScriptContext, deltaTime: number): void;
  onDestroy?(context: BornEngineScriptContext): void;
}
