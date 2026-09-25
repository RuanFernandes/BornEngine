# API Design — Flat Native API and Optional Game Runtime

BornEngine has a function-and-handle API for direct access to native engine
systems. The optional `@bornengine/engine/game` module adds a class-based
TypeScript runtime with `GameObject`, `GameComponent`, and `GameScene`, including
user-defined subclasses. This document explains why both surfaces are useful.

The native boundary continues to use scalar values and numeric handles. Game
objects, components, transforms, and user subclasses stay inside Perry-compiled
TypeScript; adapters pass only existing handles and math values to native APIs.

## The core API's rationale (README)

> **Simple API** — Functions, not classes. The entire API fits on a cheatsheet.

That one-liner describes the low-level modules. The game module offers an
additional object-oriented workflow for gameplay code.

## Why the native API stays flat

Three design perspectives help explain the benefits of a small, flat native API.
They inform that layer's design while the gameplay runtime handles object
identity, lifecycle, and user-defined behavior in TypeScript.

### 1. The performance / data-oriented camp

Mike Acton (then Engine Director at Insomniac Games, later Unity DOTS) gave the
definitive talk on this at CppCon 2014. The core claim: OOP organizes source
code around *data types* rather than physically grouping fields and arrays for
cache-friendly access. Cache-coherent data layout can yield 10×+ speedups that
class-per-entity models actively work against, because each object scatters its
fields across the heap instead of packing related values contiguously.

Casey Muratori (Handmade Hero, ex-RAD Game Tools) has spent years arguing that
OOP is "a deeply flawed programming methodology." His 2024 talk on the 35-year
history of OOP traces how a specific approach to organizing code "created
decades of unnecessary complexity in software development," and argues for
compression-oriented / data-oriented programming as the alternative.

Jonathan Blow (Jai, Braid, The Witness) has made similar arguments across many
talks: deep class hierarchies are a cost that gameplay code almost never
recovers value from, and the industry has spent too long pretending otherwise.

These arguments are strongest for large, data-oriented simulations. The
function-based native API keeps those data and resource operations explicit.

### 2. The ECS / composition-over-inheritance camp

Every major game engine has, over the last decade, built an escape hatch out of
its own class-based foundation:

- **Unity** shipped **DOTS** (Data-Oriented Technology Stack) with ECS, Burst,
  and Jobs — explicitly because `MonoBehaviour` hits a wall at scale. Engine
  overhead checking every component for `Update()` each frame, no native
  multithreading, and inheritance breaking Unity's message dispatch (only the
  most-derived class receives messages) are all well-documented pain points.
- **Unreal** shipped **Mass**, an ECS-style framework for large-scale
  simulations, alongside its existing `UObject`/`AActor` hierarchy. The
  `UCLASS`/`GENERATED_BODY()` macro boilerplate, the no-multiple-inheritance
  rule, and the pressure to prefer composition-via-members-of-`UObject`-types
  have been recurring community complaints for years.
- **Bevy**, **Amethyst**, and most new Rust-based engines are **ECS from the
  ground up** — no OOP layer to escape in the first place.

These systems show the value of composition and ECS at scale. BornEngine's
GameComponent model makes composition available alongside user-defined
GameObject subclasses.

### 3. The simplicity / library-design camp

Raylib (the library whose API shape BornEngine most directly echoes) is a flat C99
function API designed to be "learned just from a cheatsheet." Its design notes
explicitly emphasize:

- **Accessibility** — no OOP vocabulary needed to start.
- **Portability** — plain C functions and data bind cleanly to 60+ other
  languages; language-specific wrappers can sit on top.
- **Opt-in abstraction** — a separate `raylib-cpp` wrapper exists for users who
  want OOP on top. The core stays functional.

The flat functions remain a small learning target and a portable foundation.
The optional game module builds on that foundation without changing its native
function signatures.

## How BornEngine compares to Unreal and Unity

| | **Unreal** (`UObject` / `AActor`) | **Unity** (`MonoBehaviour`) | **BornEngine** |
|---|---|---|---|
| Base model | Deep `UObject` inheritance tree, `UCLASS` + `GENERATED_BODY()` macros | Inherit `MonoBehaviour`; engine reflects `Update`/`Start`/etc. per frame | Flat native functions and handles, plus an optional TypeScript GameObject/Component runtime |
| Typical complaints | Macro boilerplate, no multiple inheritance, composition encouraged but inheritance structurally required | Per-frame method-lookup overhead, inheritance breaks Unity messages, no native multithreading | Flat calls stay lightweight; gameplay code can opt into objects and components |
| Escape hatch shipped | **Mass** (ECS) for large-scale simulation | **DOTS / ECS / Burst / Jobs** — a whole parallel stack | The flat API and optional class-based game runtime serve different needs |
| Language binding | C++ only | C# only | TypeScript compiles via Perry; only primitive values and handles cross the native ABI |

The observation: both engines support multiple workflows, including ECS for
large simulations. BornEngine keeps its native calls flat and lets gameplay code
choose the TypeScript game runtime when scene objects and callbacks help.

## The Perry FFI boundary

BornEngine compiles TypeScript through [Perry](../../perry/perry) (our AOT compiler)
and hands data across an FFI boundary to platform-specific Rust crates. The
boundary has a specific shape, documented in `CLAUDE.md` and `package.json`:

- **~465 `bloom_*` FFI functions** declared in `package.json` under
  `perry.nativeLibrary.functions`.
- **Native platforms** use `#[no_mangle] extern "C"` — a C ABI.
- **Web** uses `#[wasm_bindgen]`; Perry's runtime decodes NaN-boxed args
  (`wrapFfiForI64`) and the JS glue routes strings to `_str` variants.
- **String parameters** are `i64` Perry StringHeader pointers on native, NaN-
  boxed IDs on web.
- **Handles** (textures, sounds, models, physics bodies) are all `i64` / plain
  integers, indexing into per-subsystem registries on the Rust side (e.g.
  `physics_jolt.rs`'s handle registries).

This boundary favors functions and plain data for calls into native code. It
sets a boundary for class instances: they remain in TypeScript rather than
crossing the ABI. The game runtime follows that rule while using ordinary
classes and method dispatch on the TypeScript side:

- **Free functions map 1:1 to C ABI entries.** A call like
  `drawText(text, x, y, size, color)` is exactly one FFI function with scalar
  arguments. There is no hidden receiver, no vtable, no `this`.
- **Plain-data interfaces map 1:1 to FFI argument lists.** `Texture` is a
  handle plus width/height; it can be passed through the boundary by value or
  reconstructed from a handle. A class instance stays in TypeScript; its
  adapter calls native functions with the numeric handle and primitive values.
- **Handle-based identity is already how the engine is structured.** Every
  subsystem already stores its real state in a Rust-side registry keyed by an
  integer handle — that's the natural representation for a resource owned by
  native code and referenced from TypeScript. The gameplay classes add
  lifecycle, hierarchy, and composition in TypeScript; their adapters pass
  those handles to native calls when they need to operate on a resource.

The native Rust side remains data-oriented. On the TypeScript side, developers
can call those functions directly or use GameObject, GameComponent, and
GameScene. No user subclass or component instance crosses the FFI boundary.

## What this looks like in practice

For direct access to native resources, the API remains function-based:

```typescript
// Data:
interface Vec3    { x: number; y: number; z: number }
interface Texture { handle: number; width: number; height: number }
interface Sound   { handle: number }
interface Model   { handle: number; meshCount: number; materialCount: number; transform: Mat4 }

// Functions operate on data:
const tex  = loadTexture("assets/hero.png");
const snd  = loadSound("assets/jump.wav");
drawTexture(tex, 100, 200, Colors.WHITE);
playSound(snd);
unloadTexture(tex);
```

The optional game module provides an object-based workflow for gameplay code:

```typescript
import { GameObject, GameScene } from '@bornengine/engine/game';

class Player extends GameObject {
  update(dt: number): void {
    this.transform.position.x += dt;
  }
}

const scene = new GameScene();
scene.add(new Player({ name: 'Player' }));
```

Both workflows call the same native functions and use the existing numeric
resource handles.

## Tradeoffs of the flat native API

This section is deliberately here to keep the doc honest.

- **No object lifecycle in the low-level modules.** Code using only core
  functions owns its update order and dispatch. The optional game module adds
  `onAwake`, `onStart`, `update`, `fixedUpdate`, and `onDestroy` callbacks.
- **No RAII for engine resources.** Textures, sounds, and models must be
  explicitly unloaded. TypeScript has no destructors, and the FFI boundary
  would not respect them even if it did.
- **Direct resource operations remain module based.** You can use the native
  functions in `audio`, `textures`, and other modules from any game object.
  The [module list](../README.md#modules) is the map.

These tradeoffs keep the low-level API explicit and portable. The game module
adds object lifecycle and composition for projects that benefit from them.

## References

Performance / data-oriented design:
- [Data-Oriented Design and C++ — Mike Acton, CppCon 2014](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- [Data-oriented design — Wikipedia](https://en.wikipedia.org/wiki/Data-oriented_design)
- [Developing a Data-Oriented Game Engine — Daniel Sefton](https://danielsefton.com/2016/05/developing-a-data-oriented-game-engine-part-1/)
- [The Downfall of Object-Oriented Programming — Casey Muratori](https://gist.ly/youtube-summarizer/the-downfall-of-object-oriented-programming-with-casey-muratori)
- [Programming Community Debates 35-Year OOP Mistake — BigGo News](https://biggo.com/news/202507241923_Programming_Community_Debates_OOP_Mistake)
- [Casey Muratori on OOP — Alejandro M. P.](https://alejandromp.com/development/blog/casey-muratori-about-oop/)
- [Why are we not using Object Oriented Programming? — Handmade Network](https://hero.handmade.network/forums/code-discussion/t/209-why_are_we_not_using_object_oriented_programming)

ECS and composition over inheritance:
- [Entity component system — Wikipedia](https://en.wikipedia.org/wiki/Entity_component_system)
- [Nomad Game Engine Part 2: ECS — Down with inheritance!](https://medium.com/@savas/nomad-game-engine-part-2-ecs-9132829188e5)
- [ECS 1: Inheritance vs Composition — LeatherBee Games](https://leatherbee.org/index.php/2019/09/12/ecs-1-inheritance-vs-composition-and-ecs-background/)

Unity:
- [The Constraints of MonoBehaviour — Roydon, Medium](https://medium.com/@roystharayil/the-constraints-of-monobehaviour-analyzing-its-impact-on-unity-development-9973d9087765)
- [When 100 Enemies Brought My Game to Its Knees (Unity ECS) — Outscal](https://outscal.com/blog/entity-component-system-csharp-guide)

Unreal:
- [Why does Unreal Engine use inheritance? — Epic Developer Community Forums](https://forums.unrealengine.com/t/why-does-unreal-engine-use-inheritance/253750)

Raylib (API-shape prior art):
- [raylib — GitHub](https://github.com/raysan5/raylib)
- [raylib — Wikipedia](https://en.wikipedia.org/wiki/Raylib)
