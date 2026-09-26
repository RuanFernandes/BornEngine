import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.COLYSEUS_URL ?? "ws://127.0.0.1:2567";
const client = new Client(endpoint);

function waitFor<T>(
  label: string,
  register: (resolve: (value: T) => void) => void,
  timeoutMs = 10_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function waitForState(room: any, label: string, predicate: (state: any) => boolean): Promise<any> {
  return waitFor(label, (resolve) => {
    room.onStateChange((state: any) => {
      if (predicate(state)) resolve(state);
    });
    if (predicate(room.state)) resolve(room.state);
  });
}

async function main(): Promise<void> {
  let room: any;
  try {
    room = await client.joinOrCreate("test_room", { name: "BornEngine smoke test" });

    const initialState = await waitForState(
      room,
      "initial nested room state",
      (state) => state?.counter === 0 && state.players?.size >= 1,
    );
    assert.equal(initialState.counter, 0, "room should start with a zero counter");
    assert.ok(initialState.players?.size >= 1, "initial state should include a nested players map");
    assert.ok(
      [...initialState.players.values()].some((player: any) => player.name === "BornEngine smoke test"),
      "initial nested player should preserve its join options",
    );

    const echo = waitFor("string echo message", (resolve) => {
      room.onMessage("echo", (payload: unknown) => resolve(payload));
    });
    room.send("echo", { value: "string-message" });
    assert.deepEqual(await echo, { value: "string-message" });

    const numericReply = waitFor("numeric message reply", (resolve) => {
      room.onMessage(8, (payload: unknown) => resolve(payload));
    });
    room.send(7, { value: "numeric-message" });
    assert.deepEqual(await numericReply, { value: "numeric-message" });

    const counterChanged = waitForState(room, "incremented room state", (state) => state.counter === 3);
    const incrementedMessage = waitFor("increment response message", (resolve) => {
      room.onMessage("incremented", (payload: unknown) => resolve(payload));
    });
    room.send("increment", { amount: 3 });
    assert.deepEqual(await Promise.all([counterChanged, incrementedMessage]).then(([, message]) => message), { counter: 3 });

    const bytesState = waitForState(room, "captured binary payload", (state) => state.lastBytes === "1,2,3,255");
    room.sendBytes("bytes", new Uint8Array([1, 2, 3, 255]));
    await bytesState;

    assert.equal(await room.request("request_sum", { a: 9, b: 33 }), 42);

    const reconnectionToken = room.reconnectionToken;
    assert.equal(typeof reconnectionToken, "string", "joined room should provide a reconnection token");
    room.reconnection.enabled = false;
    const dropped = waitFor("unconsented room drop", (resolve) => {
      room.onDrop((code: number, reason: string) => resolve({ code, reason }));
    });
    await room.leave(false);
    await dropped;

    room = await client.reconnect(reconnectionToken);
    assert.equal(room.name, "test_room", "manual reconnect should restore the original room");
    const reconnectedState = await waitForState(
      room,
      "reconnected nested room state",
      (state) => state?.players?.size >= 1,
    );
    assert.ok(reconnectedState.players.size >= 1, "manual reconnect should restore nested room state");

    await room.leave();
    room = undefined;
    console.log("Colyseus server protocol smoke test passed");
  } finally {
    if (room) await room.leave().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error("Colyseus server protocol smoke test failed:", error);
  process.exitCode = 1;
});
