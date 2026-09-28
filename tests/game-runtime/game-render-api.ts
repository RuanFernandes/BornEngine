import { Game } from '../../src/core/game';

class SceneDrawingGame extends Game {
  protected render(): void {
    super.render();
  }
}

const game = new SceneDrawingGame({ window: { mode: 'embedded' } });
game.dispose();
