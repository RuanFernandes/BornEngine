import { ColyseusClient, Colors, Game, Matrix4 } from '@bornengine/engine';
import type { Room } from '@bornengine/engine';

const endpoint = 'ws://127.0.0.1:2567';

class ColyseusSmokeGame extends Game {
  private client: ColyseusClient | null = null;
  private room: Room<any> | null = null;
  private elapsed = 0;
  private state = 'connecting';
  private errorMessage = '';
  private receivedEcho = false;
  private receivedState = false;
  private receivedBytes = false;
  private receivedMovement = false;
  private requestStarted = false;
  private requestPassed = false;
  private requestTimeoutStarted = false;
  private requestTimeoutPassed = false;
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

    const started = this.client.joinOrCreateWithCallbacks('test_room', { name: 'BornEngine' }, {
      onJoin: (room) => this.onJoined(room),
      onError: (error) => this.fail(String(error)),
    });
    if (!started) this.fail(this.client.error || 'Could not start Colyseus matchmaking.');
  }

  protected override loop(deltaTime: number): void {
    this.elapsed += deltaTime;
    if (!this.finished && this.elapsed > 20) {
      const activeRoom = this.room;
      this.fail('Timed out at ' + this.state +
        '; joined=' + (activeRoom !== null) +
        ', connected=' + (activeRoom !== null && activeRoom.isConnected) +
        ', echo=' + this.receivedEcho +
        ', state=' + this.receivedState +
        ', bytes=' + this.receivedBytes +
        ', movement=' + this.receivedMovement +
        ', request=' + this.requestPassed +
        ', requestTimeout=' + this.requestTimeoutPassed +
        ', leave=' + this.leaveStarted);
      return;
    }

    const room = this.room;
    if (room === null || this.failed || this.finished) return;
    if (!this.requestStarted && this.receivedEcho && this.receivedState &&
        this.receivedBytes && this.receivedMovement) {
      this.requestStarted = true;
      this.state = 'checking request/reply';
      room.requestWithCallbacks<number>('request_sum', { a: 9, b: 33 }, {
        onSuccess: (value) => {
          if (value !== 42) {
            this.fail('Colyseus request/reply smoke test failed');
            return;
          }
          this.requestPassed = true;
        },
        onError: (error) => this.fail(String(error)),
      });
    }

    if (this.requestPassed && !this.requestTimeoutStarted) {
      this.requestTimeoutStarted = true;
      this.state = 'checking request timeout';
      room.requestWithCallbacks<{ completed: boolean }>('request_delay', { delayMs: 500 }, {
        onSuccess: () => this.fail('Colyseus request timeout smoke test unexpectedly succeeded'),
        onError: (error) => {
          if (error.message !== 'Colyseus request timed out') {
            this.fail('Colyseus request timeout smoke test failed: ' + error.message);
            return;
          }
          this.requestTimeoutPassed = true;
        },
      }, { timeout: 100 });
    }

    if (this.requestTimeoutPassed && !this.leaveStarted) {
      this.leaveStarted = true;
      this.state = 'leaving room';
      room.onLeave(() => {
        this.finished = true;
        this.state = 'passed';
        this.stop();
      });
      room.leave();
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
    if (this.finished) console.log('COLYSEUS_NATIVE_SMOKE_PASSED: transport, state, and movement');
  }

  private onJoined(room: Room<any>): void {
    if (this.failed) return;
    this.room = room;
    this.state = 'checking messages and state';
    room.onMessage('echo', (message: { value?: string }) => {
      if (message.value === 'native-sdk') this.receivedEcho = true;
    });
    room.onStateChange((state: {
      counter?: number;
      lastBytes?: string;
      players?: Record<string, { x?: number; y?: number }>;
    }) => {
      if (state.counter === 3) this.receivedState = true;
      if (state.lastBytes === '1,2,3,255') this.receivedBytes = true;
      const localPlayer = state.players === undefined ? undefined : state.players[room.sessionId];
      if (localPlayer?.x === 123 && localPlayer.y === 45) this.receivedMovement = true;
    });
    room.send('echo', { value: 'native-sdk' });
    room.send('increment', { amount: 3 });
    room.sendBytes('bytes', new Uint8Array([1, 2, 3, 255]));
    room.send('move', { x: 123, y: 45 });
  }

  private fail(message: string): void {
    if (this.failed || this.finished) return;
    this.failed = true;
    this.errorMessage = message;
    this.state = 'failed';
    console.error('COLYSEUS_NATIVE_SMOKE_FAILED: ' + message);
    this.stop();
  }
}

const game = new ColyseusSmokeGame({
  window: { width: 480, height: 180, title: 'BornEngine Colyseus Smoke Test' },
  targetFps: 60,
  renderMode: '2d',
});
game.run().then(() => {
  if (game.exitCode !== 0) console.error('COLYSEUS_NATIVE_SMOKE_FAILED: game exited with code ' + game.exitCode);
});
