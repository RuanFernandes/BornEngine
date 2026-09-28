import { Game } from '../../src/core/game';
import type { GameDebugOptions } from '../../src/core/game';

const inspectorOptions: GameDebugOptions = {
  enabled: true,
  metrics: true,
  sceneHierarchy: true,
  assets: false,
};

/** Compile fixture for the public Game-level inspector options. */
export function createInspectorEnabledGame(): Game {
  return new Game({ debug: inspectorOptions });
}

/** Boolean shorthand should compile for local development builds. */
export function createInspectorShorthandGame(): Game {
  return new Game({ debug: true });
}
