---
title: Reference
description: Read how the BornEngine layers fit together and how to move an older project to the current API.
section: Reference
order: 0
---

The reference section explains how BornEngine is built and what changed between releases. Read it when you want to know where a problem could come from, or when you update a project that was written for an older version.

- [Architecture](./architecture/) shows how the TypeScript API, the Perry compiler, the Rust platform crates, and the graphics or browser backends fit together, and follows one draw call from your code to the screen.
- [Migration](./migration/) lists the APIs that were replaced or removed, including the old free functions, `Game.run(callbacks)`, and `GameStorage`, and gives the replacement for each one.

Other pages cover the same ground from a different side:

- [Platforms](../platforms/) compares the targets and their toolchains.
- [API shape](../concepts/api-shape/) explains why the public API is built from classes.
- [Troubleshooting](../troubleshooting/) lists errors by symptom.
- [CLI](../cli/) documents every `bornengine` command.
