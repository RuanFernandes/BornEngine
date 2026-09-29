import {
  ColyseusClient,
  Game,
  Key,
  Renderer,
  Scene,
  Vector2D,
} from "@bornengine/engine";
import type { Color } from "@bornengine/engine";

const SERVER_URL = "ws://127.0.0.1:2569";

const COLORS = {
  background: { r: 17, g: 22, b: 31, a: 255 } as Color,
  panel: { r: 29, g: 38, b: 50, a: 255 } as Color,
  text: { r: 240, g: 244, b: 248, a: 255 } as Color,
  accent: { r: 149, g: 229, b: 93, a: 255 } as Color,
  muted: { r: 165, g: 180, b: 193, a: 255 } as Color,
  warning: { r: 255, g: 178, b: 84, a: 255 } as Color,
};

class MultiplayerChatGame extends Game {
  private network: ColyseusClient | null = null;
  private room: any = null;
  private stateDisposer: (() => void) | null = null;
  private messageDisposers: Array<() => void> = [];
  private status = "Connecting to the local chat room…";
  private members: string[] = [];
  private messages: string[] = [];
  private draft = "";

  constructor() {
    super({
      window: { title: "BornEngine · Multiplayer Chat", width: 900, height: 620 },
      targetFps: 60,
    });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Scene(this, { name: "Room Chat" }));
    const network = new ColyseusClient(this, SERVER_URL);
    this.network = network;
    if (network.error !== null) {
      this.status = `Network error: ${network.error}`;
      return;
    }

    const started = network.joinOrCreateWithCallbacks("chat", { displayName: "Explorer" }, {
      onJoin: (room) => {
        this.room = room;
        this.status = `Connected · ${room.sessionId.slice(0, 8)}`;
        this.stateDisposer = room.onStateChange((state: any) => this.syncMembers(state));
        this.messageDisposers.push(room.onMessage("chat", (message: any) => this.receiveMessage(message)));
        this.messageDisposers.push(room.onMessage("messageRejected", (message: any) => {
          this.status = `Message rejected: ${message.reason}`;
        }));
        this.messageDisposers.push(room.onError((error) => {
          this.status = `Room error: ${error.message}`;
        }));
        this.messageDisposers.push(room.onDrop((_code, reason) => {
          this.status = `Connection interrupted: ${reason || "waiting to reconnect"}`;
        }));
        this.messageDisposers.push(room.onReconnect(() => {
          this.status = "Reconnected to the chat room";
        }));
        this.messageDisposers.push(room.onLeave((_code, reason) => {
          this.status = `Disconnected: ${reason || "left the room"}`;
        }));
        this.syncMembers(room.state);
      },
      onError: (error) => { this.status = `Could not join chat: ${error.message}`; },
    });
    if (!started) this.status = network.error || "Could not start the room join request.";
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
    this.readTextInput();
    const room = this.room;
    if (room === null || !room.isConnected) return;

    if (this.input.isKeyPressed(Key.ENTER)) {
      const message = this.draft.trim();
      if (message.length > 0) {
        room.send("chat", { text: message });
        this.draft = "";
      } else {
        this.status = "Type a message before pressing Enter.";
      }
    }
    if (this.input.isKeyPressed(Key.ESCAPE)) {
      this.status = "Leaving the room…";
      room.leave();
    }
  }

  protected override render(): void {
    this.renderer.clear(COLORS.background);
    super.render();
    this.renderer.drawRectangle({ x: 18, y: 16, width: 864, height: 88 }, COLORS.panel);
    this.renderer.drawText("BornEngine room chat", new Vector2D(36, 28), 28, COLORS.accent);
    this.renderer.drawText(this.status, new Vector2D(36, 66), 16, COLORS.text);
    this.renderer.drawText("Members", new Vector2D(36, 126), 20, COLORS.accent);
    this.renderer.drawText("Recent messages", new Vector2D(360, 126), 20, COLORS.accent);

    const memberCount = Math.min(this.members.length, 12);
    for (let index = 0; index < memberCount; index++) {
      this.renderer.drawText(this.members[index], new Vector2D(36, 162 + index * 28), 16, COLORS.text);
    }
    if (this.members.length === 0) {
      this.renderer.drawText("Waiting for room membership…", new Vector2D(36, 162), 16, COLORS.muted);
    }

    const messageCount = Math.min(this.messages.length, 10);
    for (let index = 0; index < messageCount; index++) {
      const messageIndex = this.messages.length - messageCount + index;
      this.renderer.drawText(this.messages[messageIndex], new Vector2D(360, 162 + index * 30), 16, COLORS.text);
    }
    if (this.messages.length === 0) {
      this.renderer.drawText("No messages yet", new Vector2D(360, 162), 16, COLORS.muted);
    }

    this.renderer.drawRectangle({ x: 344, y: 500, width: 538, height: 48 }, COLORS.panel);
    const visibleDraft = this.draft.length > 56
      ? this.draft.slice(this.draft.length - 56)
      : this.draft;
    this.renderer.drawText(`> ${visibleDraft}`, new Vector2D(356, 512), 16, COLORS.text);
    this.renderer.drawText("Type a message · Enter: send · Backspace: edit", new Vector2D(36, 550), 16, COLORS.text);
    this.renderer.drawText("Esc: leave the room", new Vector2D(36, 576), 16, COLORS.warning);
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

  private syncMembers(state: any): void {
    const members = state === null || state === undefined ? null : state.members;
    if (members === null || typeof members !== "object") return;
    const sessionIds = Object.keys(members);
    const nextMembers: string[] = [];
    for (const sessionId of sessionIds) {
      const member = members[sessionId];
      if (member === null || typeof member !== "object") continue;
      const name = typeof member.name === "string" ? member.name : "Guest";
      nextMembers.push(`${name} · ${sessionId.slice(0, 8)}`);
    }
    this.members = nextMembers;
  }

  private receiveMessage(message: any): void {
    if (message === null || typeof message !== "object") return;
    const name = typeof message.name === "string" ? message.name : "Guest";
    const text = typeof message.text === "string" ? message.text : "";
    if (text.length === 0) return;
    this.messages.push(`${name}: ${text}`);
    if (this.messages.length > 10) this.messages.shift();
  }

  private readTextInput(): void {
    for (let count = 0; count < 128; count++) {
      const codepoint = this.input.getCharPressed();
      if (codepoint === 0) break;
      if (codepoint === 8) {
        this.removeLastCharacter();
      } else if (codepoint >= 32 && codepoint <= 0x10ffff && this.draft.length < 240) {
        this.draft += String.fromCodePoint(codepoint);
      }
    }
  }

  private removeLastCharacter(): void {
    const length = this.draft.length;
    if (length === 0) return;
    const last = this.draft.charCodeAt(length - 1);
    const isLowSurrogate = last >= 0xdc00 && last <= 0xdfff;
    const previous = length > 1 ? this.draft.charCodeAt(length - 2) : 0;
    const hasPair = isLowSurrogate && previous >= 0xd800 && previous <= 0xdbff;
    this.draft = this.draft.slice(0, hasPair ? length - 2 : length - 1);
  }
}

new MultiplayerChatGame().run();
