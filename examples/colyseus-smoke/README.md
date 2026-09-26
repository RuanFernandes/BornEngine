# Colyseus Native SDK smoke test

This example checks the BornEngine TypeScript façade against the repository-owned Colyseus test server in `../../tests/colyseus/server`.

From the BornEngine repository root, install the fixture dependencies and run its contract:

```sh
npm ci --prefix tests/colyseus/server
node tests/colyseus/run-server-smoke.mjs
```

The runner starts the server and cleans it up when the contract finishes. To run the BornEngine native client separately, start the server with `npm start --prefix tests/colyseus/server`, then compile and run the native TypeScript client from this directory:

```sh
npm install
npm test
```

The example joins `test_room`, observes synchronized state, sends and receives a room message, then leaves. It currently requires Linux x86_64 and the Perry compiler.
