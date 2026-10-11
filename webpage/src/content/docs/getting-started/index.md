---
title: Getting started
description: Install the BornEngine toolchain, create a project, and build a first game object.
section: Getting Started
order: 1
---

BornEngine is a game engine you program in TypeScript. You write a class for your game, a class for each screen or level, and classes for the objects in them. The same TypeScript code can target native desktop and mobile apps and the browser, within the limits listed on the [platform pages](../platforms/). Native builds go through the Perry compiler and the engine's Rust libraries. Web builds use WebAssembly.

This section takes you from an empty folder to a game object you control with the keyboard.

## The path

1. [Installation](./installation/) installs the BornEngine CLI, the Perry compiler, and the Rust toolchain.
2. [Quickstart](./quickstart/) creates a project, runs the starter game, and explains the file it generates.
3. [Your first player](./first-player/) builds a player object that moves with the arrow keys, draws a sprite, and is followed by a camera.
4. [Project structure](./project-structure/) explains each file and folder the CLI creates.

After that, read the [concepts](../concepts/) to understand the game loop, scenes, objects, components, and assets. The [guides](../guides/) show complete games for 2D, 3D, physics, audio, and multiplayer. The [API reference](../api/) lists every module.

## What you need

- A terminal and a text editor.
- Basic TypeScript: classes, methods, and `import`. If classes are new to you, read the [TypeScript handbook section on classes](https://www.typescriptlang.org/docs/handbook/2/classes.html) first.
- The toolchain from the installation page. Nothing else is required for the first steps.

## How the site is organized

- **Getting started** gets your first game running.
- **Concepts** explains the ideas that every BornEngine program uses.
- **CLI** documents each `bornengine` command.
- **API** documents each module, with examples.
- **Guides** build complete features step by step.
- **Platforms** lists the targets and what each one needs.
- **Reference** covers architecture and version migration.
- **Troubleshooting** starts with the checks to run when something fails.
