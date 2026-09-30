import * as monaco from 'monaco-editor/editor/editor.api';

export const CLIENT_MODEL_URI = monaco.Uri.parse('inmemory://bornengine/client.ts');

export const CLIENT_STARTER = `let particleTimer = 1.2;

export default {
  onStart(ctx: BornEngineScriptContext) {
    const x = ctx.self.position?.x ?? 0;
    ctx.log?.('Client behavior ready at x=' + x);
    ctx.particles?.emitBurst(12, 0, -1);
  },

  update(ctx: BornEngineScriptContext, dt: number) {
    particleTimer -= dt;
    if (particleTimer <= 0) {
      ctx.particles?.emitBurst(4, 0, -1);
      particleTimer = 1.2;
    }
  },
} satisfies BornEngineScriptBehavior;
`;

export function createClientModel(source = CLIENT_STARTER): monaco.editor.ITextModel {
  return monaco.editor.createModel(source, 'typescript', CLIENT_MODEL_URI);
}
