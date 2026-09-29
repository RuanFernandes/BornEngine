import { ColyseusClient, Colors, Game, Matrix4 } from '@bornengine/engine';
import type { Room } from '@bornengine/engine';

declare const process: { argv: string[]; exit(code: number): never };

let endpoint = 'ws://127.0.0.1:2567';
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--endpoint' && index + 1 < process.argv.length) {
    endpoint = process.argv[index + 1];
  }
}

class ColyseusSmokeGame extends Game {
  private client: ColyseusClient | null = null;
  private room: Room<any> | null = null;
  private elapsed = 0;
  private state = 'connecting';
  private errorMessage = '';
  private receivedEcho = false;
  private receivedState = false;
  private receivedBytes = false;
  private requestStarted = false;
  private requestPassed = false;
  private leaveStarted = false;
  private finished = false;
  private failed = false;

  get exitCode(): number { return this.failed ? 1 : 0; }

  protected override onStart(): void {
    const identity = Matrix4.identity();
    const staticProduct = Matrix4.multiplyMatrices(identity, identity);
    const instanceProduct = identity.multiply(identity);
    if (staticProduct.elements[0] !== 1 || instanceProduct.elements[0] !== 1) {
      this.fail('Matrix4 multiplication smoke test failed');
      return;
    }

    this.client = new ColyseusClient(this, endpoint);
    if (this.client.error !== null) {
      this.fail(this.client.error);
      return;
    }

    this.client.joinOrCreate('test_room', { name: 'BornEngine' }).then(
      (room) => this.onJoined(room),
      (error) => this.fail(String(error)),
    );
  }

  protected override loop(deltaTime: number): void {
    this.elapsed += deltaTime;
    if (!this.finished && this.elapsed > 20) {
      this.fail('Timed out waiting for the Colyseus smoke contract');
      return;
    }

    const room = this.room;
    if (room === null || this.failed || this.finished) return;
    if (!this.requestStarted && this.receivedEcho && this.receivedState && this.receivedBytes) {
      this.requestStarted = true;
      this.state = 'checking request/reply';
      room.request<number>('request_sum', { a: 9, b: 33 }).then(
        (value) => {
          if (value !== 42) {
            this.fail('Colyseus request/reply smoke test failed');
            return;
          }
          this.requestPassed = true;
        },
        (error) => this.fail(String(error)),
      );
    }

    if (this.requestPassed && !this.leaveStarted) {
      this.leaveStarted = true;
      this.state = 'leaving room';
      room.leave().then(
        () => {
          this.finished = true;
          this.state = 'passed';
          this.stop();
        },
        (error) => this.fail(String(error)),
      );
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawText('BornEngine Colyseus Smoke Test', { x: 12, y: 12 }, 18, Colors.WHITE);
    this.renderer.drawText('Server: ' + endpoint, { x: 12, y: 42 }, 14, Colors.LIGHTGRAY);
    this.renderer.drawText('Status: ' + this.state, { x: 12, y: 66 }, 14, this.failed ? Colors.RED : Colors.GREEN);
    if (this.errorMessage.length > 0) {
      this.renderer.drawText(this.errorMessage, { x: 12, y: 94 }, 12, Colors.RED);
    }
  }

  protected override onStop(): void {
    if (this.client !== null) this.client.dispose();
    if (this.finished) console.log('Colyseus TypeScript smoke test passed');
  }

  private onJoined(room: Room<any>): void {
    if (this.failed) return;
    this.room = room;
    this.state = 'checking messages and state';
    room.onMessage('echo', (message: { value?: string }) => {
      if (message.value === 'native-sdk') this.receivedEcho = true;
    });
    room.onStateChange((state: { counter?: number; lastBytes?: string }) => {
      if (state.counter === 3) this.receivedState = true;
      if (state.lastBytes === '1,2,3,255') this.receivedBytes = true;
    });
    room.send('echo', { value: 'native-sdk' });
    room.send('increment', { amount: 3 });
    room.sendBytes('bytes', new Uint8Array([1, 2, 3, 255]));
  }

  private fail(message: string): void {
    if (this.failed || this.finished) return;
    this.failed = true;
    this.errorMessage = message;
    this.state = 'failed';
    console.error('Colyseus TypeScript smoke test failed: ' + message);
    this.stop();
  }
}

const game = new ColyseusSmokeGame({
  window: { width: 480, height: 180, title: 'BornEngine Colyseus Smoke Test' },
  targetFps: 60,
});
game.run().then(() => {
  if (game.exitCode !== 0) process.exit(game.exitCode);
});
