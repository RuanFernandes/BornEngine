import './native-link';
import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { Renderer } from '../../src/core/renderer';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.001;
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: renderer test context is available');
  process.exit(1);
}
bindGameContext(game, context);

const renderer = new Renderer(game);
renderer._recordSpriteDrawn();
renderer._recordSpriteCulled();
renderer._beginFrame(0.02);
let stats = renderer.stats;
expect(close(stats.frameIntervalMs, 20) && close(stats.fps, 50) &&
  stats.spritesDrawn === 0 && stats.spritesCulled === 0,
  'each game frame updates timing and clears sprite counts when custom render skips the scene');

renderer._beginSceneRender();
renderer._recordSpriteDrawn();
renderer._recordSpriteCulled();
renderer._beginFrame(0.04);
stats = renderer.stats;
expect(close(stats.frameIntervalMs, 40) && close(stats.fps, 25) &&
  stats.spritesDrawn === 0 && stats.spritesCulled === 0,
  'next frame replaces timing and scene workload instead of retaining stale samples');

renderer.dispose();
context.dispose();
console.log('PASS: renderer frame statistics');
