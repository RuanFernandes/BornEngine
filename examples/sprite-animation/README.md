# Sprite animation

This sample shows a `Game` subclass driving an atlas-backed sprite, a `SpriteAnimator` state machine, and a `ParticleEmitter2D`. It also binds the same layered `idle`/`walk` template to two combinations of images, demonstrating arbitrary parameter IDs, multi-image frames, and independent playback. A named marker on the attack animation emits a burst on the impact frame; the same emitter also produces a light continuous trail.

From this example's directory, install the local engine dependency and run it:

```sh
npm install
bornengine run main.ts
```

Use WASD or the arrow keys to move. Press Space to attack. The six 32×32 cells in `assets/atlas.png` contain the idle, walk, attack, and spark frames. One template preview binds the original atlas while the other uses a horizontally flipped copy, so the same template displays two image combinations.
