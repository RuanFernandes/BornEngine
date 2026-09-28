import type { Game } from '../../src/core/game';
import type { RendererStats } from '../../src/core/renderer';
import type { AssetManager } from '../../src/assets/asset-manager';
import type { PhysicsWorld2D } from '../../src/physics2d/physics-world-2d';
import type { Tilemap } from '../../src/tilemap/tilemap';

/** Compile fixture for the root Game systems wired into the public API. */
export function publicGameSystems(
  game: Game,
  assets: AssetManager,
  physics: PhysicsWorld2D,
  map: Tilemap,
): number {
  const cached = game.assets === assets ? assets.textureCount : -1;
  const bodies = physics.bodyCount;
  const visibleTiles = map.tileCount;
  const submitted = game.renderer.stats.spritesDrawn;
  const stats: RendererStats = game.renderer.stats;
  return cached + bodies + visibleTiles + submitted + stats.drawSubmissions2D;
}
