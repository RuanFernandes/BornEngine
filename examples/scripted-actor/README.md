# Scripted actor

This example runs a self-contained JavaScript behavior inside a `ScriptComponent` attached to a `GameObject`. The guest moves the player and emits a burst through the `ParticleEmitter2D` attached to that same object. A second component receives only the `log` capability and reports that transform and particle APIs are absent.

The canonical guest module is `scripts/actor.js`. Run `npm run prepare:script` after editing it; the command embeds the exact module source for Perry's TypeScript build. `bornengine.script.json` records the example's entry point and requested capabilities as project metadata. The current BornEngine CLI does not validate or package this manifest; runtime permissions are set explicitly in host TypeScript.

```sh
npm run build
```

`ScriptComponent` v1 accepts module source text; this example embeds that text into the host build rather than loading files from a package directory at runtime.

Run the game with `perry compile main.ts` from this directory. If the optional Dear ImGui inspector is available, the Scripts panel shows each component's status, guest heap use, last callback cost, and current error.
