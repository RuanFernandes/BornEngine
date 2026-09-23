---
title: Troubleshooting
description: Diagnose BornEngine from the first failing toolchain check instead of guessing at the final linker error.
section: Troubleshooting
order: 70
---

## Start with the doctor

```sh
bornengine doctor
```

Fix the first failing check and run it again. The CLI itself is Rust-based; the generated game project still needs Perry, a package manager, Node.js, Rust/Cargo, and the host backend.

## Common failures

- **Perry not found:** install Perry and ensure `perry` is on `PATH`.
- **Package manager missing:** install the manager selected by the project. The default path is `npm install --global pnpm`.
- **Linux link errors:** install `pkg-config`, X11/XI headers, and ALSA headers. On Debian/Ubuntu use `sudo apt install pkg-config libx11-dev libxi-dev libasound2-dev`.
- **Missing Perry runtime archive:** follow Perry's diagnostic to install/build the matching runtime; the BornEngine CLI does not update Perry automatically.
- **Target rejected:** inspect `perry compile --help`; only the installed compiler's advertised targets are valid.
- **Web game never starts:** use `runGame()` rather than a blocking `while` loop and serve `dist/web/` through HTTP instead of opening the HTML file directly.
- **Apple build is a black screen:** confirm the iOS `ios-game-loop` feature or the watchOS Swift app feature is present, then check the relevant platform guide.
- **Assets disappear on device:** use project-relative asset paths; Apple reads from the bundle, not the current working directory.

When asking for help, include `bornengine info`, the first failing `doctor` check, the target, and the exact command. Do not paste only the final linker line; the earlier toolchain output usually names the missing dependency.
