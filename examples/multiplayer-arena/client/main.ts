import {
  ColyseusClient,
  Game,
  GameComponent,
  GameObject,
  Key,
  Renderer,
  Scene,
  Vector2D,
  Viewport2D,
} from "@bornengine/engine";
import type { Color } from "@bornengine/engine";

const SERVER_URL = "ws://127.0.0.1:2568";
const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 480;
const INPUT_INTERVAL = 0.05;

const COLORS = {
  background: { r: 13, g: 22, b: 32, a: 255 } as Color,
  field: { r: 25, g: 43, b: 56, a: 255 } as Color,
  border: { r: 83, g: 119, b: 135, a: 255 } as Color,
  local: { r: 149, g: 229, b: 93, a: 255 } as Color,
  remote: { r: 83, g: 176, b: 247, a: 255 } as Color,
  text: { r: 238, g: 243, b: 246, a: 255 } as Color,
};

class ArenaField extends GameComponent {
  override render(renderer: Renderer): void {
    if (!this.isActiveAndEnabled) return;
    renderer.drawRectangle({ x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }, COLORS.field);
    renderer.drawRectangleOutline({ x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }, COLORS.border, 2);
  }
}

class PlayerMarker extends GameComponent {
  private readonly color: Color;

  constructor(color: Color) {
    super();
    this.color = color;
    this.renderOrder = 10;
  }

  override render(renderer: Renderer): void {
    if (!this.isActiveAndEnabled || this.gameObject === null) return;
    const position = this.gameObject.transform.worldPosition;
    renderer.drawCircle(new Vector2D(position.x, position.y), 12, this.color);
    renderer.drawCircleOutline(new Vector2D(position.x, position.y), 12, COLORS.text);
  }
}

class ArenaScene extends Scene {
  constructor(game: Game) {
    super(game, { name: "Multiplayer Arena" });
    this.viewport2D = new Viewport2D({ width: WORLD_WIDTH, height: WORLD_HEIGHT, mode: "fit" });
    const field = new GameObject({ name: "Arena field" });
    field.addComponent(new ArenaField());
    this.addNode(field);
  }
}

class MultiplayerArenaGame extends Game {
  private scene: ArenaScene | null = null;
  private network: ColyseusClient | null = null;
  private room: any = null;
  private stateDisposer: (() => void) | null = null;
  private messageDisposers: Array<() => void> = [];
  private readonly playerIds: string[] = [];
  private readonly playerObjects: GameObject[] = [];
  private localSessionId = "";
  private status = "Connecting to the local arena…";
  private sequence = 0;
  private inputElapsed = 0;

  constructor() {
    super({
      window: { title: "BornEngine · Multiplayer Arena", width: 960, height: 640 },
      targetFps: 60,
    });
  }

  protected override onStart(): void {
    const scene = new ArenaScene(this);
    this.scene = scene;
    this.scenes.changeTo(scene);

    const network = new ColyseusClient(this, SERVER_URL);
    this.network = network;
    if (network.error !== null) {
      this.status = `Network error: ${network.error}`;
      return;
    }

    const started = network.joinOrCreateWithCallbacks("arena", { name: "Explorer" }, {
      onJoin: (room) => {
        this.room = room;
        this.localSessionId = room.sessionId;
        this.status = `Connected · ${room.sessionId.slice(0, 8)}`;
        this.stateDisposer = room.onStateChange((state: any) => this.syncPlayers(state));
        this.messageDisposers.push(room.onMessage("inputRejected", (message: any) => {
          this.status = `Input rejected: ${message.reason}`;
        }));
        this.messageDisposers.push(room.onError((error) => { this.status = `Room error: ${error.message}`; }));
        this.messageDisposers.push(room.onDrop((_code, reason) => {
          this.status = `Connection interrupted: ${reason || "waiting to reconnect"}`;
        }));
        this.messageDisposers.push(room.onReconnect(() => { this.status = "Reconnected to the arena"; }));
        this.messageDisposers.push(room.onLeave((_code, reason) => {
          this.status = `Disconnected: ${reason || "room closed"}`;
        }));
        this.syncPlayers(room.state);
      },
      onError: (error) => { this.status = `Could not join arena: ${error.message}`; },
    });
    if (!started) this.status = network.error || "Could not start the room join request.";
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
    const room = this.room;
    if (room === null || !room.isConnected) return;

    let x = 0;
    let y = 0;
    if (this.input.isKeyDown(Key.A) || this.input.isKeyDown(Key.LEFT)) x -= 1;
    if (this.input.isKeyDown(Key.D) || this.input.isKeyDown(Key.RIGHT)) x += 1;
    if (this.input.isKeyDown(Key.W) || this.input.isKeyDown(Key.UP)) y -= 1;
    if (this.input.isKeyDown(Key.S) || this.input.isKeyDown(Key.DOWN)) y += 1;
    const movement = Vector2D.clampMagnitude(new Vector2D(x, y), 1);

    this.inputElapsed += deltaTime;
    if (this.inputElapsed >= INPUT_INTERVAL) {
      this.inputElapsed = 0;
      this.sequence++;
      room.send("input", { x: movement.x, y: movement.y, sequence: this.sequence });
    }
  }

  protected override render(): void {
    this.renderer.clear(COLORS.background);
    super.render();
    this.renderer.drawText("WASD / arrows: move", new Vector2D(20, 16), 20, COLORS.text);
    this.renderer.drawText(this.status, new Vector2D(20, 42), 16, COLORS.text);
    this.renderer.drawText(
      `Players in room: ${this.playerIds.length} · local player: green`,
      new Vector2D(20, 66),
      16,
      COLORS.text,
    );
  }

  protected override onStop(): void {
    if (this.stateDisposer !== null) this.stateDisposer();
    this.stateDisposer = null;
    for (const dispose of this.messageDisposers) dispose();
    this.messageDisposers = [];
    if (this.room !== null) this.room.leave();
    this.room = null;
    if (this.network !== null) this.network.dispose();
    this.network = null;
  }

  private syncPlayers(state: any): void {
    const players = state === null || state === undefined ? null : state.players;
    if (players === null || typeof players !== "object") return;
    const visibleIds = Object.keys(players);

    for (let index = this.playerIds.length - 1; index >= 0; index--) {
      if (visibleIds.indexOf(this.playerIds[index]) >= 0) continue;
      const node = this.playerObjects[index];
      if (this.scene !== null) this.scene.remove(node);
      this.playerIds.splice(index, 1);
      this.playerObjects.splice(index, 1);
    }

    for (const sessionId of visibleIds) {
      const player = players[sessionId];
      if (player === null || typeof player !== "object" ||
          typeof player.x !== "number" || typeof player.y !== "number") continue;
      let index = this.playerIds.indexOf(sessionId);
      if (index < 0) {
        const node = new GameObject({ name: `Player ${sessionId.slice(0, 8)}` });
        node.addComponent(new PlayerMarker(sessionId === this.localSessionId ? COLORS.local : COLORS.remote));
        if (this.scene === null || this.scene.addNode(node) === null) continue;
        this.playerIds.push(sessionId);
        this.playerObjects.push(node);
        index = this.playerIds.length - 1;
      }
      const position = this.playerObjects[index].transform.position;
      position.x = player.x;
      position.y = player.y;
      position.z = 0;
    }
  }
}

new MultiplayerArenaGame().run();
