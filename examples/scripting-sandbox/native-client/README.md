# Scripting Sandbox Native Client

This Perry-compiled Linux client provides the game window for the scripting sandbox without relying on browser WebGPU. It connects to the same Colyseus rooms as the browser preview and runs accepted shared client scripts in BornEngine's isolated QuickJS runtime.

Start the sandbox server and React workbench from `examples/scripting-sandbox/`:

```sh
pnpm dev
```

Then, from the BornEngine repository root, build and launch the native client:

```sh
pnpm --dir examples/scripting-sandbox/native-client build
pnpm --dir examples/scripting-sandbox/native-client start -- --endpoint ws://127.0.0.1:2568
```

Start a second client in another terminal to see shared player movement. Keep the workbench open at `http://127.0.0.1:5173`, connect it to the same endpoint, and share a client script to hot reload it in connected clients.

The default endpoint is `ws://127.0.0.1:2568`, so the `--endpoint` argument can be omitted for local play. Use another WebSocket endpoint to connect over a trusted local network.

To validate Perry compilation without linking or opening a native window, run:

```sh
pnpm --dir examples/scripting-sandbox/native-client compile:check
```

Run `pnpm install` from `examples/scripting-sandbox/` before using these commands. This sample has no login or publisher roles; all connected example clients can publish scripts through the `scripting-manager` room.
