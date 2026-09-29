import { Room, type Client } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  MAX_MESSAGES_PER_SECOND,
  normalizeDisplayName,
  parseChatMessage,
} from "../protocol.js";

class ChatMember extends Schema {
  @type("string") name = "";
}

class ChatState extends Schema {
  @type({ map: ChatMember }) members = new MapSchema<ChatMember>();
}

interface RateWindow {
  startedAt: number;
  count: number;
}

const MAX_CLIENTS = 16;
const RATE_WINDOW_MS = 1_000;

/** Room membership and message authorship are derived from the server session. */
export class ChatRoom extends Room {
  maxClients = MAX_CLIENTS;
  state = new ChatState();

  private readonly rateWindows = new Map<string, RateWindow>();
  private nextMessageId = 1;

  onCreate(): void {
    this.onMessage("chat", (client, payload: unknown) => this.acceptMessage(client, payload));
  }

  onJoin(client: Client, options: { displayName?: unknown } = {}): void {
    const member = new ChatMember();
    member.name = normalizeDisplayName(options.displayName);
    this.state.members.set(client.sessionId, member);
    this.rateWindows.set(client.sessionId, { startedAt: Date.now(), count: 0 });
  }

  onLeave(client: Client): void {
    this.state.members.delete(client.sessionId);
    this.rateWindows.delete(client.sessionId);
  }

  private acceptMessage(client: Client, payload: unknown): void {
    const member = this.state.members.get(client.sessionId);
    if (member === undefined) return;
    const parsed = parseChatMessage(payload);
    if (!parsed.ok) {
      client.send("messageRejected", { reason: parsed.reason });
      return;
    }

    const now = Date.now();
    const window = this.rateWindows.get(client.sessionId) ?? { startedAt: now, count: 0 };
    if (now - window.startedAt >= RATE_WINDOW_MS) {
      window.startedAt = now;
      window.count = 0;
    }
    if (window.count >= MAX_MESSAGES_PER_SECOND) {
      this.rateWindows.set(client.sessionId, window);
      client.send("messageRejected", { reason: "rate-limit" });
      return;
    }

    window.count++;
    this.rateWindows.set(client.sessionId, window);
    this.broadcast("chat", {
      id: this.nextMessageId++,
      sessionId: client.sessionId,
      name: member.name,
      text: parsed.text,
    });
  }
}
