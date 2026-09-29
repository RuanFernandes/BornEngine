# 2D top-down room

A data-driven room example using the versioned World2D format, logical viewport,
camera rig, configurable action map, preload group, and positional 2D audio.
The room JSON and its atlas live under assets/.

From this directory, install the local engine dependency and run the game with
the BornEngine CLI:

~~~sh
npm install
bornengine run main.ts
~~~

Move with WASD or the arrow keys. Press **R** to switch to I/J/K/L, and press **Space**
to play the positional chime. The alternate key layout is session-local in this
room example. For durable saves or settings, use the typed SQLite
[GameDatabase API](https://ruanfernandes.github.io/BornEngine/docs/api/storage/).
