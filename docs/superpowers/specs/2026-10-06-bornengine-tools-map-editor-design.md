# BornEngineTools Map Editor Improvements

## Status

Implementation design is ready for review.

## Goals

- Let the World2D bucket repeat the selected rectangular tileset selection over
  the four-connected region under the cursor.
- Show the exact full-region result as a non-destructive ghost before applying
  the fill, including the repeated tile pattern.
- Add small inline icons beside the map tool labels and the main animation
  editor actions.
- Reduce the size and line count of saved maps without expanding the runtime's
  per-cell model or dropping support for existing map files.

## Bucket behavior

The bucket uses the same four-connected source region as the current tool. The
top-left tile in the selected tileset rectangle aligns with the clicked map
cell; the selected rectangle repeats by its width and height across the region.
Only cells matching the source tile are replaced. Diagonal neighbors stay out
of the region. Hover preview uses the same region and placement calculation as
the edit operation, draws only placements within the visible canvas, and never
changes the document until the user applies the bucket.

Region and placement results are cached for an unchanged layer, seed, source
cell, and tile selection. Document or selection changes invalidate the cache.

## World2D compact storage

The main-tileset/extras model and maximum-compaction proposal are specified in
`2026-10-06-world2d-compact-v2-design.md`. That proposal replaces the earlier
per-row palette/RLE layout and requires user approval before implementation.
Bucket, ghost, and icon requirements in this document remain unchanged.

## Toolbar icons

Keep visible text labels and add fixed, inline SVG icons before them. Icons use
`aria-hidden="true"`; button titles and labels continue to describe the action.
The animation editor applies the same treatment to its primary actions and
new sidebar tab controls. No icon package or external resource is introduced.

## Validation

- Follow the compact-v2 spec for storage migration, codec validation, primary
  and supplemental sources, and file-size acceptance criteria.
- Verify patterned bucket edits and ghost placements agree for single-tile and
  multi-tile selections, boundaries, and disconnected regions.
