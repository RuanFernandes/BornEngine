# Colyseus Cross-Platform Integration Design

**Status:** Proposed for review

**Date:** 2026-09-26

## Intent

Make the existing Colyseus TypeScript client usable across all nine targets declared by BornEngine: macOS, iOS, tvOS, visionOS, watchOS, Windows, Linux, Android, and Web. Keep a consistent TypeScript-facing client and verify each platform with a build or runtime check appropriate to that platform.

The user approved using GitHub-hosted runners for native platform validation. The available Docker daemon on the development host is Linux/amd64; Docker remains useful for Linux build environments and test services, not for providing macOS or Windows kernels.

## Current state and constraints

- The TypeScript facade and Rust FFI currently use the Colyseus C SDK on Linux x86_64 GNU libc, with the full static dependency closure bundled for that target.
- Other targets currently compile unsupported-platform stubs or have no Colyseus transport integration.
- BornEngine declares nine platform targets in `package.json`.
- The Colyseus Native SDK README lists its prebuilt C API releases for Windows, macOS, Linux, iOS, and WebAssembly. It lists other platform coverage for some engine-specific SDKs, but that does not establish that the same C API binary or behavior is available there.
- Therefore, integration must distinguish upstream C API availability from BornEngine target availability. A platform must not be reported as supported merely because its FFI stub compiles.

## Approaches considered

### A. One TypeScript API with platform backends and native CI — recommended

Keep `ColyseusClient` and `Room` as the public API. Select an implementation behind the FFI boundary for each target: use the upstream C API where it can be built and linked; use an official platform client adapter where the C API is unavailable or incompatible with the target runtime; build the SDK from source for additional native targets only after a target-specific feasibility check. Run platform jobs on GitHub-hosted runners that match the OS/toolchain, with Docker used for Linux-only build containers and test services.

This meets the all-target goal while making support claims depend on evidence. The trade-off is maintaining more than one transport backend and keeping their behavior aligned.

### B. Restrict support to upstream C API release targets

Use the static C API only for its documented release targets and keep explicit errors on the other BornEngine targets. This minimizes implementation and maintenance work, but does not meet the request to cover all nine targets.

### C. Use Docker cross-compilation as the platform test strategy

Build foreign targets from Linux containers, optionally with emulation. This can check some compiler and linker paths, but it cannot validate macOS frameworks/Xcode behavior or genuine Windows/macOS runtime behavior from the current Linux host. It provides weaker evidence than native runners and is not recommended as the only platform strategy.

## Proposed architecture

### Public API and backend boundary

- Preserve the existing TypeScript-facing `ColyseusClient` and `Room` API while adding no platform-specific types to game code.
- Keep event delivery, room handles, polling, and error conversion behind the current FFI/client boundary.
- Select a backend at build time for each BornEngine target. Prefer the upstream C API where its artifact or source build works. Use the official Colyseus JavaScript client for the browser target if the C/WASM artifact cannot satisfy browser networking and runtime requirements.
- For targets without an officially published C artifact, first test whether the pinned upstream source can build for that target with the platform toolchain. If it cannot, evaluate an official platform-specific client adapter. Do not silently use the unsupported stub or label the target supported without the acceptance evidence below.
- Keep protocol and API parity at the currently exposed BornEngine surface: matchmaking, state snapshots, JSON and binary messages, request/reply, lifecycle events, polling, reconnection entry point, and cleanup. Expanding to every Colyseus SDK feature is a separate scope.

### Platform build and validation matrix

| BornEngine target | Build/validation environment | Minimum evidence |
| --- | --- | --- |
| Linux | GitHub-hosted Ubuntu runner; Docker may provide pinned build dependencies | Native build and Colyseus smoke test on an available runner architecture |
| Windows | GitHub-hosted Windows runner | Native build/link and Windows runtime smoke test |
| macOS | GitHub-hosted macOS runner with Xcode tools | Native build/link and runtime smoke test |
| iOS | macOS/Xcode runner | Device and simulator compile/link checks; simulator smoke test |
| tvOS | macOS/Xcode runner | SDK/simulator compile/link check and simulator smoke test |
| visionOS | macOS/Xcode runner | SDK/simulator compile/link check and simulator smoke test |
| watchOS | macOS/Xcode runner | SDK/simulator compile/link check and simulator smoke test |
| Android | Ubuntu runner with Android NDK and emulator tooling | ABI build/link checks and emulator smoke test |
| Web | Ubuntu runner with the WebAssembly toolchain and browser automation | Web build and browser smoke test against the test server |

GitHub Actions jobs must use native OS runners for Windows and Apple toolchains. Cross-compilation can supplement those jobs, but it does not replace the native build or runtime evidence. If a hosted runner cannot execute a device or simulator test for a target, report that target as build-verified only until a runtime runner is available.

### Integration smoke test

Run each runtime-capable target against a minimal Colyseus server fixture owned by the repository so CI does not depend on an untracked sibling directory. The smoke test should join a room, receive an initial state, exchange a message, verify request/reply, leave, and dispose the client. Exercise binary messages and explicit reconnect where the platform test harness can do so reliably. Keep unit tests for serialization, event mapping, and unsupported-target errors independent from network availability.

### Support reporting

- Maintain a checked-in platform matrix that distinguishes build-verified, runtime-verified, and unsupported states.
- A target is runtime-verified only after the native-platform smoke test passes against the fixture.
- A target that compiles but has no working transport must report an explicit unsupported error and remain outside the supported count.
- Documentation must describe per-target gaps instead of implying that one C archive serves every platform.

## Acceptance criteria

1. The public TypeScript entry point remains consistent across all nine BornEngine targets.
2. Each target has a working transport backend; an unsupported stub cannot count as platform support. Use the upstream C API where available and a compatible official adapter or source build for other targets.
3. GitHub Actions builds each target with its native OS/toolchain where required, including Windows and macOS runners.
4. Each target passes the Colyseus room smoke test in its native runner, simulator, emulator, or browser environment for join, state, message, request/reply, leave, and cleanup.
5. Existing Linux behavior continues to pass the current Colyseus integration smoke test.
6. The site documentation and platform support matrix match the tested implementation.

## Risks and boundaries

- The official C API artifact list does not cover all nine BornEngine targets. Additional source builds or official client adapters may be required, and some targets may expose upstream limitations.
- Platform-specific transports can drift. Shared TypeScript tests and the same server fixture should enforce matching behavior.
- Apple device behavior cannot be proven by an SDK compile or simulator alone. Device-only features require physical hardware for full runtime verification.
- This design does not claim parity with every feature in every Colyseus SDK. It targets the existing BornEngine facade surface.
- Adding native GitHub Actions jobs can increase CI time and may consume private-repository runner minutes.

## References

- [Colyseus Native SDK platform and build information](https://github.com/colyseus/native-sdk/blob/main/README.md)
- [Docker Desktop platform behavior](https://docs.docker.com/faqs/platform/)
- [GitHub-hosted Actions runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
