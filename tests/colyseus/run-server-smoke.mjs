import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, "../..");
const serverDir = join(root, "server");
const tsxCli = join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
const commandSeparator = process.argv.indexOf("--");
const smokeCommand = commandSeparator >= 0 ? process.argv.slice(commandSeparator + 1) : null;
const smokeScript = smokeCommand ? null : process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(serverDir, "src", "smoke-test.ts");
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
  const isTypeScript = smokeScript !== null && /\.(?:ts|tsx)$/.test(smokeScript);
  if (smokeCommand && smokeCommand.length === 0) throw new Error("Expected a command after --");
  const command = smokeCommand || (isTypeScript ? [process.execPath, tsxCli, smokeScript] : [process.execPath, smokeScript]);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: isTypeScript ? serverDir : repoRoot,
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
