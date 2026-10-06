export interface TileSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TileGridPoint {
  x: number;
  y: number;
}

export interface StampedTile {
  x: number;
  y: number;
  tileId: number;
}

export function tilePaletteDisplayScale(tileWidth: number, tileHeight: number): number {
  if (!Number.isFinite(tileWidth) || !Number.isFinite(tileHeight) || tileWidth <= 0 || tileHeight <= 0) return 1;
  return Math.max(1, 32 / Math.min(tileWidth, tileHeight));
}

export function tileSelectionFromDrag(start: TileGridPoint, end: TileGridPoint): TileSelection {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return {
    x: left,
    y: top,
    width: Math.abs(end.x - start.x) + 1,
    height: Math.abs(end.y - start.y) + 1,
  };
}

export function tileIdsInSelection(selection: TileSelection, columns: number, tileCount: number): number[] {
  if (!Number.isInteger(columns) || columns <= 0 || !Number.isInteger(tileCount) || tileCount <= 0 ||
      !Number.isInteger(selection.x) || !Number.isInteger(selection.y) ||
      !Number.isInteger(selection.width) || !Number.isInteger(selection.height) ||
      selection.x < 0 || selection.y < 0 || selection.width <= 0 || selection.height <= 0) return [];

  const result: number[] = [];
  for (let y = selection.y; y < selection.y + selection.height; y++) {
    for (let x = selection.x; x < selection.x + selection.width; x++) {
      const tileId = y * columns + x;
      if (tileId >= 0 && tileId < tileCount) result.push(tileId);
    }
  }
  return result;
}

export function stampTileSelection(
  selection: TileSelection,
  destination: TileGridPoint,
  columns: number,
  tileCount: number,
  mapWidth: number,
  mapHeight: number,
): StampedTile[] {
  if (!Number.isInteger(mapWidth) || !Number.isInteger(mapHeight) || mapWidth <= 0 || mapHeight <= 0) return [];
  const result: StampedTile[] = [];
  for (let offsetY = 0; offsetY < selection.height; offsetY++) {
    for (let offsetX = 0; offsetX < selection.width; offsetX++) {
      const x = destination.x + offsetX;
      const y = destination.y + offsetY;
      const tilesetX = selection.x + offsetX;
      const tilesetY = selection.y + offsetY;
      const tileId = tilesetY * columns + tilesetX;
      if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight || tilesetX < 0 || tilesetX >= columns ||
          tileId < 0 || tileId >= tileCount) continue;
      result.push({ x, y, tileId });
    }
  }
  return result;
}
