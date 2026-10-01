import process from 'node:process';
import {
  ColyseusClient,
  Colors,
  Game,
  GameComponent,
  GameObject,
  Key,
  ParticleEmitter2D,
  Renderer,
  Scene,
  ScriptComponent,
  SpriteSheet,
  Vector2D,
  Viewport2D,
} from '@bornengine/engine';
import type { Color, Room, SpriteFrame } from '@bornengine/engine';
import { MovementInputThrottle, ROOM_HEIGHT, ROOM_WIDTH } from '../server/src/protocol.js';

const WORLD_WIDTH = ROOM_WIDTH;
const WORLD_HEIGHT = ROOM_HEIGHT;
const SERVER_SCRIPT_LIMIT = 64 * 1024;
const CLIENT_SCRIPT_LIMIT = 128 * 1024;
const LOCAL_COLOR: Color = { r: 166, g: 235, b: 100, a: 255 };
const REMOTE_COLOR: Color = { r: 83, g: 176, b: 247, a: 255 };

function endpointFromArgs(): string {
  for (let index = 2; index + 1 < process.argv.length; index++) {
    if (process.argv[index] === '--endpoint') return process.argv[index + 1];
  }
  return 'ws://127.0.0.1:2568';
}

class SandboxField extends GameComponent {
  override render(renderer: Renderer): void {
    if (!this.isActiveAndEnabled) return;
    renderer.drawRectangle(
      { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT },
      { r: 20, g: 31, b: 42, a: 255 },
    );
    renderer.drawRectangleOutline(
      { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT },
      { r: 66, g: 95, b: 112, a: 255 },
      2,
    );
  }
}

class PlayerMarker extends GameComponent {
  constructor(private readonly color: Color) {
    super();
    this.renderOrder = 10;
  }

  override render(renderer: Renderer): void {
    if (!this.isActiveAndEnabled || this.gameObject === null) return;
    const position = this.gameObject.transform.worldPosition;
    const center = new Vector2D(position.x, position.y);
    renderer.drawCircle(center, 13, this.color);
    renderer.drawCircleOutline(center, 13, Colors.WHITE);
  }
}

class SandboxScene extends Scene {
  constructor(game: Game) {
    super(game, { name: 'Scripting Sandbox' });
    this.viewport2D = new Viewport2D({ width: WORLD_WIDTH, height: WORLD_HEIGHT, mode: 'fit' });
    const field = new GameObject({ name: 'Arena' });
    field.addComponent(new SandboxField());
    this.addNode(field);
  }
}

class SandboxClientGame extends Game {
  private network: ColyseusClient | null = null;
  private gameplayRoom: Room<any> | null = null;
  private scriptingRoom: Room<any> | null = null;
  private scene: SandboxScene | null = null;
  private stateDisposer: (() => void) | null = null;
  private readonly playerIds: string[] = [];
  private readonly playerNodes: GameObject[] = [];
  private localSessionId = '';
  private localPlayer: GameObject | null = null;
  private activeScript: ScriptComponent | null = null;
  private currentScriptRevision = -1;
  private pendingScriptPayload: any = null;
  private particleFrame: SpriteFrame | null = null;
  private readonly inputThrottle = new MovementInputThrottle();
  private status = 'Connecting to Colyseus…';
  private sequence = 0;

  constructor(private readonly endpoint: string) {
    super({
      window: { title: 'BornEngine · Scripting Sandbox', width: 1000, height: 640 },
      targetFps: 60,
    });
  }

  protected override onStart(): void {
    const scene = new SandboxScene(this);
    this.scene = scene;
    if (this.scenes.changeTo(scene) === false) {
      this.status = 'Could not activate the sandbox scene.';
      return;
    }
    this.loadParticleFrame();

    const network = new ColyseusClient(this, this.endpoint);
    this.network = network;
    if (network.error !== null) {
      this.status = `Network error: ${network.error}`;
      return;
    }

    const started = network.joinOrCreateWithCallbacks('sandbox', { name: 'Native Player' }, {
      onJoin: (room) => this.onGameplayJoined(room),
      onError: (error) => { this.status = `Could not join gameplay: ${error.message}`; },
    });
    if (!started) this.status = network.error || 'Could not start gameplay room join.';
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
    const room = this.gameplayRoom;
    if (room === null || !room.isConnected) return;

    let x = 0;
    let y = 0;
    if (this.input.isKeyDown(Key.A) || this.input.isKeyDown(Key.LEFT)) x -= 1;
    if (this.input.isKeyDown(Key.D) || this.input.isKeyDown(Key.RIGHT)) x += 1;
    if (this.input.isKeyDown(Key.W) || this.input.isKeyDown(Key.UP)) y -= 1;
    if (this.input.isKeyDown(Key.S) || this.input.isKeyDown(Key.DOWN)) y += 1;
    const movement = Vector2D.clampMagnitude(new Vector2D(x, y), 1);

    if (this.inputThrottle.update(deltaTime, movement)) {
      room.send('input', { sequence: this.sequence++, x: movement.x, y: movement.y });
    }
  }

  protected override render(): void {
    this.renderer.clear({ r: 13, g: 22, b: 32, a: 255 });
    super.render();
    this.renderer.drawText('WASD / arrows: move · scripts run locally in QuickJS', new Vector2D(18, 14), 18, Colors.WHITE);
    this.renderer.drawText(this.status, new Vector2D(18, 40), 15, Colors.LIGHTGRAY);
    this.renderer.drawText(`Script revision: ${Math.max(0, this.currentScriptRevision)} · players: ${this.playerIds.length}`, new Vector2D(18, 62), 15, Colors.LIGHTGRAY);
  }

  protected override onStop(): void {
    if (this.stateDisposer !== null) this.stateDisposer();
    this.stateDisposer = null;
    if (this.gameplayRoom !== null) this.gameplayRoom.leave();
    if (this.scriptingRoom !== null) this.scriptingRoom.leave();
    this.gameplayRoom = null;
    this.scriptingRoom = null;
    if (this.network !== null) this.network.dispose();
    this.network = null;
    if (this.activeScript !== null) this.activeScript.dispose();
    this.activeScript = null;
  }

  private loadParticleFrame(): void {
    const texture = this.assets.loadTexture('assets/particle.png');
    if (texture === null || !texture.isLoaded) return;
    const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16 });
    if (sheet.error !== null) return;
    this.particleFrame = sheet.gridFrame(0, 0);
  }

  private onGameplayJoined(room: Room<any>): void {
    this.gameplayRoom = room;
    this.localSessionId = room.sessionId;
    this.status = `Connected · ${room.sessionId.slice(0, 8)} · joining scripting manager…`;
    this.stateDisposer = room.onStateChange((state: any) => this.syncPlayers(state));
    room.onMessage('inputAccepted', () => undefined);
    room.onMessage('inputRejected', (message: any) => {
      this.status = `Movement rejected: ${String(message.reason || 'invalid input')}`;
    });
    room.onLeave((_code, reason) => {
      this.status = `Gameplay disconnected: ${reason || 'room closed'}`;
    });
    this.syncPlayers(room.state);

    const network = this.network;
    if (network === null) return;
    const started = network.joinOrCreateWithCallbacks('scripting-manager', {}, {
      onJoin: (managerRoom) => this.onScriptingManagerJoined(managerRoom),
      onError: (error) => { this.status = `Scripting manager error: ${error.message}`; },
    });
    if (!started) this.status = network.error || 'Could not start scripting manager join.';
  }

  private onScriptingManagerJoined(room: Room<any>): void {
    this.scriptingRoom = room;
    room.onMessage('clientScriptSnapshot', (payload: any) => this.applyScriptRevision(payload));
    room.onMessage('clientScriptReload', (payload: any) => this.applyScriptRevision(payload));
    room.onLeave((_code, reason) => {
      this.status = `Scripting manager disconnected: ${reason || 'room closed'}`;
    });
    room.send('requestClientScriptSnapshot', {});
    this.status = `Connected · ${this.localSessionId.slice(0, 8)} · awaiting scripts`;
  }

  private applyScriptRevision(value: any): void {
    const pendingRevision = this.pendingScriptPayload === null ? -1 : this.pendingScriptPayload.revision;
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 ||
        value.revision <= this.currentScriptRevision || value.revision <= pendingRevision ||
        typeof value.source !== 'string' || typeof value.javascript !== 'string' ||
        value.source.length > SERVER_SCRIPT_LIMIT || value.javascript.length > CLIENT_SCRIPT_LIMIT) return;

    if (value.javascript.length === 0) {
      this.currentScriptRevision = value.revision;
      return;
    }
    const host = this.localPlayer;
    if (host === null) {
      this.pendingScriptPayload = value;
      this.status = `Revision ${value.revision} received before local player setup.`;
      return;
    }

    const candidate = new ScriptComponent(this.scripting, value.javascript, {
      permissions: ['log', 'self.read', 'self.transform.write', 'self.particles.emit'],
    });
    if (candidate.status !== 'ready') {
      this.status = `Revision ${value.revision} rejected locally: ${candidate.error || candidate.status}`;
      candidate.dispose();
      return;
    }
    if (host.addComponent(candidate) === null) {
      this.status = `Revision ${value.revision} could not attach to the local player.`;
      candidate.dispose();
      return;
    }
    candidate.onStart();
    if (candidate.status !== 'running') {
      this.status = `Revision ${value.revision} rejected locally: ${candidate.error || 'client script initialization failed'}`;
      host.removeComponent(candidate);
      return;
    }

    const previous = this.activeScript;
    this.activeScript = candidate;
    if (previous !== null) host.removeComponent(previous);
    this.currentScriptRevision = value.revision;
    this.pendingScriptPayload = null;
    this.status = `Running shared script revision ${value.revision}`;
  }

  private syncPlayers(state: any): void {
    const players = state === null || state === undefined ? null : state.players;
    if (players === null || typeof players !== 'object' || this.scene === null) return;
    const visibleIds = Object.keys(players);

    for (let index = this.playerIds.length - 1; index >= 0; index--) {
      if (visibleIds.indexOf(this.playerIds[index]) >= 0) continue;
      const node = this.playerNodes[index];
      this.scene.remove(node);
      if (node === this.localPlayer) {
        this.localPlayer = null;
        this.activeScript = null;
      }
      this.playerIds.splice(index, 1);
      this.playerNodes.splice(index, 1);
    }

    for (const sessionId of visibleIds) {
      const player = players[sessionId];
      if (player === null || typeof player !== 'object' ||
          typeof player.x !== 'number' || typeof player.y !== 'number') continue;
      let index = this.playerIds.indexOf(sessionId);
      if (index < 0) {
        const node = new GameObject({ name: sessionId === this.localSessionId ? 'Local player' : `Player ${sessionId.slice(0, 8)}` });
        node.addComponent(new PlayerMarker(sessionId === this.localSessionId ? LOCAL_COLOR : REMOTE_COLOR));
        if (this.scene.addNode(node) === null) continue;
        this.playerIds.push(sessionId);
        this.playerNodes.push(node);
        index = this.playerIds.length - 1;
        if (sessionId === this.localSessionId) {
          this.localPlayer = node;
          this.attachParticleEmitter(node);
        }
      }
      const position = this.playerNodes[index].transform.position;
      position.x = player.x;
      position.y = player.y;
      position.z = 0;
    }

    if (this.localPlayer !== null && this.pendingScriptPayload !== null) {
      const pending = this.pendingScriptPayload;
      this.pendingScriptPayload = null;
      this.applyScriptRevision(pending);
    }
  }

  private attachParticleEmitter(player: GameObject): void {
    const frame = this.particleFrame;
    if (frame === null) return;
    const particles = new ParticleEmitter2D({
      frames: [frame],
      capacity: 128,
      shape: { type: 'circle', radius: 3 },
      lifetime: { min: 0.2, max: 0.6 },
      speed: { min: 28, max: 96 },
      startSize: { min: 4, max: 8 },
      endSize: { min: 0, max: 2 },
      startColor: { r: 166, g: 235, b: 100, a: 245 },
      endColor: { r: 72, g: 165, b: 96, a: 0 },
      direction: { x: 0, y: -1 },
      space: 'local',
    });
    particles.renderOrder = -1;
    if (player.addComponent(particles) === null || !particles.isLoaded) {
      this.status = particles.error || 'Local particle emitter could not be created.';
    }
  }
}

new SandboxClientGame(endpointFromArgs()).run();
