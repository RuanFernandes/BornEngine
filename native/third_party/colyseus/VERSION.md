# Colyseus Native SDK

- Release: `0.18.7`
- Upstream commit: `c009d7c6e45f2a3d08f78b30e022355ac873c3bc`
- Release asset: `colyseus-all-targets.tar.gz`
- SHA-256: `40f1c6809e7cfb5dcbd2f55c450ed711c67fa68d0f711674dac48088b217b4be`
- Source: https://github.com/colyseus/native-sdk
- Source submodule: `native/third_party/colyseus-sdk-src` at the pinned commit above

The headers and upstream per-platform release archives are from the release asset. The Linux x86_64 build uses `lib/linux-x86_64/libcolyseus_bundled.a`, which combines `libcolyseus.a` with its static dependencies. That combined archive was built from the pinned upstream source and is the only target enabled by `native/shared/build.rs` today.

The release tarball's Linux archive alone is not self-contained: final executables also need HTTP, MsgPack, WebSocket, and TLS libraries. The combined archive contains that closure and is required for consumer linking.

The SDK source and its nested dependencies are pinned by git submodules. Rebuild an archive for a Rust target with Zig 0.15.2:

```sh
tools/build-colyseus-sdk.sh x86_64-unknown-linux-gnu
```

The script builds with `zig build -Dtarget="$TARGET" -Doptimize=ReleaseFast -Dexamples=false -Dskip-integration=true`, merges every static dependency into the platform's bundled archive, and copies the SDK core archive alongside it for the Rust FFI declaration. It also preserves upstream and dependency licenses in the platform's `licenses/` directory and records the build inputs in `BUILD-MANIFEST.txt`.

Additional target archives are enabled only after their complete dependency closures and target link builds are validated. The source submodule is a build-time dependency; the npm package allowlist includes only `native/third_party/colyseus/**`, so it does not ship the SDK source checkout.
