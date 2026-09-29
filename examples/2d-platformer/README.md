# 2D platformer

A compact code-first platformer showing the 2D scene lifecycle, tilemap-authored
static collisions, a kinematic character, slopes, a one-way bridge, an opt-in
CCD projectile, a follow camera, sprite animation, markers, pooled particles,
managed sound effects, and typed SQLite persistence. Its versioned save schema
loads progress before the first frame, writes it in a transaction after shutdown,
and verifies export/import using an in-memory restore database. The engine does
not encrypt saves; exported snapshot bytes are ready for a host-provided backup.

From this directory, install the local engine dependency and run the game with
the BornEngine CLI:

```sh
npm install
bornengine run main.ts
```

Move with **A/D** or the arrow keys and jump with **Space**. The small atlas and
sound are included in `assets/` so the example does not depend on another
sample's files. The example creates its database under the platform's app-data
directory. See [GameDatabase](https://ruanfernandes.github.io/BornEngine/docs/api/storage/)
and [Physics 2D](https://ruanfernandes.github.io/BornEngine/docs/api/physics2d/)
for the full contracts and platform limits. `bornengine.assets.json` declares the
runtime-loaded image and sound paths so `bornengine assets validate` can audit
the project without treating them as unreferenced files.
