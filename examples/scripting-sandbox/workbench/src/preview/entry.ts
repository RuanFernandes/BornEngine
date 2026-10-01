import { Game } from '@bornengine/engine/core';
import type { Color } from '@bornengine/engine/core';
import { GameComponent, GameObject, Scene } from '@bornengine/engine/game';
import { ScriptComponent } from '@bornengine/engine/scripting';
import { ParticleEmitter2D, SpriteSheet } from '@bornengine/engine/sprites';
import type { SpriteFrame } from '@bornengine/engine/sprites';
import type { Renderer } from '@bornengine/engine/core';
import { ColyseusClient } from '@bornengine/engine/colyseus';
import type { Room as ColyseusRoom } from '@bornengine/engine/colyseus';
import { Key } from '@bornengine/engine/core';
import { ScriptComponentSlot, ScriptRevisionReceiver } from './game-bridge';
import { isCurrentRoomCallback, PreviewRevisionGate } from './protocol';
import { MovementInputThrottle } from '../../../server/src/protocol.js';

const PREVIEW_PROTOCOL_VERSION = 1;
const CLIENT_SCRIPT_OUTPUT_MAX_BYTES = 128 * 1024;

interface PreviewMessageEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

interface PreviewWindow {
  location: { origin: string };
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: 'message', listener: (event: PreviewMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: PreviewMessageEvent) => void): void;
}

interface PlayerSnapshot {
  name: string;
  x: number;
  y: number;
  hue: number;
}

interface SandboxRoomState {
  players: Record<string, PlayerSnapshot>;
}

declare const window: PreviewWindow;

const CANVAS_COLOR: Color = { r: 15, g: 19, b: 28, a: 255 };
const PLAYER_COLOR: Color = { r: 168, g: 232, b: 86, a: 255 };

function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
             value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function playerMap(value: unknown): Record<string, { x: number; y: number }> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, { x: number; y: number }> = {};
  for (const sessionId of Object.keys(value)) {
    const player = value[sessionId];
    if (!isRecord(player) || typeof player.x !== 'number' || !Number.isFinite(player.x) ||
        typeof player.y !== 'number' || !Number.isFinite(player.y)) continue;
    result[sessionId] = { x: player.x, y: player.y };
  }
  return result;
}

function isApplyRequest(value: unknown): value is { type: string; revision: number; javascript: string } {
  if (!isRecord(value) || value.type !== 'preview:apply-client-script' ||
      Object.keys(value).length !== 3 || !Object.hasOwn(value, 'revision') || !Object.hasOwn(value, 'javascript')) return false;
  return typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    typeof value.javascript === 'string' && value.javascript.length > 0 &&
    utf8Length(value.javascript) <= CLIENT_SCRIPT_OUTPUT_MAX_BYTES;
}

function isPublishRequest(value: unknown): value is { type: string; revision: number; source: string } {
  if (!isRecord(value) || value.type !== 'preview:publish-client-script' || Object.keys(value).length !== 3 ||
      !Object.hasOwn(value, 'revision') || !Object.hasOwn(value, 'source')) return false;
  return typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    typeof value.source === 'string' && value.source.length > 0 && utf8Length(value.source) <= 64 * 1024;
}

function isRoomConnectRequest(value: unknown): value is { type: string; endpoint: string; roomName: string } {
  if (!isRecord(value) || value.type !== 'preview:connect-room' || Object.keys(value).length !== 3 ||
      !Object.hasOwn(value, 'endpoint') || !Object.hasOwn(value, 'roomName') ||
      typeof value.endpoint !== 'string' || value.endpoint.length > 2048 || /\s|@|#/.test(value.endpoint) ||
      typeof value.roomName !== 'string' || !/^[a-zA-Z0-9:_-]{1,64}$/.test(value.roomName)) return false;
  const separator = value.endpoint.indexOf('://');
  if (separator < 0) return false;
  const protocol = value.endpoint.slice(0, separator);
  if (protocol !== 'ws' && protocol !== 'wss') return false;
  const authorityStart = separator + 3;
  let authorityEnd = value.endpoint.length;
  const slash = value.endpoint.indexOf('/', authorityStart);
  const query = value.endpoint.indexOf('?', authorityStart);
  if (slash >= 0 && slash < authorityEnd) authorityEnd = slash;
  if (query >= 0 && query < authorityEnd) authorityEnd = query;
  return authorityEnd > authorityStart;
}

function isDisconnectRoomRequest(value: unknown): boolean {
  return isRecord(value) && value.type === 'preview:disconnect-room' && Object.keys(value).length === 1;
}

class PreviewCircle extends GameComponent {
  constructor(private readonly color: Color = PLAYER_COLOR) {
    super();
  }

  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner !== null) renderer.drawCircle(owner.transform.worldPosition, 22, this.color);
  }
}

class PreviewScene extends Scene {
  readonly scriptTarget: GameObject;
  private readonly playerObjects: { [sessionId: string]: GameObject } = {};

  constructor(game: Game, particleFrame: SpriteFrame | null) {
    super(game, { name: 'Sandbox preview' });
    this.scriptTarget = new GameObject({ name: 'Sandbox player', position: { x: 480, y: 270, z: 0 } });
    this.scriptTarget.addComponent(new PreviewCircle());
    if (particleFrame !== null) {
      const particles = new ParticleEmitter2D({
        frames: [particleFrame],
        capacity: 128,
        shape: { type: 'circle', radius: 3 },
        lifetime: { min: 0.3, max: 0.8 },
        speed: { min: 28, max: 96 },
        startSize: { min: 5, max: 9 },
        endSize: { min: 0, max: 2 },
        startColor: { r: 156, g: 218, b: 112, a: 245 },
        endColor: { r: 106, g: 169, b: 92, a: 0 },
        direction: { x: 0, y: -1 },
        space: 'local',
      });
      particles.renderOrder = -1;
      this.scriptTarget.addComponent(particles);
    }
    this.addNode(this.scriptTarget);
    this.playerObjects.local = this.scriptTarget;
  }

  syncPlayers(players: Record<string, { x: number; y: number }>, localSessionId: string): void {
    const keep: { [sessionId: string]: boolean } = {};
    for (const sessionId of Object.keys(players)) {
      const state = players[sessionId];
      const object = sessionId === localSessionId
        ? this.scriptTarget
        : this.playerObjects[sessionId] || new GameObject({ name: `Player ${sessionId.slice(0, 6)}` });
      object.transform.setWorldPosition({ x: state.x, y: state.y, z: 0 });
      if (sessionId !== localSessionId && this.playerObjects[sessionId] === undefined) {
        object.addComponent(new PreviewCircle(PLAYER_COLOR));
        this.addNode(object);
      }
      keep[sessionId] = true;
      this.playerObjects[sessionId] = object;
    }
    for (const sessionId of Object.keys(this.playerObjects)) {
      if (sessionId === 'local' || sessionId === localSessionId || keep[sessionId]) continue;
      const object = this.playerObjects[sessionId];
      if (object.scene === this) this.remove(object);
      delete this.playerObjects[sessionId];
    }
  }
}

class PreviewGame extends Game {
  private scene: PreviewScene | null = null;
  private readonly activeScript = new ScriptComponentSlot<ScriptComponent>();
  private networkClient: ColyseusClient | null = null;
  private networkRoom: ColyseusRoom<SandboxRoomState> | null = null;
  private scriptingRoom: ColyseusRoom<any> | null = null;
  private roomGeneration = 0;
  private localScriptRevision = -1;
  private readonly roomScriptRevisions = new ScriptRevisionReceiver();
  private managerRevision = -1;
  private pendingEditorRevision = -1;
  private readonly inputThrottle = new MovementInputThrottle();
  private inputSequence = 0;
  private readonly parentOrigin = window.location.origin;
  private readonly messageListener = (event: PreviewMessageEvent): void => this.handleMessage(event);

  constructor() {
    super({ window: { title: 'BornEngine Web Sandbox', width: 960, height: 540 } });
    window.addEventListener('message', this.messageListener);
  }

  protected override onStart(): void {
    this.renderer.setBloomEnabled(false);
    this.renderer.setSsaoEnabled(false);
    this.renderer.setSsgiEnabled(false);
    this.renderer.setSsrEnabled(false);
    this.renderer.setShadowsEnabled(false);

    let particleFrame: SpriteFrame | null = null;
    const texture = this.assets.loadTexture('assets/particle.png');
    if (texture !== null && texture.isLoaded) {
      const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16 });
      particleFrame = sheet.gridFrame(0, 0);
      if (sheet.error !== null) particleFrame = null;
    }

    const scene = new PreviewScene(this, particleFrame);
    if (!this.scenes.changeTo(scene)) {
      scene.unload();
      this.stop();
      return;
    }
    this.scene = scene;
    this.post({ type: 'preview:ready', protocol: PREVIEW_PROTOCOL_VERSION });
    this.post({
      type: 'preview:status',
      status: 'ready',
      message: particleFrame === null ? 'Preview ready · particle texture unavailable' : 'Preview ready',
    });
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
    this.sendMovementInput(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(CANVAS_COLOR);
    super.render();
  }

  protected override onStop(): void {
    window.removeEventListener('message', this.messageListener);
    this.disconnectRoom(false);
    const scene = this.scene;
    this.activeScript.clear((script) => {
      if (scene !== null) scene.scriptTarget.removeComponent(script);
      else script.dispose();
    });
    this.scene = null;
  }

  private handleMessage(event: PreviewMessageEvent): void {
    if (event.origin !== this.parentOrigin || event.source !== window.parent || !isRecord(event.data)) return;
    const message = event.data;
    if (isApplyRequest(message)) {
      this.applyScript(message);
    } else if (isRoomConnectRequest(message)) {
      this.connectRoom(message.endpoint, message.roomName);
    } else if (isDisconnectRoomRequest(message)) {
      this.disconnectRoom(true);
    } else if (isPublishRequest(message)) {
      this.publishScript(message.revision, message.source);
    }
  }

  private applyScript(message: { revision: number; javascript: string }): void {
    if (message.revision <= this.localScriptRevision) {
      this.post({ type: 'preview:script-result', revision: message.revision, result: 'rejected', error: 'A newer script is already active.' });
      return;
    }
    if (this.installScript(message.revision, message.javascript)) this.localScriptRevision = message.revision;
  }

  private installScript(revision: number, javascript: string): boolean {
    const scene = this.scene;
    if (scene === null) return false;

    const candidate = new ScriptComponent(this.scripting, javascript, {
      permissions: ['log', 'self.read', 'self.particles.emit'],
    });
    const accepted = this.activeScript.replace(candidate,
      (script) => scene.scriptTarget.addComponent(script),
      (previous) => { scene.scriptTarget.removeComponent(previous); },
      (script) => {
        script.onStart();
        return script.status === 'running';
      });
    if (!accepted) {
      this.post({ type: 'preview:script-result', revision, result: 'rejected', error: candidate.error || 'Unable to initialize the client script.' });
      return false;
    }

    this.post({ type: 'preview:script-result', revision, result: 'applied' });
    return true;
  }

  private connectRoom(endpoint: string, roomName: string): void {
    this.disconnectRoom(false);
    this.roomScriptRevisions.reset();
    this.managerRevision = -1;
    this.pendingEditorRevision = -1;
    const generation = ++this.roomGeneration;
    const client = new ColyseusClient(this, endpoint);
    if (!client.isLoaded) {
      client.dispose();
      this.post({ type: 'preview:status', status: 'error', message: client.error || 'Unable to connect to the Colyseus server.' });
      return;
    }
    this.networkClient = client;
    this.post({ type: 'preview:status', status: 'connecting', message: 'Connecting to room…' });
    client.joinOrCreate<SandboxRoomState>(roomName, { name: 'Player ' + String(Date.now() % 10_000) })
      .then((gameRoom) => {
        if (generation !== this.roomGeneration) {
          gameRoom.leave();
          client.dispose();
          return;
        }
        this.networkRoom = gameRoom;
        gameRoom.onStateChange((state) => {
          if (!isCurrentRoomCallback(generation, this.roomGeneration, gameRoom, this.networkRoom)) return;
          this.syncRoomState(gameRoom, state);
        });
        gameRoom.onMessage('inputAccepted', () => undefined);
        gameRoom.onMessage('inputRejected', (payload: unknown) => {
          if (!isCurrentRoomCallback(generation, this.roomGeneration, gameRoom, this.networkRoom)) return;
          const reason = isRecord(payload) ? String(payload.reason || 'invalid input') : 'invalid input';
          this.post({ type: 'preview:status', status: 'connected', message: `Movement input rejected: ${reason}` });
        });
        gameRoom.onLeave((_code, reason) => {
          if (!isCurrentRoomCallback(generation, this.roomGeneration, gameRoom, this.networkRoom)) return;
          this.disconnectRoom(false);
          this.post({ type: 'preview:status', status: 'disconnected', message: reason || 'Gameplay room disconnected' });
        });
        if (gameRoom.state !== null) this.syncRoomState(gameRoom, gameRoom.state);
        client.joinOrCreate('scripting-manager').then((scriptingRoom) => {
          if (generation !== this.roomGeneration) {
            scriptingRoom.leave();
            client.dispose();
            return;
          }
          this.scriptingRoom = scriptingRoom;
          scriptingRoom.onMessage('clientScriptSnapshot', (payload: unknown) => {
            if (!isCurrentRoomCallback(generation, this.roomGeneration, scriptingRoom, this.scriptingRoom)) return;
            this.applyRoomScript(payload);
          });
          scriptingRoom.onMessage('clientScriptReload', (payload: unknown) => {
            if (!isCurrentRoomCallback(generation, this.roomGeneration, scriptingRoom, this.scriptingRoom)) return;
            this.applyRoomScript(payload);
          });
          scriptingRoom.onMessage('clientScriptResult', (payload: unknown) => {
            if (!isCurrentRoomCallback(generation, this.roomGeneration, scriptingRoom, this.scriptingRoom)) return;
            this.handlePublishResult(payload);
          });
          scriptingRoom.onLeave((_code, reason) => {
            if (!isCurrentRoomCallback(generation, this.roomGeneration, scriptingRoom, this.scriptingRoom)) return;
            this.disconnectRoom(false);
            this.post({ type: 'preview:status', status: 'disconnected', message: reason || 'Scripting manager disconnected' });
          });
          scriptingRoom.send('requestClientScriptSnapshot', {});
          this.post({ type: 'preview:publisher', canPublish: true });
          this.post({ type: 'preview:status', status: 'connected', message: 'Connected to gameplay and scripting rooms' });
        })
          .catch((error: unknown) => {
            if (generation !== this.roomGeneration) return;
            this.networkRoom = null;
            this.scriptingRoom = null;
            this.networkClient = null;
            client.dispose();
            this.post({ type: 'preview:publisher', canPublish: false });
            this.post({ type: 'preview:status', status: 'error', message: error instanceof Error ? error.message : 'Scripting manager connection failed.' });
          });
      })
      .catch((error: unknown) => {
        if (generation !== this.roomGeneration) return;
        this.networkRoom = null;
        this.scriptingRoom = null;
        this.networkClient = null;
        client.dispose();
        this.post({ type: 'preview:publisher', canPublish: false });
        this.post({ type: 'preview:status', status: 'error', message: error instanceof Error ? error.message : 'Gameplay room connection failed.' });
      });
  }

  private disconnectRoom(reportStatus: boolean): void {
    this.roomGeneration++;
    this.roomScriptRevisions.reset();
    this.managerRevision = -1;
    this.pendingEditorRevision = -1;
    const gameRoom = this.networkRoom;
    const scriptingRoom = this.scriptingRoom;
    const client = this.networkClient;
    this.networkRoom = null;
    this.scriptingRoom = null;
    this.networkClient = null;
    if (client !== null) {
      if (scriptingRoom !== null) {
        scriptingRoom.leave().finally(() => {
          if (gameRoom !== null) gameRoom.leave().finally(() => client.dispose());
          else client.dispose();
        });
      } else if (gameRoom !== null) gameRoom.leave().finally(() => client.dispose());
      else client.dispose();
    }
    this.post({ type: 'preview:publisher', canPublish: false });
    if (reportStatus) this.post({ type: 'preview:status', status: 'disconnected', message: 'Room disconnected' });
  }

  private syncRoomState(room: ColyseusRoom<SandboxRoomState>, state: SandboxRoomState): void {
    const players = playerMap(state.players);
    if (players !== null) this.scene?.syncPlayers(players, room.sessionId);
  }

  private applyRoomScript(value: unknown): void {
    const result = this.roomScriptRevisions.receive(value, (snapshot) =>
      this.installScript(snapshot.revision, snapshot.javascript),
    );
    if (result !== 'invalid' && result !== 'stale') {
      this.managerRevision = Math.max(this.managerRevision, this.roomScriptRevisions.revision);
    }
  }

  private publishScript(editorRevision: number, source: string): void {
    const room = this.scriptingRoom;
    if (room === null || !room.isConnected) {
      this.post({ type: 'preview:script-result', revision: editorRevision, result: 'rejected', error: 'Connect to a room before sharing a script.' });
      return;
    }
    if (this.managerRevision < 0) {
      this.post({ type: 'preview:script-result', revision: editorRevision, result: 'rejected', error: 'Waiting for the current scripting revision.' });
      return;
    }
    if (this.pendingEditorRevision >= 0) {
      this.post({ type: 'preview:script-result', revision: editorRevision, result: 'rejected', error: 'A script publish is already in progress.' });
      return;
    }
    this.pendingEditorRevision = editorRevision;
    room.send('publishClientScript', { baseRevision: this.managerRevision, source });
  }

  private handlePublishResult(value: unknown): void {
    if (!isRecord(value) || typeof value.result !== 'string') return;
    if (value.result === 'accepted') {
      const editorRevision = this.pendingEditorRevision;
      this.pendingEditorRevision = -1;
      if (typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0) {
        this.managerRevision = Math.max(this.managerRevision, value.revision);
      }
      if (editorRevision >= 0) {
        this.post({ type: 'preview:script-result', revision: editorRevision, result: 'published' });
      }
      return;
    }
    if (value.result === 'rejected') {
      if (typeof value.currentRevision === 'number' && Number.isSafeInteger(value.currentRevision) && value.currentRevision >= 0) {
        this.managerRevision = Math.max(this.managerRevision, value.currentRevision);
      }
      const editorRevision = this.pendingEditorRevision;
      this.pendingEditorRevision = -1;
      const details = Array.isArray(value.diagnostics)
        ? value.diagnostics.filter((item) => typeof item === 'string').join('\n')
        : '';
      if (editorRevision >= 0) {
        this.post({
          type: 'preview:script-result',
          revision: editorRevision,
          result: 'rejected',
          error: details || String(value.reason || 'The server rejected this client script.'),
        });
      }
      this.scriptingRoom?.send('requestClientScriptSnapshot', {});
    }
  }

  private sendMovementInput(deltaTime: number): void {
    const room = this.networkRoom;
    if (room === null || !room.isConnected) return;
    const x = (this.input.isKeyDown(Key.D) || this.input.isKeyDown(Key.RIGHT) ? 1 : 0) -
      (this.input.isKeyDown(Key.A) || this.input.isKeyDown(Key.LEFT) ? 1 : 0);
    const y = (this.input.isKeyDown(Key.S) || this.input.isKeyDown(Key.DOWN) ? 1 : 0) -
      (this.input.isKeyDown(Key.W) || this.input.isKeyDown(Key.UP) ? 1 : 0);
    if (!this.inputThrottle.update(deltaTime, { x, y })) return;
    room.send('input', { sequence: this.inputSequence++, x, y });
  }

  private post(message: unknown): void {
    window.parent.postMessage(message, this.parentOrigin);
  }
}

new PreviewGame().run();
