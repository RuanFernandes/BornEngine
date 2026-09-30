import { listen } from '@colyseus/tools';
import app from './app.config.js';
import { startSandboxDevRuntime } from './sandbox/runtime.js';

process.env.HOST ??= '127.0.0.1';
process.env.PORT ??= '2568';

await startSandboxDevRuntime(process.env.BORNENGINE_SANDBOX_DEV_TOKEN);
await listen(app);
