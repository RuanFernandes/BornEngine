export default {
  onStart(ctx) {
    ctx.log('Player module started at x=' + ctx.self.position.x);
    ctx.particles.emitBurst(14, 1, -0.2);
  },
  update(ctx, deltaTime) {
    if (ctx.self.position.x >= 700) {
      ctx.self.setPosition(100, 220, 0);
    } else {
      ctx.self.moveBy(52 * deltaTime, 0, 0);
    }
  },
  onDestroy(ctx) {
    ctx.log('Player module stopped');
  },
};
