# Vendored Colyseus Native SDK

This directory contains the public headers and release archives from Colyseus Native SDK 0.18.7. See `VERSION.md` for the upstream commit, release asset checksum, reproducible archive build command, and platform support status.

BornEngine currently links the complete static SDK closure for Linux x86_64. Other upstream release archives are present but are not yet enabled because their transitive libraries have not been packaged and tested.

The pinned upstream source checkout is a build-time git submodule at `native/third_party/colyseus-sdk-src`. The public API is declared in `include/colyseus.h`. The engine's Rust bridge is in `native/shared/src/colyseus.rs`; the TypeScript façade is exported from `@bornengine/engine/colyseus`.
