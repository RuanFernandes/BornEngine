import { Game } from '@bornengine/engine';

class LifecycleGame extends Game {
  readonly events: string[] = [];

  protected override onStart(): void {
    this.events.push('start');
  }

  protected override loop(_deltaTime: number): void {
    this.events.push('loop');
    this.stop();
  }

  protected override render(): void {
    this.events.push('render');
  }

  protected override onStop(): void {
    this.events.push('stop');
  }
}

const game = new LifecycleGame({
  window: { width: 160, height: 90, title: 'BornEngine lifecycle smoke test' },
});
game.run();

const expected = ['start', 'loop', 'render', 'stop'];
for (let index = 0; index < expected.length; index++) {
  if (game.events[index] !== expected[index]) {
    throw new Error(`Lifecycle hook order mismatch at ${index}: ${game.events.join(', ')}`);
  }
}
if (game.events.length !== expected.length || !game.isDisposed || game.isRunning) {
  throw new Error('Subclass lifecycle did not dispose the Game after onStop.');
}

console.log('Game subclass native lifecycle smoke test passed');
