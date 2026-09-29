import { Room, type Client } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  PLAYER_SPEED,
  SIMULATION_STEP_SECONDS,
  clampPlayerPosition,
  normalizeMoveInput,
} from "../protocol.js";

class ArenaPlayer extends Schema {
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
}

class ArenaState extends Schema {
  @type({ map: ArenaPlayer }) players = new MapSchema<ArenaPlayer>();
}

interface InputState {
  x: number;
  y: number;
}

const MAX_CLIENTS = 8;
const INPUT_INTERVAL_MS = 33;
const SIMULATION_INTERVAL_MS = SIMULATION_STEP_SECONDS * 1000;

/** A small authoritative room: clients send bounded input, never positions. */
export class ArenaRoom extends Room {
  maxClients = MAX_CLIENTS;
  state = new ArenaState();

  private readonly movementBySession = new Map<string, InputState>();
  private readonly spawnSlotsBySession = new Map<string, number>();
  private readonly lastSequences = new Map<string, number>();
  private readonly lastInputAt = new Map<string, number>();

  onCreate(): void {
    this.onMessage("input", (client, payload: unknown) => this.acceptInput(client, payload));
    this.setSimulationInterval(() => this.simulate(), SIMULATION_INTERVAL_MS);
  }

  onJoin(client: Client, options: { name?: unknown } = {}): void {
    const player = new ArenaPlayer();
    player.name = this.playerName(options.name, this.state.players.size);
    const spawnSlot = this.nextAvailableSpawnSlot();
    this.spawnSlotsBySession.set(client.sessionId, spawnSlot);
    const spawn = this.spawnAt(spawnSlot);
    player.x = spawn.x;
    player.y = spawn.y;
    this.state.players.set(client.sessionId, player);
    this.movementBySession.set(client.sessionId, { x: 0, y: 0 });
    this.lastSequences.set(client.sessionId, -1);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.movementBySession.delete(client.sessionId);
    this.spawnSlotsBySession.delete(client.sessionId);
    this.lastSequences.delete(client.sessionId);
    this.lastInputAt.delete(client.sessionId);
  }

  private acceptInput(client: Client, payload: unknown): void {
    if (!this.state.players.has(client.sessionId)) return;
    const previousSequence = this.lastSequences.get(client.sessionId) ?? -1;
    const result = normalizeMoveInput(payload, previousSequence);
    if (!result.ok) {
      client.send("inputRejected", { reason: result.reason });
      return;
    }

    const now = Date.now();
    const lastAt = this.lastInputAt.get(client.sessionId) ?? 0;
    if (now - lastAt < INPUT_INTERVAL_MS) {
      client.send("inputRejected", { reason: "rate-limit" });
      return;
    }

    this.lastInputAt.set(client.sessionId, now);
    this.lastSequences.set(client.sessionId, result.input.sequence);
    this.movementBySession.set(client.sessionId, { x: result.input.x, y: result.input.y });
    client.send("inputAccepted", { sequence: result.input.sequence });
  }

  private simulate(): void {
    const distance = PLAYER_SPEED * SIMULATION_STEP_SECONDS;
    for (const [sessionId, player] of this.state.players) {
      const input = this.movementBySession.get(sessionId);
      if (input === undefined) continue;
      const next = clampPlayerPosition(
        player.x + input.x * distance,
        player.y + input.y * distance,
      );
      player.x = next.x;
      player.y = next.y;
    }
  }

  private spawnAt(index: number): { x: number; y: number } {
    const columns = 4;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return clampPlayerPosition(100 + column * 120, 120 + row * 120);
  }

  private nextAvailableSpawnSlot(): number {
    for (let candidate = 0; candidate < MAX_CLIENTS; candidate += 1) {
      let occupied = false;
      for (const slot of this.spawnSlotsBySession.values()) {
        if (slot === candidate) {
          occupied = true;
          break;
        }
      }
      if (!occupied) return candidate;
    }
    return MAX_CLIENTS;
  }

  private playerName(value: unknown, index: number): string {
    if (typeof value !== "string") return `Player ${index + 1}`;
    const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20);
    return name.length === 0 ? `Player ${index + 1}` : name;
  }
}
