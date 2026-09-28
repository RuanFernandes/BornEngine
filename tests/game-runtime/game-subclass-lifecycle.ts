import { Colors, Game, Texture } from '../../src';

class Undertale extends Game {
  private readonly player: Texture;

  constructor() {
    super({ window: { title: 'Undertale', width: 800, height: 450 } });
    this.player = new Texture(this, 'assets/player.png');
  }

  protected override onStart(): void {}

  protected override loop(_deltaTime: number): void {}

  protected override render(): void {
    this.renderer.clear(Colors.SNOW);
    if (this.player.isLoaded) this.player.draw({ x: 190, y: 200 });
  }

  protected override onStop(): void {}
}

export function startSubclassedGame(game: Undertale): void {
  game.run();
}
