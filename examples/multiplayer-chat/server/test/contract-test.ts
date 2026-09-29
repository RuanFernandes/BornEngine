import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@colyseus/sdk";
import { normalizeDisplayName, parseChatMessage } from "../src/protocol.js";

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
    if (server.exitCode !== null) throw new Error(`Chat server exited early (${server.exitCode}): ${output()}`);
    if (await portIsOpen(port)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error(`Chat server did not listen on ${host}:${port}: ${output()}`);
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
  const parsedChat = parseChatMessage({ text: "  hello  " });
  assert.equal(parsedChat.ok, true, "valid chat text should be accepted");
  if (parsedChat.ok) assert.equal(parsedChat.text, "hello", "accepted text should be trimmed");
  assert.equal(parseChatMessage({ text: "  " }).ok, false, "empty chat text should be rejected");
  assert.equal(parseChatMessage({ text: "x".repeat(241) }).ok, false, "oversized chat text should be rejected");
  assert.equal(parseChatMessage(null).ok, false, "non-object chat payloads should be rejected");
  assert.equal(parseChatMessage({ text: "bad\u0001text" }).ok, false, "control characters should be rejected");
  assert.equal(parseChatMessage({ text: "hello", metadata: { value: "unbounded" } }).ok, false,
    "unrecognized payload fields should be rejected");
  assert.equal(parseChatMessage({ text: "hello", name: "x".repeat(25) }).ok, false,
    "ignored client identity fields should remain bounded");
  assert.equal(normalizeDisplayName("  A".repeat(20)).length, 24, "member names should be bounded");
  assert.equal(normalizeDisplayName("  Ada\n  "), "Ada", "member names should not preserve control characters");

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
    roomA = await clientA.joinOrCreate("chat", { displayName: "Ada", sessionId: "spoofed-session" });
    roomB = await clientB.joinOrCreate("chat", { displayName: "Lin" });
    const joined = await waitForState(roomB, "authoritative membership state", (state) => state.members?.size === 2);
    const sessionA = roomA.sessionId;
    roomA.onMessage("chat", () => {});
    const roomOrder: any[] = [];
    roomB.onMessage("chat", (message: any) => roomOrder.push(message));
    assert.ok(joined.members.has(sessionA), "membership should use the server-issued session id");
    assert.ok(joined.members.has(roomB.sessionId), "the second client's server session should be listed");
    assert.equal(joined.members.has("spoofed-session"), false, "clients cannot choose their membership key");
    assert.equal(joined.members.get(sessionA).name, "Ada", "the server owns the member display name");

    const firstMessage = waitForMessage(roomB, "chat", "validated message broadcast", (message) => message.text === "hello room");
    roomA.send("chat", { text: "  hello room  ", sessionId: "spoofed-session", name: "Admin" });
    const broadcast = await firstMessage;
    assert.equal(broadcast.sessionId, sessionA, "the server must stamp the authenticated sender");
    assert.equal(broadcast.name, "Ada", "the server must ignore client-authored names");
    assert.equal(broadcast.text, "hello room", "the server should trim accepted chat text");

    roomA.send("chat", { text: "Ada replies" });
    roomB.send("chat", { text: "Lin replies" });
    roomA.send("chat", { text: "Ada follows up" });
    const orderDeadline = Date.now() + 5_000;
    while (roomOrder.length < 4 && Date.now() < orderDeadline) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    assert.deepEqual(roomOrder.map((message) => message.id), [1, 2, 3, 4]);
    assert.equal(roomOrder[0].text, "hello room");
    assert.deepEqual(
      roomOrder.filter((message) => message.sessionId === sessionA).map((message) => message.text),
      ["hello room", "Ada replies", "Ada follows up"],
      "messages from one client should retain its send order",
    );
    assert.equal(roomOrder.filter((message) => message.sessionId === roomB.sessionId).length, 1,
      "the other member's message should be included in the server's total order");

    const rejectedReasons: string[] = [];
    const removeRejected = roomA.onMessage("messageRejected", (message: any) => rejectedReasons.push(message.reason));
    roomA.send("chat", { text: "   " });
    roomA.send("chat", { text: "x".repeat(241) });
    roomA.send("chat", null);
    roomA.send("chat", { text: "bad\u0001text" });
    roomA.send("chat", { text: "spoof", name: "x".repeat(25) });
    const rejectDeadline = Date.now() + 5_000;
    while (rejectedReasons.length < 5 && Date.now() < rejectDeadline) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    removeRejected();
    assert.deepEqual(rejectedReasons, ["empty", "too-long", "invalid-payload", "invalid-characters", "invalid-payload"],
      "malformed, empty, overlong, and control-character payloads should have bounded rejection reasons");

    await new Promise((resolveWait) => setTimeout(resolveWait, 1_050));
    const ordered: any[] = [];
    const rejectedBurst: string[] = [];
    const removeChat = roomB.onMessage("chat", (message: any) => ordered.push(message));
    const removeBurstRejections = roomA.onMessage("messageRejected", (message: any) => rejectedBurst.push(message.reason));
    const texts = ["one", "two", "three", "four", "five", "six"];
    for (const text of texts) roomA.send("chat", { text });
    const burstDeadline = Date.now() + 5_000;
    while (ordered.length + rejectedBurst.length < texts.length && Date.now() < burstDeadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    removeChat();
    removeBurstRejections();
    assert.equal(ordered.length, 4, "the room should accept no more than four messages per member per second");
    assert.deepEqual(ordered.map((message) => message.text), texts.slice(0, 4), "accepted messages should retain sender order");
    assert.equal(rejectedBurst.length, 2, "messages over the per-member rate bound should be rejected");
    assert.ok(rejectedBurst.every((reason) => reason === "rate-limit"));
    assert.deepEqual(ordered.map((message) => message.id), [5, 6, 7, 8], "broadcast ids should preserve room-wide order");

    await roomA.leave();
    roomA = null;
    const afterLeave = await waitForState(roomB, "membership removal after leave", (state) => !state.members.has(sessionA));
    assert.equal(afterLeave.members.size, 1, "leaving should remove the member from authoritative state");
    console.log("Multiplayer chat two-client contract passed");
  } finally {
    if (roomA) await roomA.leave().catch(() => undefined);
    if (roomB) await roomB.leave().catch(() => undefined);
    await stopServer(server);
  }
}

void main().catch((error) => {
  console.error("Multiplayer chat contract failed:", error);
  process.exitCode = 1;
});
