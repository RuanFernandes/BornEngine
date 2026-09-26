---
title: Troubleshooting
description: Diagnose BornEngine from the first failing toolchain check instead of guessing at the linker error.
section: Troubleshooting
order: 70
---

## Start with the doctor

```sh
bornengine doctor
```

Fix the first failing check and run it again. Game projects need Perry, a package manager, Rust/Cargo, and the host backend.

## Common failures

- **Perry not found:** install Perry and ensure `perry` is on `PATH`.
- **Package manager missing:** install the manager selected by the project.
- **Linux link errors:** install `pkg-config`, X11/XI headers, and ALSA headers.
- **Missing Perry runtime archive:** follow Perry's diagnostic to install or build the matching runtime.
- **Target rejected:** inspect `perry compile --help`; only targets advertised by the installed compiler are valid.
- **Web game never starts:** check the Game `isReady` and `error` values, build with the Web/WASM flow, and serve the output over HTTP rather than opening the HTML file directly.
- **Apple build is a black screen:** confirm the appropriate iOS game-loop or watchOS shell feature and inspect the platform guide.
- **Assets disappear on device:** use project-relative asset paths; Apple reads from the app bundle rather than the process working directory.
- **Resource is unavailable:** inspect its `isLoaded` and `error` properties, then confirm it was constructed with the active Game and not disposed early.

When asking for help, include `bornengine info`, the first failing `doctor` check, the target, and the exact command. Earlier toolchain output usually names the missing dependency.
