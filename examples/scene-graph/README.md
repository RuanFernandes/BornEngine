# Scene graph samples

Each TypeScript file is a standalone BornEngine program. Install the local
engine dependency, then compile the sample you want to run:

```sh
npm install
perry compile main.ts --target linux -o scene-graph-main
perry compile interactive.ts --target linux -o scene-graph-interactive
perry compile room.ts --target linux -o scene-graph-room
perry compile shadows.ts --target linux -o scene-graph-shadows
perry compile r3f-bridge.ts --target linux -o scene-graph-r3f-bridge
```

Run the generated executable from this directory so relative asset paths
resolve. `interactive.ts` demonstrates selecting and editing walls;
`room.ts` and `shadows.ts` demonstrate retained scene geometry and lighting;
`r3f-bridge.ts` requires the Perry React Three Fiber bridge package in the
Perry toolchain.
