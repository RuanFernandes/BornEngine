import { ColyseusClient, Game } from "@bornengine/engine";

async function main(): Promise<void> {
  const game = new Game({
    window: { width: 320, height: 180, title: "BornEngine Colyseus Smoke Test" },
  });
  const client = new ColyseusClient(game, "ws://127.0.0.1:2567");
  try {
    let room: any = null;
    let joinError: Error | null = null;
    client.joinOrCreate("test_room", { name: "BornEngine" }).then(
      (joined) => { room = joined; },
      (error) => { joinError = error as Error; },
    );

    const joinDeadline = Date.now() + 10_000;
    while (room === null && joinError === null && Date.now() < joinDeadline) {
      client.poll();
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    if (joinError !== null) throw joinError;
    if (room === null) throw new Error("Timed out waiting for Colyseus room join");

    let receivedEcho = false;
    let receivedState = false;
    let receivedBytes = false;

    room.onMessage("joined", () => {});
    room.onMessage("echo", (message: { value?: string }) => {
      if (message.value === "native-sdk") receivedEcho = true;
    });
    room.onStateChange((state: { counter?: number }) => {
      if (state.counter === 3) receivedState = true;
      if (state.lastBytes === "1,2,3,255") receivedBytes = true;
    });
    room.send("echo", { value: "native-sdk" });
    room.send("increment", { amount: 3 });
    room.sendBytes("bytes", new Uint8Array([1, 2, 3, 255]));

    const deadline = Date.now() + 10_000;
    while ((!receivedEcho || !receivedState || !receivedBytes) && Date.now() < deadline) {
      client.poll();
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }

    if (!receivedEcho || !receivedState || !receivedBytes) throw new Error("Colyseus integration smoke test failed");

    let requestValue: number | null = null;
    let requestError: Error | null = null;
    room.request<number>("request_sum", { a: 9, b: 33 }).then(
      (value) => { requestValue = value; },
      (error) => { requestError = error as Error; },
    );
    const requestDeadline = Date.now() + 5_000;
    while (requestValue === null && requestError === null && Date.now() < requestDeadline) {
      client.poll();
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    if (requestError !== null) throw requestError;
    if (requestValue !== 42) throw new Error("Colyseus request/reply smoke test failed");
    let left = false;
    room.leave().then(() => { left = true; });
    const leaveDeadline = Date.now() + 5_000;
    while (!left && Date.now() < leaveDeadline) {
      client.poll();
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    if (!left) throw new Error("Timed out waiting for Colyseus room leave");
    console.log("Colyseus TypeScript smoke test passed");
  } finally {
    client.dispose();
    game.dispose();
  }
}

void main().catch((error) => {
  console.error("Colyseus TypeScript smoke test failed:", error);
  process.exit(1);
});
