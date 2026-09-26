import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const serverDir = join(root, "server");
const tsxCli = join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
const port = Number(process.env.PORT ?? 2567);
const host = "127.0.0.1";

if (!existsSync(tsxCli)) {
  console.error("Colyseus test dependencies are missing. Run npm ci --prefix tests/colyseus/server first.");
  process.exit(1);
}

const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
  cwd: serverDir,
  env: { ...process.env, HOST: host, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
server.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });

function isPortReady() {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Colyseus server exited early (${server.exitCode})`);
    if (await isPortReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Colyseus server did not listen on ${host}:${port} within 15 seconds`);
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const closed = new Promise((resolve) => server.once("close", resolve));
  server.kill("SIGTERM");
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
  ]);
  if (!stopped) server.kill("SIGKILL");
}

try {
  await waitForServer();
  const result = spawnSync(process.execPath, [tsxCli, "src/smoke-test.ts"], {
    cwd: serverDir,
    env: { ...process.env, COLYSEUS_URL: `ws://${host}:${port}` },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  console.error("Colyseus fixture smoke failed:", error);
  if (serverOutput.trim()) console.error(serverOutput.trim());
  process.exitCode = 1;
} finally {
  await stopServer();
}
