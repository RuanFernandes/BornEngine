export function createRules(): SandboxRules {
  let elapsed = 0;

  return {
    onPlayerJoin(player, context) {
      context.log(`${player.name} joined the sandbox`);
      context.setMovementSpeed(220);
      context.broadcastJson('sandbox:welcome', { name: player.name });
    },

    onTick(deltaTime, context) {
      elapsed += deltaTime;
      if (elapsed >= 30) {
        context.broadcastJson('sandbox:status', { activePlayers: context.players().length });
        elapsed = 0;
      }
    },
  };
}
