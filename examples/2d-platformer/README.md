# 2D platformer

A compact code-first platformer showing the 2D scene lifecycle, tilemap-authored
static collisions, a kinematic character, a follow camera, sprite animation,
animation markers, pooled particles, and managed sound effects. Tilemap cells
define the solid regions; lightweight scene components draw the platform faces.

From this directory, install the local engine dependency and run the game with
the BornEngine CLI:

```sh
npm install
bornengine run main.ts
```

Move with **A/D** or the arrow keys and jump with **Space**. The small atlas and
sound are included in `assets/` so the example does not depend on another
sample's files.
