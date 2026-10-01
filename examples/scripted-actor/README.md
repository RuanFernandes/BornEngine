# Scripted actor

This example runs a self-contained JavaScript behavior inside a `ScriptComponent` attached to a `GameObject`. The guest moves the player and emits a burst through the `ParticleEmitter2D` attached to that same object. A second component receives only the `log` capability and reports that transform and particle APIs are absent.

The canonical guest module is `scripts/actor.js`. Run `npm run prepare:script` after editing it; the command embeds the exact module source for Perry's TypeScript build. The manifest is checked and packaged separately with the BornEngine CLI:

```sh
bornengine script check
bornengine script pack --output dist/scripts/actor
npm run build
```

The package command stages a standalone script package. `ScriptComponent` v1 accepts module source text; this example embeds that text into the host build rather than loading files from the output directory at runtime.

Run the game with `perry compile main.ts` from this directory. If the optional Dear ImGui inspector is available, the Scripts panel shows each component's status, guest heap use, last callback cost, and current error.
