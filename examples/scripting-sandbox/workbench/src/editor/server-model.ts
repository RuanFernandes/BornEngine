import * as monaco from 'monaco-editor/editor/editor.api';

export const SERVER_STARTER = `export function createRules(): SandboxRules {
  let elapsed = 0;

  return {
    onPlayerJoin(player, context) {
      context.log(player.name + ' joined the sandbox');
      context.setMovementSpeed(220);
      context.broadcastJson('sandbox:welcome', { name: player.name });
    },

    onTick(dt, context) {
      elapsed += dt;
      if (elapsed >= 30) {
        context.broadcastJson('sandbox:status', { activePlayers: context.players().length });
        elapsed = 0;
      }
    },
  };
}
`;

export function createServerModel(name = 'rules.ts', source = SERVER_STARTER): monaco.editor.ITextModel {
  const uri = monaco.Uri.parse(`inmemory://bornengine/server/${encodeURIComponent(name)}`);
  return monaco.editor.createModel(source, 'typescript', uri);
}
