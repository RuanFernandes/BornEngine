import { Room, type Client } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";

class Player extends Schema {
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
}

class TestRoomState extends Schema {
  @type("number") counter = 0;
  @type("string") lastMessage = "";
  @type("string") lastBytes = "";
  @type({ map: Player }) players = new MapSchema<Player>();
}

export class TestRoom extends Room {
  maxClients = 8;
  state = new TestRoomState();

  messages = {
    increment: (client: Client, amount: number | { amount?: number }) => {
      const value = typeof amount === "number" ? amount : (amount?.amount ?? 1);
      this.state.counter += value;
      client.send("incremented", { counter: this.state.counter });
    },
    echo: (client: Client, payload: unknown) => {
      client.send("echo", payload);
    },
    move: (client: Client, payload: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !payload) return;
      player.x = payload.x;
      player.y = payload.y;
    },
    force_drop: (client: Client) => {
      client.leave(4010);
    },
    request_sum: (_client: Client, message: { a: number; b: number }) => message.a + message.b,
    request_delay: async (_client: Client, message: { delayMs?: number } = {}) => {
      const delayMs = Math.max(0, Math.min(message.delayMs ?? 1_000, 3_000));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { completed: true };
    },
  };

  onCreate() {
    this.onMessage(7, (client, payload: unknown) => {
      client.send(8, payload);
    });

    this.onMessageBytes("bytes", (_client, bytes: Uint8Array) => {
      this.state.lastBytes = Array.from(bytes).join(",");
    });
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    if (this.clients.length === 1) this.state.counter = 0;
    const player = new Player();
    player.name = options.name ?? "player";
    this.state.players.set(client.sessionId, player);
  }

  async onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.name = `${player.name} (reconnecting)`;
    await this.allowReconnection(client, 10);
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.name = player.name.replace(" (reconnecting)", "");
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}
