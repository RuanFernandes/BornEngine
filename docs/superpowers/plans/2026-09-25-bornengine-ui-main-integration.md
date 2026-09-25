# UI integration and release preparation

## Goal

Rebase the egui production UI and optional Dear ImGui debug UI onto the latest
`main`, preserve the Game API merged by parallel work, document the UI API on
the public site, bump the npm package version, validate the result, and merge a
reviewed pull request.

## Steps

- [x] Commit the isolated UI implementation and rebase it onto `origin/main`.
- [x] Resolve API, navigation, and documentation overlaps while retaining both
  the Game API and the UI APIs.
- [x] Add website documentation for production UI and developer debug UI.
- [x] Bump the npm package version for this additive API release.
- [x] Run native, TypeScript/Perry, FFI, and website checks; review the diff.
- [ ] Request code review, open a pull request, and merge it after checks pass.
- [ ] Report the repository's release/tag workflow for publishing to npm.
