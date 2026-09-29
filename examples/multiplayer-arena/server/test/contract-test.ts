import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@colyseus/sdk";
import { normalizeMoveInput } from "../src/protocol.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = resolve(serverRoot, "node_modules/tsx/dist/cli.mjs");
const host = "127.0.0.1";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, host, resolveListen);
  });
  const address = probe.address();
  if (address === null || typeof address === "string") throw new Error("No test port was assigned");
  await new Promise<void>((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => { socket.destroy(); resolveOpen(true); });
    socket.once("error", () => resolveOpen(false));
  });
}

async function waitForServer(server: ChildProcess, port: number, output: () => string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Arena server exited early (${server.exitCode}): ${output()}`);
    if (await portIsOpen(port)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error(`Arena server did not listen on ${host}:${port}: ${output()}`);
}

function waitForState(room: any, label: string, predicate: (state: any) => boolean): Promise<any> {
  return new Promise((resolveState, reject) => {
    const handler = (state: any) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      room.onStateChange.remove(handler);
      resolveState(state);
    };
    const timer = setTimeout(() => { room.onStateChange.remove(handler); reject(new Error(`Timed out waiting for ${label}`)); }, 5_000);
    room.onStateChange(handler);
    if (predicate(room.state)) {
      clearTimeout(timer);
      room.onStateChange.remove(handler);
      resolveState(room.state);
    }
  });
}

function waitForMessage(room: any, type: string, label: string, predicate: (message: any) => boolean): Promise<any> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => { remove(); reject(new Error(`Timed out waiting for ${label}`)); }, 5_000);
    const remove = room.onMessage(type, (message: any) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      remove();
      resolveMessage(message);
    });
  });
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const closed = new Promise<void>((resolveClosed) => server.once("close", () => resolveClosed()));
  server.kill("SIGTERM");
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise<boolean>((resolveTimeout) => setTimeout(() => resolveTimeout(false), 3_000)),
  ]);
  if (!stopped) server.kill("SIGKILL");
}

async function main(): Promise<void> {
  const normalized = normalizeMoveInput({ x: 100, y: 100, sequence: 2 }, 1);
  assert.equal(normalized.ok, true, "finite input with a newer sequence should be accepted");
  if (normalized.ok) {
    assert.ok(Math.abs(Math.sqrt(normalized.input.x ** 2 + normalized.input.y ** 2) - 1) < 0.000001,
      "diagonal input should be clamped to unit length");
  }
  assert.equal(normalizeMoveInput({ x: "right", y: 0, sequence: 2 }, 1).ok, false,
    "malformed movement axes should be rejected");
  assert.equal(normalizeMoveInput({ x: 0, y: 0, sequence: 1 }, 1).ok, false,
    "stale input sequences should be rejected");

  const port = await freePort();
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverRoot,
    env: { ...process.env, HOST: host, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  server.stdout.setEncoding("utf8").on("data", (chunk: string) => { serverOutput += chunk; });
  server.stderr.setEncoding("utf8").on("data", (chunk: string) => { serverOutput += chunk; });
  const clientA = new Client(`ws://${host}:${port}`);
  const clientB = new Client(`ws://${host}:${port}`);
  let roomA: any = null;
  let roomB: any = null;

  try {
    await waitForServer(server, port, () => serverOutput);
    roomA = await clientA.joinOrCreate("arena");
    roomB = await clientB.joinOrCreate("arena");
    const together = await waitForState(roomB, "both players in shared state", (state) => state.players?.size === 2);
    const sessionA = roomA.sessionId;
    const playerA = together.players.get(sessionA);
    assert.ok(playerA, "the server should key the player's position by its authenticated session id");
    assert.notEqual(sessionA, roomB.sessionId);
    const initialX = playerA.x;
    const initialY = playerA.y;

    const accepted = waitForMessage(roomA, "inputAccepted", "server input acknowledgement", (message) => message.sequence === 1);
    roomA.send("input", { x: 3, y: 0, sequence: 1 });
    await accepted;
    const moved = await waitForState(roomB, "server-authoritative position update", (state) => state.players.get(sessionA)?.x > initialX);
    const movedPlayer = moved.players.get(sessionA);
    assert.ok(movedPlayer.x > initialX, "valid movement intent should move the player's server-owned position");
    assert.equal(movedPlayer.y, initialY, "horizontal movement should not alter the y coordinate");
    assert.ok(movedPlayer.x <= 624, "movement should remain inside the right world bound");
    assert.ok(movedPlayer.y >= 16 && movedPlayer.y <= 464, "movement should remain inside the vertical world bounds");

    const rejected = waitForMessage(roomA, "inputRejected", "stale input rejection", (message) => message.reason === "invalid-sequence");
    roomA.send("input", { x: 0, y: 1, sequence: 1 });
    await rejected;

    const malformed = waitForMessage(roomA, "inputRejected", "malformed input rejection", (message) => message.reason === "invalid-input");
    roomA.send("input", { position: { x: 999999, y: 999999 }, sequence: 2 });
    await malformed;
    const safeAfterMalformed = roomB.state.players.get(sessionA);
    assert.ok(safeAfterMalformed.x <= 624 && safeAfterMalformed.y <= 464, "clients must not submit authoritative positions");

    await roomA.leave();
    roomA = null;
    const afterLeave = await waitForState(roomB, "player removal after leave", (state) => !state.players.has(sessionA));
    assert.equal(afterLeave.players.size, 1, "leaving must remove the server-owned player entry");
    console.log("Multiplayer arena two-client contract passed");
  } finally {
    if (roomA) await roomA.leave().catch(() => undefined);
    if (roomB) await roomB.leave().catch(() => undefined);
    await stopServer(server);
  }
}

void main().catch((error) => {
  console.error("Multiplayer arena contract failed:", error);
  process.exitCode = 1;
});
