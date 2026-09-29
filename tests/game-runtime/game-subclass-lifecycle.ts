import { Colors, Game } from '../../src';
import type { EmbeddedFrameCallbacks } from '../../src';

declare const process: { exit(code: number): never };

function expect(value: boolean, message: string): void {
  if (!value) {
    console.error('Game lifecycle failure: ' + message);
    process.exit(1);
  }
}

class LifecycleGame extends Game {
  readonly events: string[] = [];
  startCount = 0;
  stopCount = 0;

  protected override onStart(): void {
    this.events.push('start');
    this.startCount++;
  }

  protected override loop(_deltaTime: number): void {
    this.events.push('loop');
  }

  protected override render(): void {
    this.events.push('render');
    this.renderer.clear(Colors.SNOW);
    super.render();
    this.stop();
  }

  protected override onStop(): void {
    this.events.push('stop');
    this.stopCount++;
  }
}

class FailingStartGame extends LifecycleGame {
  protected override onStart(): void {
    super.onStart();
    throw new Error('start hook failed');
  }
}

class FailingStopGame extends LifecycleGame {
  protected override onStop(): void {
    super.onStop();
    throw new Error('stop hook failed');
  }
}

class FailingLoopGame extends LifecycleGame {
  protected override loop(_deltaTime: number): void {
    throw new Error('loop hook failed');
  }
}

class FailingRenderGame extends LifecycleGame {
  protected override render(): void {
    throw new Error('render hook failed');
  }
}

export async function verifyStandaloneLifecycle(): Promise<void> {
  const game = new LifecycleGame({ window: { title: 'Lifecycle fixture', width: 64, height: 64 } });
  const completion: Promise<void> = game.run();
  await completion;
  expect(game.events.join(',') === 'start,loop,render,stop', 'hook order');
  expect(game.startCount === 1 && game.stopCount === 1, 'hooks run once');
  expect(game.isDisposed, 'completion follows cleanup');
  game.stop();
  game.dispose();
  expect(game.stopCount === 1 && game.isDisposed, 'stop and dispose are idempotent');
}

export async function verifyHookFailures(): Promise<void> {
  const startFailure = new FailingStartGame({ window: { width: 64, height: 64 } });
  await startFailure.run();
  expect(startFailure.error !== null && startFailure.error.indexOf('start hook failed') >= 0, 'start error stored');
  expect(startFailure.stopCount === 1 && startFailure.isDisposed, 'start failure completes shutdown');

  const stopFailure = new FailingStopGame({ window: { width: 64, height: 64 } });
  await stopFailure.run();
  expect(stopFailure.error !== null && stopFailure.error.indexOf('stop hook failed') >= 0, 'stop error stored');
  expect(stopFailure.stopCount === 1 && stopFailure.isDisposed, 'stop failure completes shutdown');

  const loopFailure = new FailingLoopGame({ window: { width: 64, height: 64 } });
  await loopFailure.run();
  expect(loopFailure.error !== null && loopFailure.error.indexOf('loop hook failed') >= 0, 'loop error stored');
  expect(loopFailure.stopCount === 1 && loopFailure.isDisposed, 'loop failure completes shutdown');

  const renderFailure = new FailingRenderGame({ window: { width: 64, height: 64 } });
  await renderFailure.run();
  expect(renderFailure.error !== null && renderFailure.error.indexOf('render hook failed') >= 0, 'render error stored');
  expect(renderFailure.stopCount === 1 && renderFailure.isDisposed, 'render failure completes shutdown');
}

export function verifyEmbeddedFrames(game: Game): void {
  let updates = 0;
  let renders = 0;
  let stops = 0;
  const callbacks: EmbeddedFrameCallbacks = {
    update: () => { updates++; },
    render: () => { renders++; },
    onStop: () => { stops++; },
  };
  expect(game.runFrame(1 / 60, callbacks), 'embedded frame continues');
  expect(updates === 1 && renders === 1, 'embedded callbacks run');
  game.stop();
  expect(!game.runFrame(1 / 60, callbacks), 'embedded frame stops');
  expect(stops === 1, 'embedded stop callback runs once');
  game.dispose();
}

verifyStandaloneLifecycle()
  .then(() => verifyHookFailures())
  .then(() => console.log('Game subclass lifecycle fixture passed'));
