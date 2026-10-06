export interface MapPoint {
  x: number;
  y: number;
}

export interface MapViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export function screenToWorld(_point: MapPoint, _viewport: MapViewport): MapPoint {
  const { x, y } = _point;
  const { zoom, panX, panY } = _viewport;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0 ||
      !Number.isFinite(panX) || !Number.isFinite(panY)) {
    throw new RangeError('Viewport points, pan, and zoom must be finite, and zoom must be positive.');
  }
  return { x: (x - panX) / zoom, y: (y - panY) / zoom };
}

export function worldToCell(point: MapPoint, cellSize: MapPoint): MapPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      !Number.isFinite(cellSize.x) || !Number.isFinite(cellSize.y) || cellSize.x <= 0 || cellSize.y <= 0) {
    throw new RangeError('World positions must be finite and cell dimensions must be positive and finite.');
  }
  return { x: Math.floor(point.x / cellSize.x), y: Math.floor(point.y / cellSize.y) };
}

export function cellToWorld(cell: MapPoint, cellSize: MapPoint): MapPoint {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) ||
      !Number.isFinite(cellSize.x) || !Number.isFinite(cellSize.y) || cellSize.x <= 0 || cellSize.y <= 0) {
    throw new RangeError('Cell coordinates must be integers and cell dimensions must be positive and finite.');
  }
  return { x: cell.x * cellSize.x, y: cell.y * cellSize.y };
}
