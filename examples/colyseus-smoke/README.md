# Colyseus Native SDK smoke test

This example checks the BornEngine TypeScript façade against the repository-owned Colyseus test server in `../../tests/colyseus/server`.

From the BornEngine repository root, install the fixture dependencies and run its contract:

```sh
npm ci --prefix tests/colyseus/server
node tests/colyseus/run-server-smoke.mjs
```

The runner starts the server and cleans it up when the contract finishes. To run the BornEngine native client from this directory, install the example's local engine dependency and run:

```sh
npm install --no-package-lock
npm test
```

The example joins `test_room`, observes synchronized state, sends and receives messages, sends a movement packet, and waits for the server to publish the new position under that client's session. It currently requires Linux x86_64, the Perry compiler, and a display server.
