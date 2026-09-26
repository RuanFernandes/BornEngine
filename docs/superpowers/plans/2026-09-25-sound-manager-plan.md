# Sound Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named sound/music management, per-event cooldown and pitch/volume variation, per-scene disposal, and public asset unloading without closing the shared audio device.

**Architecture:** Add unload and non-spatial controllable-voice operations to the shared mixer and expose matching symbols on Web and watchOS. Implement `SoundManager` in Perry TypeScript over existing sound/music handles, buses, and voice controls; it falls back to fire-and-forget 2D playback where controllable voices are unavailable.

**Tech Stack:** Perry TypeScript, Rust shared audio mixer/SPSC FFI, WebAudio Rust wrapper, watchOS Swift AVAudioPlayer wrapper, Node docs checks, Cargo tests.

**Spec:** `docs/superpowers/specs/2026-09-25-game-scenes-audio-input-design.md` (SoundManager)

## Global Constraints

- Keep the procedural engine API as the low-level foundation.
- Keep all new class instances in Perry-compiled TypeScript. FFI receives only numeric handles, scalar settings, and existing plain transform/input data.
- Preserve asynchronous and native ownership constraints from the existing audio, renderer, physics, and mobile systems.
- Master volume and bus gains belong to the shared mixer and therefore affect all managers.
- Every supported Perry target exposes the required native audio symbols, with unsupported controllable-voice features using the documented fallback.
- Update API documentation with imports, lifecycle order, loop integration, ownership rules, action snapshots, and the distinction between the OOP layer and the low-level functions.

## Review Focus

- Unloading active music stops its render voice, invalidates the old generational handle, and cannot target a later asset.
- Unloading a sound clears its routing/volume settings while currently playing samples remain alive until stopped or naturally finished.
- Cooldown is shared between 2D and 3D plays of one named effect and advances only when `update(dt)` runs.
- Pitch/volume ranges affect only the current 2D voice; targets without controllable 2D voices use ordinary playback.
- `dispose()` stops and releases only handles owned by that manager and never closes audio used by other managers.

---

### Task 1: Add shared-mixer unload and non-spatial voice operations

**Files:**
- Modify: `native/shared/src/audio/mod.rs`
- Modify: `native/shared/src/audio/render.rs` only if the existing `Cmd::PlaySound` path needs a missing field

**Interfaces:**
- Consumes: `AudioMixer::send_play`, `HandleRegistry`, `Cmd::PlaySound`, `Cmd::StopMusic`, and the existing `tone()` unit-test helper.
- Produces: `AudioMixer::play_sound_ex(handle) -> f64` and `AudioMixer::unload_music(handle)`; `unload_sound` also clears route metadata.

- [ ] **Step 1: Add failing mixer tests**

Add these Rust tests inside `native/shared/src/audio/mod.rs`'s existing `tests` module, alongside the existing `tone()` helper:

~~~rust
#[test]
fn unload_music_stops_and_invalidates_the_handle() {
    let mut audio = AudioMixer::new();
    let old = audio.load_music(tone(64));
    audio.play_music(old);
    assert!(audio.is_music_playing(old));
    audio.unload_music(old);
    assert!(!audio.is_music_playing(old));
    let new = audio.load_music(tone(64));
    assert_ne!(old, new);
    audio.play_music(old);
    assert!(!audio.is_music_playing(old));
}

#[test]
fn non_spatial_voice_returns_a_controllable_voice_id() {
    let mut audio = AudioMixer::new();
    let sound = audio.load_sound(tone(4096));
    let voice = audio.play_sound_ex(sound);
    assert_ne!(voice, 0.0);
    audio.set_voice_pitch(voice, 1.25);
    audio.set_voice_volume(voice, 0.5);
    let mut output = [0.0f32; 256];
    audio.mix_output(&mut output);
    assert!(output.iter().any(|sample| *sample != 0.0));
}

#[test]
fn unload_sound_clears_routing_and_volume_state() {
    let mut audio = AudioMixer::new();
    let sound = audio.load_sound(tone(64));
    audio.set_sound_bus(sound, render::bus::UI);
    audio.set_sound_volume(sound, 0.25);
    audio.unload_sound(sound);
    assert!(!audio.routes.contains_key(&sound.to_bits()));
    assert!(!audio.sound_volumes.iter().any(|entry| entry.0 == sound));
}
~~~

- [ ] **Step 2: Run the focused Rust tests and confirm the missing methods fail**

Run: `cd native/shared && cargo test --release audio::tests::unload_music_stops_and_invalidates_the_handle`

Expected: compilation fails because `unload_music` and `play_sound_ex` do not exist.

- [ ] **Step 3: Implement the shared-mixer methods**

Implement `play_sound_ex` by calling the existing `send_play` path with `spatial: None`, `looping: false`, and the normal reference-distance defaults. Implement `unload_music` by marking `MusicShared.playing` false, enqueueing `Cmd::StopMusic` for the handle, then freeing the registry slot. Remove the sound's route and volume entries inside `unload_sound`.

- [ ] **Step 4: Run focused audio tests**

Run: `cd native/shared && cargo test --release audio::tests::unload_music_stops_and_invalidates_the_handle && cargo test --release audio::tests::non_spatial_voice_returns_a_controllable_voice_id && cargo test --release audio::tests::unload_sound_clears_routing_and_volume_state && cargo test --release audio::tests::unload_mid_playback_is_graceful`

Expected: stale music handles are inert, a 2D voice produces output and accepts controls, and unloaded sound samples already held by voices still finish safely.

- [ ] **Step 5: Commit the shared-mixer unit**

~~~sh
git add native/shared/src/audio/mod.rs
git commit -m "feat: add audio asset unload and 2D voices"
~~~

### Task 2: Expose audio operations on every target

**Files:**
- Modify: `package.json` under `perry.nativeLibrary.functions`
- Modify: `native/shared/src/ffi_core/audio_ffi.rs`
- Modify: `native/web/src/lib.rs`
- Modify: `native/watchos/src/audio.rs`, `native/watchos/src/lib.rs`, `native/watchos/src/BloomWatchAudio.swift`, and `native/watchos/gen_stubs.js`

**Interfaces:**
- Consumes: Task 1 mixer methods.
- Produces: `bloom_unload_sound(handle)`, `bloom_unload_music(handle)`, and `bloom_play_sound_ex(handle)` with matching manifest arity and return types on every target. watchOS returns voice ID `0` for `play_sound_ex`, signaling the TypeScript fallback.

- [ ] **Step 1: Add manifest entries and shared FFI wrappers**

Register the three symbols with one `f64` parameter; unload functions return `void`, and `bloom_play_sound_ex` returns `f64`. Add wrappers to `audio_ffi.rs`, which is expanded by the existing native platform macro.

- [ ] **Step 2: Add Web and watchOS implementations**

Add the corresponding wasm-bindgen functions in `native/web/src/lib.rs`. For watchOS, retain tombstone slots when unloading AVAudioPlayer handles so stale indices cannot alias later sounds or music; stop a music player before tombstoning it. Add unload calls to Swift and Rust wrappers. Add all three names to the watchOS override list; the two unload functions forward to Swift and `bloom_play_sound_ex` returns `0.0` so TypeScript falls back to ordinary `playSound`.

- [ ] **Step 3: Regenerate watchOS stubs and check FFI parity**

Run:

~~~sh
node native/watchos/gen_stubs.js
node tools/validate-ffi.js
~~~

Expected: the watchOS stubs regenerate and every manifest symbol has the expected arity and implementation/stub on all targets.

- [ ] **Step 4: Compile shared native and Web paths**

Run:

~~~sh
cd native/shared && cargo check
cd ../web && cargo check --target wasm32-unknown-unknown --no-default-features --features web
~~~

Expected: shared native and WASM wrappers compile with matching signatures.

- [ ] **Step 5: Commit target bindings**

~~~sh
git add package.json native/shared/src/ffi_core/audio_ffi.rs native/web/src/lib.rs native/watchos/src/audio.rs native/watchos/src/lib.rs native/watchos/src/BloomWatchAudio.swift native/watchos/gen_stubs.js native/watchos/src/ffi_stubs.rs
git commit -m "feat: expose audio unload functions across targets"
~~~

### Task 3: Add TypeScript audio helpers and SoundManager

**Files:**
- Create: `src/audio/sound-manager.ts`
- Modify: `src/audio/index.ts`
- Modify: `src/index.ts`
- Modify: `tests/game-runtime/audio-manager.ts`
- Modify: `tests/game-runtime/perry-compat.ts`

**Interfaces:**
- Consumes: low-level load/play/stop/unload, bus, music, spatial, voice controls, and `randomFloat`.
- Produces: `SoundManager` named registries, cooldown/variation behavior, per-name unload, `update(dt)`, and exported `playSoundEx`, `unloadSound`, `unloadMusic` helpers.

- [ ] **Step 1: Add the manager runtime fixture**

Create `tests/game-runtime/audio-manager.ts`. Load `tests/game-runtime/assets/tone.wav` after `initAudio()`. Assert same-name/same-path loads reuse the handle and first options, a conflicting path and reversed ranges return `null`, a 0.25-second cooldown blocks both `playSound` and `play3D` and permits a play after `update(0.25)`, switching named music stops the manager's earlier track, `stopMusic()` without a name stops every track registered with that manager, named unload rejects later plays, and `dispose()` is idempotent. Own the manager through a `Scene` in one assertion. Start a separate low-level music handle before disposing the manager and assert it remains playing afterward; close the global device explicitly after all assertions.

- [ ] **Step 2: Run the fixture to confirm it fails**

Run: `python3 tests/game-runtime/make-tone.py && perry run macos tests/game-runtime/audio-manager.ts`

Expected: compilation fails because `SoundManager` and the public unload helpers are not exported.

- [ ] **Step 3: Add low-level TypeScript wrappers**

In `src/audio/index.ts`, declare and wrap the three new FFI functions. `playSoundEx(sound)` returns a voice ID, `unloadSound(sound)` releases one handle, and `unloadMusic(music)` stops/releases one handle. Keep existing wrappers and handle shapes unchanged.

- [ ] **Step 4: Implement SoundManager**

Create `src/audio/sound-manager.ts`. Keep separate sound/music registries keyed by names. Reject empty names/paths, handle `0`, conflicting paths, invalid ranges, and calls after disposal. Apply base bus/send/low-pass/volume on first sound registration. Use `randomFloat` for each configured volume/pitch multiplier. Track per-name elapsed cooldown; use `playSoundEx` and per-voice setters for 2D, falling back to existing `playSound` when the target returns `0`. Track `play3D` voice IDs by sound name. Named stop/unload and `dispose()` stop owned voices before releasing handles; never call `closeAudio`.

For music, retain the numeric handle returned by `loadMusicRaw()` alongside the public `{ handle }` value. Use the existing raw numeric helpers (`playMusicRaw`, `stopMusicRaw`, `setMusicVolumeRaw`, and `updateMusicStreamRaw`) and add an internal raw unload helper for the manager path. This avoids Perry's documented Android bug where a Music field read passed directly to an `f64` FFI slot becomes NaN.

- [ ] **Step 5: Export and run the manager checks**

Export `SoundManager` and its option types from `src/audio/index.ts` and the package root. Add a compatibility fixture that loads a named sound, configures it, updates the manager, and disposes it.

Run:

~~~sh
python3 tests/game-runtime/make-tone.py
perry run macos tests/game-runtime/audio-manager.ts
for target in macos windows linux ios tvos watchos android visionos web; do
  perry check --strict --target "$target" tests/game-runtime/perry-compat.ts || exit 1
done
~~~

Expected: cooldown, named unloading, and disposal assertions pass; all targets accept the public API and watchOS compiles the 2D fallback.

- [ ] **Step 6: Commit the TypeScript manager unit**

~~~sh
git add src/audio/sound-manager.ts src/audio/index.ts src/index.ts tests/game-runtime/audio-manager.ts tests/game-runtime/perry-compat.ts
git commit -m "feat: add named sound manager"
~~~

### Task 4: Document named audio and ownership

**Files:**
- Modify: `webpage/src/content/docs/api/audio.md`
- Modify: `webpage/src/data/docs-coverage.mjs`
- Modify: `webpage/tests/docs-coverage.test.mjs`

**Interfaces:**
- Consumes: Task 3 manager API.
- Produces: documentation for named loads, 2D/3D play, cooldown/ranges, per-scene ownership, update timing, and unload methods.

- [ ] **Step 1: Require a SoundManager docs section**

Add `Sound manager` to the `audio` page's required sections in `docs-coverage.mjs`.

Run: `cd webpage && node --test tests/docs-coverage.test.mjs`

Expected: the audio coverage test fails until the page contains the section and required examples.

- [ ] **Step 2: Update the Audio API page**

Document the `SoundManager` API with examples for named SFX/music and cooldown, how scene ownership calls `update(dt)` and `dispose()`, and the shared scope of master/bus gains. Distinguish the manager from direct low-level functions.

- [ ] **Step 3: Run docs checks and build**

Run: `cd webpage && npm test && npm run check && npm run build && npm run validate:dist`

Expected: docs coverage, Astro validation, static build, and generated-link checks pass.

- [ ] **Step 4: Commit docs**

~~~sh
git add webpage/src/content/docs/api/audio.md webpage/src/data/docs-coverage.mjs webpage/tests/docs-coverage.test.mjs
git commit -m "docs: explain named sound management"
~~~
