# Physics2D and tilemap

This sample uses a fixed-step `PhysicsWorld2D`, a `Tilemap` atlas renderer, and static bodies generated from the map's solid-cell data. A sprite falls onto the ground and platform while the scene updates.

The image is shared with the sprite-animation sample. Run this example from its directory once the engine package has been built or linked:

```sh
npm install
bornengine run main.ts
```

The game loop calls `scenes.update(deltaTime)`. The active scene updates its game objects, then advances physics with `physics.step(deltaTime)`. The scene owns the world, so unloading it releases the bodies.
