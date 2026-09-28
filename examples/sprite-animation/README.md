# Sprite animation

This sample shows a `Game` subclass driving a scene with an atlas-backed sprite, a `SpriteAnimator` state machine, and a `ParticleEmitter2D`. A named marker on the attack animation emits a burst on the impact frame; the same emitter also produces a light continuous trail.

Run it from the repository root after installing the engine package:

```sh
cd examples/sprite-animation
npm install
bornengine run main.ts
```

Use WASD or the arrow keys to move. Press Space to attack. The six 32×32 cells in `assets/atlas.png` contain the idle, walk, attack, and spark frames used by the demo.
