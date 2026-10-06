import type {
  World2DDocument,
  World2DLayer,
  World2DJsonValue,
  World2DObjectData,
  World2DObjectLayer,
  World2DPropertyData,
  World2DTileCell,
  World2DTileLayer,
  World2DTilesetData,
  World2DVector,
} from '@bornengine/engine/world2d/editor';
import { createDefaultWorld2DObject, createObjectInspectorOperation } from '../maps/objectInspector';
import type { ObjectInspectorChange } from '../maps/objectInspector';
import type { World2DEditOperation } from '../maps/world2dEdits';
import { stampTileSelection, tileIdsInSelection, tilePaletteDisplayScale, tileSelectionFromDrag } from '../maps/tileSelection';
import type { TileSelection } from '../maps/tileSelection';
import { cellToWorld, screenToWorld, worldToCell } from '../maps/mapViewport';
import { World2DEditGesture } from '../maps/world2dEditGesture';

interface MapEditorHostApi {
  postMessage(message: MapEditorWebviewMessage): void;
}

type MapEditorWebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; operation: World2DEditOperation }
  | { type: 'editBatch'; operations: World2DEditOperation[] }
  | { type: 'requestTilesetImage' };

type MapEditorHostMessage =
  | { type: 'document'; document: World2DDocument | null; editable: boolean; assets: Record<string, string>; diagnostics: string; title?: string }
  | { type: 'assetSelected'; assetPath: string; uri: string }
  | { type: 'error'; message: string };

interface PendingTilesetAsset {
  assetPath: string;
  uri: string;
}

declare function acquireVsCodeApi(): MapEditorHostApi;

const host = acquireVsCodeApi();
const canvas = requiredElement<HTMLCanvasElement>('map-canvas');
const context = canvas.getContext('2d');
const layerList = requiredElement<HTMLDivElement>('layer-list');
const tilesetSelect = requiredElement<HTMLSelectElement>('tileset-select');
const tilesetCanvas = requiredElement<HTMLCanvasElement>('tileset-canvas');
const tilesetContext = tilesetCanvas.getContext('2d');
const diagnosticsElement = requiredElement<HTMLDivElement>('diagnostics');
const emptyState = requiredElement<HTMLDivElement>('empty-state');
const dialog = requiredElement<HTMLDialogElement>('tileset-dialog');
const previewImage = requiredElement<HTMLImageElement>('tileset-preview');
const derivedLabel = requiredElement<HTMLParagraphElement>('tileset-derived');
const errorLabel = requiredElement<HTMLParagraphElement>('tileset-error');
const confirmTilesetButton = requiredElement<HTMLButtonElement>('confirm-tileset');
const zoomLabel = requiredElement<HTMLButtonElement>('zoom-label');

let mapDocument: World2DDocument | null = null;
let assetUris: Record<string, string> = {};
let documentEditable = false;
let activeLayerId: string | null = null;
let activeTilesetId: string | null = null;
let activeTileId = 0;
let tileSelection: TileSelection = { x: 0, y: 0, width: 1, height: 1 };
let tileSelectionDrag: { pointerId: number; start: { x: number; y: number } } | null = null;
let activeTool: 'select' | 'paint' | 'bucket' | 'erase' | 'placeObject' | 'pan' = 'paint';
let zoom = 1;
let panX = 24;
let panY = 24;
let panningPointer: { id: number; x: number; y: number } | null = null;
let selectedObjectId: string | null = null;
let selectedObjectLayerId: string | null = null;
let objectDrag: {
  id: number;
  layerId: string;
  objectId: string;
  mode: 'move' | 'resize' | 'rotate';
  startPointer: World2DVector;
  startPosition: World2DVector;
  startSize: World2DVector;
  startRotation: number;
  startPointerAngle: number;
} | null = null;
let spaceDown = false;
let lastPaintedCell = '';
let lastCanvasPoint: { x: number; y: number } | null = null;
let hoveredCell: { layerId: string; x: number; y: number } | null = null;
let pendingTilesetAsset: PendingTilesetAsset | null = null;
let editGesture: World2DEditGesture | null = null;
const imageCache = new Map<string, HTMLImageElement>();
let stampPreviewCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Map editor element "${id}" is missing.`);
  return element as T;
}

function sendEdit(operation: World2DEditOperation): void {
  if (!documentEditable || !mapDocument) return;
  if (editGesture) {
    mapDocument = editGesture.apply(operation);
    renderCanvas();
    updateStatus();
    return;
  }
  host.postMessage({ type: 'edit', operation });
}

function completeEditGesture(cancel: boolean): void {
  if (!editGesture) return;
  const gesture = editGesture;
  editGesture = null;
  if (cancel) {
    mapDocument = gesture.cancel();
  } else {
    const result = gesture.commit();
    mapDocument = result.document;
    if (result.operations.length > 0) host.postMessage({ type: 'editBatch', operations: result.operations });
  }
  renderLayers();
  renderCanvas();
  updateStatus();
}

function currentLayer(): World2DLayer | null {
  return mapDocument?.layers.find((layer) => layer.id === activeLayerId) ?? null;
}

function currentTileset(): World2DTilesetData | null {
  return mapDocument?.tilesets.find((tileset) => tileset.id === activeTilesetId) ?? null;
}

function selectedObject(): { layer: World2DObjectLayer; object: World2DObjectData } | null {
  if (!mapDocument || !selectedObjectId || !selectedObjectLayerId) return null;
  const layer = mapDocument.layers.find((candidate) => candidate.id === selectedObjectLayerId);
  if (!layer || layer.type !== 'objects') return null;
  const object = layer.objects.find((candidate) => candidate.id === selectedObjectId);
  return object ? { layer, object } : null;
}

function sendInspectorChange(change: ObjectInspectorChange): void {
  if (!selectedObjectLayerId || !selectedObjectId) return;
  sendEdit(createObjectInspectorOperation(selectedObjectLayerId, selectedObjectId, change));
}

function propertyValue(type: string, input: HTMLInputElement): World2DPropertyData | null {
  if (type === 'bool') return { type: 'bool', value: input.type === 'checkbox' ? input.checked : input.value === 'true' };
  if (type === 'int') {
    const value = Number.parseInt(input.value, 10);
    return Number.isInteger(value) ? { type: 'int', value } : null;
  }
  if (type === 'float') {
    const value = Number(input.value);
    return Number.isFinite(value) ? { type: 'float', value } : null;
  }
  if (type === 'color' || type === 'file' || type === 'string') {
    return { type, value: input.value } as World2DPropertyData;
  }
  return null;
}

function renderProperties(object: World2DObjectData): void {
  const list = requiredElement<HTMLDivElement>('property-list');
  list.replaceChildren();
  for (const [name, property] of Object.entries(object.properties)) {
    const row = document.createElement('div');
    row.className = 'inspector-row property-row';
    const key = document.createElement('span');
    key.className = 'property-name';
    key.textContent = name;
    const type = document.createElement('select');
    type.setAttribute('aria-label', `${name} type`);
    for (const kind of ['string', 'int', 'float', 'bool', 'color', 'file']) {
      const option = document.createElement('option');
      option.value = kind;
      option.textContent = kind;
      type.append(option);
    }
    type.value = property.type;
    type.disabled = !documentEditable;
    const value = document.createElement('input');
    value.setAttribute('aria-label', `${name} value`);
    value.type = property.type === 'bool' ? 'checkbox' : 'text';
    if (property.type === 'bool') value.checked = property.value === true;
    else value.value = String(property.value);
    value.disabled = !documentEditable;
    const update = (): void => {
      const next = propertyValue(type.value, value);
      if (next) sendInspectorChange({ type: 'property', name, value: next });
    };
    type.addEventListener('change', () => {
      const previousValue = value.type === 'checkbox' ? String(value.checked) : value.value;
      value.type = type.value === 'bool' ? 'checkbox' : 'text';
      if (value.type === 'checkbox') value.checked = previousValue === 'true';
      else value.value = previousValue;
      update();
    });
    value.addEventListener('change', update);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Remove ${name}`;
    remove.disabled = !documentEditable;
    remove.addEventListener('click', () => sendInspectorChange({ type: 'property', name, value: null }));
    row.append(key, type, value, remove);
    list.append(row);
  }
}

function renderComponentFields(component: World2DObjectData['components'][number]): HTMLElement {
  const card = document.createElement('section');
  card.className = 'component-card';
  const header = document.createElement('header');
  const title = document.createElement('span');
  title.textContent = component.kind;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '×';
  remove.title = `Remove ${component.kind}`;
  remove.disabled = !documentEditable;
  remove.addEventListener('click', () => sendInspectorChange({ type: 'component', kind: component.kind as 'spriteRenderer' | 'physicsBody2D', data: null }));
  header.append(title, remove);
  card.append(header);

  for (const [key, value] of Object.entries(component.data)) {
    const row = document.createElement('div');
    row.className = 'component-field';
    const label = document.createElement('label');
    label.textContent = key;
    label.title = key;
    const commit = (input: HTMLInputElement | HTMLTextAreaElement): void => {
      let next: World2DJsonValue;
      if (input instanceof HTMLTextAreaElement) {
        try {
          next = JSON.parse(input.value) as World2DJsonValue;
        } catch (_error) {
          return;
        }
      } else if (input.type === 'checkbox') next = input.checked;
      else if (input.type === 'number') {
        const numeric = Number(input.value);
        if (!Number.isFinite(numeric)) return;
        next = numeric;
      } else {
        next = input.value;
      }
      sendInspectorChange({ type: 'component', kind: component.kind as 'spriteRenderer' | 'physicsBody2D', data: { [key]: next } });
    };
    if (typeof value === 'object' && value !== null) {
      const input = document.createElement('textarea');
      input.value = JSON.stringify(value);
      input.setAttribute('aria-label', `${component.kind} ${key}`);
      input.disabled = !documentEditable;
      input.addEventListener('change', () => commit(input));
      row.append(label, input);
    } else {
      const input = document.createElement('input');
      input.setAttribute('aria-label', `${component.kind} ${key}`);
      if (typeof value === 'boolean') {
        input.type = 'checkbox';
        input.checked = value;
      } else if (typeof value === 'number') {
        input.type = 'number';
        input.step = 'any';
        input.value = String(value);
      } else {
        input.type = 'text';
        input.value = String(value);
      }
      input.disabled = !documentEditable;
      input.addEventListener('change', () => commit(input));
      row.append(label, input);
    }
    card.append(row);
  }
  return card;
}

function renderInspector(): void {
  const selection = selectedObject();
  const fields = requiredElement<HTMLDivElement>('inspector-fields');
  requiredElement<HTMLParagraphElement>('inspector-empty').hidden = selection !== null;
  fields.hidden = selection === null;
  if (!selection) return;
  const { object } = selection;
  requiredElement<HTMLInputElement>('object-name').value = object.name;
  requiredElement<HTMLInputElement>('object-type').value = object.type;
  requiredElement<HTMLInputElement>('object-x').value = String(object.position.x);
  requiredElement<HTMLInputElement>('object-y').value = String(object.position.y);
  requiredElement<HTMLInputElement>('object-rotation').value = String(object.rotation);
  requiredElement<HTMLInputElement>('object-width').value = String(object.size.x);
  requiredElement<HTMLInputElement>('object-height').value = String(object.size.y);
  requiredElement<HTMLInputElement>('object-origin-x').value = String(object.origin.x);
  requiredElement<HTMLInputElement>('object-origin-y').value = String(object.origin.y);
  requiredElement<HTMLInputElement>('object-tags').value = object.tags.join(', ');
  requiredElement<HTMLInputElement>('object-visible').checked = object.visible;
  renderProperties(object);
  const componentList = requiredElement<HTMLDivElement>('component-list');
  componentList.replaceChildren();
  for (const component of object.components) componentList.append(renderComponentFields(component));
  const spriteExists = object.components.some((component) => component.kind === 'spriteRenderer');
  const physicsExists = object.components.some((component) => component.kind === 'physicsBody2D');
  requiredElement<HTMLButtonElement>('add-sprite-component').disabled = !documentEditable || spriteExists || !mapDocument?.tilesets.length;
  requiredElement<HTMLButtonElement>('add-physics-component').disabled = !documentEditable || physicsExists;
}

function renderLayerInspector(): void {
  const layer = currentLayer();
  const fields = requiredElement<HTMLDivElement>('layer-inspector-fields');
  requiredElement<HTMLParagraphElement>('layer-inspector-empty').hidden = layer !== null;
  fields.hidden = layer === null;
  if (!layer) return;
  requiredElement<HTMLInputElement>('layer-name').value = layer.name;
  requiredElement<HTMLInputElement>('layer-visible').checked = layer.visible;
  requiredElement<HTMLInputElement>('layer-opacity').value = String(layer.opacity);
  requiredElement<HTMLInputElement>('layer-offset-x').value = String(layer.offset.x);
  requiredElement<HTMLInputElement>('layer-offset-y').value = String(layer.offset.y);
  requiredElement<HTMLInputElement>('layer-parallax-x').value = String(layer.parallax.x);
  requiredElement<HTMLInputElement>('layer-parallax-y').value = String(layer.parallax.y);
  const tileFields = requiredElement<HTMLDivElement>('tile-layer-fields');
  tileFields.hidden = layer.type !== 'tilemap';
  if (layer.type === 'tilemap') {
    requiredElement<HTMLInputElement>('layer-width').value = String(layer.width);
    requiredElement<HTMLInputElement>('layer-height').value = String(layer.height);
    requiredElement<HTMLInputElement>('layer-tile-width').value = String(layer.tileSize.x);
    requiredElement<HTMLInputElement>('layer-tile-height').value = String(layer.tileSize.y);
  }
  requiredElement<HTMLButtonElement>('apply-layer-settings').disabled = !documentEditable;
}

function commitLayerSettings(): void {
  const layer = currentLayer();
  if (!layer) return;
  const opacity = numberInput('layer-opacity');
  const offsetX = numberInput('layer-offset-x');
  const offsetY = numberInput('layer-offset-y');
  const parallaxX = numberInput('layer-parallax-x');
  const parallaxY = numberInput('layer-parallax-y');
  if (![opacity, offsetX, offsetY, parallaxX, parallaxY].every(Number.isFinite) || opacity < 0 || opacity > 1) return;
  const updates: {
    name: string;
    visible: boolean;
    opacity: number;
    offset: World2DVector;
    parallax: World2DVector;
    width?: number;
    height?: number;
    tileSize?: World2DVector;
  } = {
    name: requiredElement<HTMLInputElement>('layer-name').value,
    visible: requiredElement<HTMLInputElement>('layer-visible').checked,
    opacity,
    offset: { x: offsetX, y: offsetY },
    parallax: { x: parallaxX, y: parallaxY },
  };
  if (layer.type === 'tilemap') {
    const width = numberInput('layer-width');
    const height = numberInput('layer-height');
    const tileWidth = numberInput('layer-tile-width');
    const tileHeight = numberInput('layer-tile-height');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        !Number.isFinite(tileWidth) || !Number.isFinite(tileHeight) || tileWidth <= 0 || tileHeight <= 0) return;
    updates.width = width;
    updates.height = height;
    updates.tileSize = { x: tileWidth, y: tileHeight };
  }
  sendEdit({ type: 'updateLayer', layerId: layer.id, updates });
}

function updateStatus(): void {
  const layer = currentLayer();
  requiredElement<HTMLSpanElement>('active-layer-label').textContent = layer?.name ?? 'No layer selected';
  requiredElement<HTMLSpanElement>('layer-count').textContent = mapDocument ? String(mapDocument.layers.length) : '';
  requiredElement<HTMLSpanElement>('document-name').textContent = mapDocument?.name ?? 'Map';
  emptyState.hidden = mapDocument !== null;
  diagnosticsElement.hidden = diagnosticsElement.textContent === '';
  for (const button of document.querySelectorAll<HTMLButtonElement>('.toolbar button[data-tool]')) {
    button.classList.toggle('active', button.dataset.tool === activeTool);
    button.disabled = !documentEditable;
  }
  for (const id of ['add-tile-layer', 'add-object-layer', 'add-tileset', 'set-main-tileset', 'move-layer-up', 'move-layer-down']) {
    requiredElement<HTMLButtonElement>(id).disabled = !documentEditable;
  }
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('.layer-inspector-panel input, .layer-inspector-panel select, .layer-inspector-panel button')) {
    control.disabled = !documentEditable || currentLayer() === null;
  }
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('.inspector-panel input, .inspector-panel select, .inspector-panel textarea, .inspector-panel button')) {
    control.disabled = !documentEditable;
  }
  renderLayerInspector();
  renderInspector();
}

function setTool(tool: 'select' | 'paint' | 'bucket' | 'erase' | 'placeObject' | 'pan'): void {
  activeTool = tool;
  canvas.classList.toggle('pan-tool', tool === 'pan');
  updateHoverPreview(lastCanvasPoint, false);
  updateStatus();
  renderCanvas();
}

function getImage(uri: string | undefined): HTMLImageElement | null {
  if (!uri) return null;
  let image = imageCache.get(uri);
  if (!image) {
    image = new Image();
    imageCache.set(uri, image);
    image.addEventListener('load', () => {
      stampPreviewCache = null;
      renderCanvas();
      renderPalette();
      updateTilesetDimensions();
    }, { once: true });
    image.src = uri;
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

function tileSource(tileset: World2DTilesetData, tileId: number): { x: number; y: number } {
  return {
    x: tileset.margin.x + (tileId % tileset.columns) * (tileset.tileWidth + tileset.spacing.x),
    y: tileset.margin.y + Math.floor(tileId / tileset.columns) * (tileset.tileHeight + tileset.spacing.y),
  };
}

function drawTile(
  target: CanvasRenderingContext2D,
  tileset: World2DTilesetData,
  tileId: number,
  x: number,
  y: number,
  flipX = false,
  flipY = false,
  flipDiagonal = false,
): void {
  const image = getImage(assetUris[tileset.image]);
  const source = tileSource(tileset, tileId);
  if (!image || source.x + tileset.tileWidth > image.naturalWidth || source.y + tileset.tileHeight > image.naturalHeight) {
    target.fillStyle = `hsl(${(tileId * 67) % 360} 35% 42%)`;
    target.fillRect(x, y, tileset.tileWidth, tileset.tileHeight);
    target.strokeStyle = 'rgba(255,255,255,.4)';
    target.strokeRect(x, y, tileset.tileWidth, tileset.tileHeight);
    return;
  }

  target.save();
  target.translate(x + tileset.tileWidth / 2, y + tileset.tileHeight / 2);
  if (flipDiagonal) target.rotate(Math.PI / 2);
  target.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  target.drawImage(
    image,
    source.x,
    source.y,
    tileset.tileWidth,
    tileset.tileHeight,
    -tileset.tileWidth / 2,
    -tileset.tileHeight / 2,
    tileset.tileWidth,
    tileset.tileHeight,
  );
  target.restore();
}

function tileStampPreviewCanvas(tileset: World2DTilesetData): HTMLCanvasElement | null {
  const imageUri = assetUris[tileset.image];
  const image = getImage(imageUri);
  if (!image) return null;

  const key = [
    tileset.id,
    imageUri,
    tileSelection.x,
    tileSelection.y,
    tileSelection.width,
    tileSelection.height,
    tileset.tileWidth,
    tileset.tileHeight,
    tileset.columns,
    tileset.tileCount,
    tileset.margin.x,
    tileset.margin.y,
    tileset.spacing.x,
    tileset.spacing.y,
  ].join(':');
  if (stampPreviewCache?.key === key) return stampPreviewCache.canvas;

  const width = tileSelection.width * tileset.tileWidth;
  const height = tileSelection.height * tileset.tileHeight;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 4_194_304) {
    return null;
  }

  const preview = document.createElement('canvas');
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext('2d');
  if (!previewContext) return null;
  previewContext.imageSmoothingEnabled = false;
  for (const tile of stampTileSelection(
    tileSelection,
    { x: 0, y: 0 },
    tileset.columns,
    tileset.tileCount,
    tileSelection.width,
    tileSelection.height,
  )) {
    const source = tileSource(tileset, tile.tileId);
    if (source.x + tileset.tileWidth > image.naturalWidth || source.y + tileset.tileHeight > image.naturalHeight) continue;
    previewContext.drawImage(
      image,
      source.x,
      source.y,
      tileset.tileWidth,
      tileset.tileHeight,
      tile.x * tileset.tileWidth,
      tile.y * tileset.tileHeight,
      tileset.tileWidth,
      tileset.tileHeight,
    );
  }
  stampPreviewCache = { key, canvas: preview };
  return preview;
}

function drawTileStampPreview(
  target: CanvasRenderingContext2D,
  layer: World2DTileLayer,
  destination: { x: number; y: number },
  bounds: { width: number; height: number },
): void {
  const tileset = currentTileset();
  if (!tileset) return;

  const x = layer.offset.x + destination.x * layer.tileSize.x;
  const y = layer.offset.y + destination.y * layer.tileSize.y;
  const width = tileSelection.width * layer.tileSize.x;
  const height = tileSelection.height * layer.tileSize.y;
  const preview = tileStampPreviewCanvas(tileset);
  target.save();
  target.beginPath();
  target.rect(layer.offset.x, layer.offset.y, layer.width * layer.tileSize.x, layer.height * layer.tileSize.y);
  target.clip();
  target.globalAlpha = 0.58;
  if (preview) {
    target.drawImage(preview, x, y, width, height);
  } else {
    const topLeft = screenToWorld({ x: 0, y: 0 }, { zoom, panX, panY });
    const bottomRight = screenToWorld({ x: bounds.width, y: bounds.height }, { zoom, panX, panY });
    const firstX = Math.max(0, -destination.x, Math.floor((topLeft.x - layer.offset.x) / layer.tileSize.x) - destination.x);
    const firstY = Math.max(0, -destination.y, Math.floor((topLeft.y - layer.offset.y) / layer.tileSize.y) - destination.y);
    const lastX = Math.min(tileSelection.width, layer.width - destination.x,
      Math.ceil((bottomRight.x - layer.offset.x) / layer.tileSize.x) - destination.x);
    const lastY = Math.min(tileSelection.height, layer.height - destination.y,
      Math.ceil((bottomRight.y - layer.offset.y) / layer.tileSize.y) - destination.y);
    for (let offsetY = firstY; offsetY < lastY; offsetY++) {
      for (let offsetX = firstX; offsetX < lastX; offsetX++) {
        const tileId = (tileSelection.y + offsetY) * tileset.columns + tileSelection.x + offsetX;
        if (tileSelection.x + offsetX >= tileset.columns || tileId < 0 || tileId >= tileset.tileCount) continue;
        drawTile(target, tileset, tileId,
          layer.offset.x + (destination.x + offsetX) * layer.tileSize.x,
          layer.offset.y + (destination.y + offsetY) * layer.tileSize.y);
      }
    }
  }
  target.globalAlpha = 0.95;
  target.strokeStyle = 'rgba(130, 195, 255, .98)';
  target.lineWidth = 1 / zoom;
  target.strokeRect(x, y, width, height);
  target.restore();
}

function drawTileLayer(target: CanvasRenderingContext2D, layer: World2DTileLayer, bounds: { width: number; height: number }): void {
  const topLeft = screenToWorld({ x: 0, y: 0 }, { zoom, panX, panY });
  const bottomRight = screenToWorld({ x: bounds.width, y: bounds.height }, { zoom, panX, panY });
  const firstX = Math.max(0, Math.floor((topLeft.x - layer.offset.x) / layer.tileSize.x) - 1);
  const firstY = Math.max(0, Math.floor((topLeft.y - layer.offset.y) / layer.tileSize.y) - 1);
  const lastX = Math.min(layer.width, Math.ceil((bottomRight.x - layer.offset.x) / layer.tileSize.x) + 1);
  const lastY = Math.min(layer.height, Math.ceil((bottomRight.y - layer.offset.y) / layer.tileSize.y) + 1);

  target.lineWidth = 1 / zoom;
  target.strokeStyle = 'rgba(180,190,205,.24)';
  for (let y = firstY; y < lastY; y++) {
    for (let x = firstX; x < lastX; x++) {
      const cellPosition = cellToWorld({ x, y }, layer.tileSize);
      const worldX = layer.offset.x + cellPosition.x;
      const worldY = layer.offset.y + cellPosition.y;
      const cell = layer.data[y * layer.width + x];
      if (cell) {
        const tileset = mapDocument?.tilesets.find((item) => item.id === cell.tilesetId);
        if (tileset) drawTile(target, tileset, cell.tileId, worldX, worldY, cell.flipX, cell.flipY, cell.flipDiagonal);
      }
      target.strokeRect(worldX, worldY, layer.tileSize.x, layer.tileSize.y);
    }
  }
}

function drawObjectLayer(target: CanvasRenderingContext2D, layer: World2DObjectLayer): void {
  target.lineWidth = 1 / zoom;
  for (const object of layer.objects) {
    if (!object.visible) continue;
    const x = -object.size.x * object.origin.x;
    const y = -object.size.y * object.origin.y;
    target.save();
    target.translate(layer.offset.x + object.position.x, layer.offset.y + object.position.y);
    target.rotate(object.rotation * Math.PI / 180);
    target.fillStyle = 'rgba(73, 150, 235, .20)';
    target.strokeStyle = 'rgba(104, 177, 255, .9)';
    target.fillRect(x, y, object.size.x, object.size.y);
    target.strokeRect(x, y, object.size.x, object.size.y);
    if (zoom >= 0.55) {
      target.fillStyle = 'rgba(230,240,255,.92)';
      target.font = `${Math.max(9, 11 / zoom)}px sans-serif`;
      target.fillText(object.name || object.id, x + 3, y + 13 / zoom, Math.max(object.size.x - 6, 24));
    }
    if (object.id === selectedObjectId && layer.id === selectedObjectLayerId) {
      target.strokeStyle = 'rgba(255, 210, 90, .98)';
      target.fillStyle = 'rgba(255, 210, 90, .98)';
      target.setLineDash([4 / zoom, 3 / zoom]);
      target.strokeRect(x - 2 / zoom, y - 2 / zoom, object.size.x + 4 / zoom, object.size.y + 4 / zoom);
      target.setLineDash([]);
      drawHandle(target, x + object.size.x, y + object.size.y, 5 / zoom);
      drawHandle(target, x + object.size.x / 2, y - 18 / zoom, 5 / zoom);
    }
    target.restore();
  }
}

function objectLocalPoint(layer: World2DObjectLayer, object: World2DObjectData, world: World2DVector): World2DVector {
  const dx = world.x - layer.offset.x - object.position.x;
  const dy = world.y - layer.offset.y - object.position.y;
  const angle = object.rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: dx * cosine + dy * sine, y: -dx * sine + dy * cosine };
}

function drawHandle(target: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  target.beginPath();
  target.arc(x, y, radius, 0, Math.PI * 2);
  target.fill();
  target.stroke();
}

function renderCanvas(): void {
  if (!context) return;
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(bounds.width * ratio);
  const pixelHeight = Math.round(bounds.height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background').trim() || '#252526';
  context.fillRect(0, 0, bounds.width, bounds.height);
  context.save();
  context.translate(panX, panY);
  context.scale(zoom, zoom);
  if (mapDocument) {
    for (const layer of mapDocument.layers) {
      if (!layer.visible) continue;
      context.save();
      context.globalAlpha = layer.opacity;
      if (layer.type === 'tilemap') drawTileLayer(context, layer, { width: bounds.width, height: bounds.height });
      else drawObjectLayer(context, layer);
      context.restore();
    }
    const layer = currentLayer();
    if (documentEditable && activeTool === 'paint' && layer?.type === 'tilemap' && layer.visible &&
        hoveredCell?.layerId === layer.id) {
      drawTileStampPreview(context, layer, hoveredCell, { width: bounds.width, height: bounds.height });
    }
  }
  context.restore();
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function renderLayers(): void {
  layerList.replaceChildren();
  if (!mapDocument) {
    updateStatus();
    return;
  }
  mapDocument.layers.forEach((layer, index) => {
    const row = document.createElement('div');
    row.className = 'layer-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `layer-item${layer.id === activeLayerId ? ' active' : ''}`;
    button.title = `Select ${layer.name}`;
    const icon = document.createElement('span');
    icon.className = 'layer-type';
    icon.textContent = layer.type === 'tilemap' ? '▦' : '◇';
    icon.title = layer.type === 'tilemap' ? 'Tile layer' : 'Object layer';
    const copy = document.createElement('span');
    copy.className = 'layer-copy';
    const label = document.createElement('span');
    label.className = 'layer-name';
    label.textContent = layer.name;
    const meta = document.createElement('span');
    meta.className = 'layer-meta';
    const contentCount = layer.type === 'tilemap' ? layer.data.reduce((count, cell) => count + (cell ? 1 : 0), 0) : layer.objects.length;
    meta.textContent = `${index + 1} · ${contentCount} ${layer.type === 'tilemap' ? 'tiles' : 'objects'}`;
    copy.append(label, meta);
    button.append(icon, copy);
    button.addEventListener('click', () => {
      activeLayerId = layer.id;
      if (layer.type !== 'objects' || selectedObjectLayerId !== layer.id) {
        selectedObjectId = null;
        selectedObjectLayerId = null;
      }
      renderLayers();
      updateHoverPreview(lastCanvasPoint, false);
      renderCanvas();
    });
    button.disabled = !documentEditable;
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = `layer-visibility${layer.visible ? '' : ' hidden'}`;
    visibility.textContent = layer.visible ? '◉' : '○';
    visibility.title = layer.visible ? 'Hide layer' : 'Show layer';
    visibility.setAttribute('aria-label', visibility.title);
    visibility.disabled = !documentEditable;
    visibility.addEventListener('click', () => sendEdit({
      type: 'updateLayer',
      layerId: layer.id,
      updates: { visible: !layer.visible },
    }));
    row.append(button, visibility);
    layerList.append(row);
  });
  updateStatus();
}

function renderPalette(): void {
  tilesetSelect.replaceChildren();
  const tilesets = mapDocument?.tilesets ?? [];
  requiredElement<HTMLParagraphElement>('palette-empty').hidden = tilesets.length > 0;
  tilesetSelect.disabled = !documentEditable || tilesets.length === 0;
  for (const tileset of tilesets) {
    const option = document.createElement('option');
    option.value = tileset.id;
    const index = tilesets.indexOf(tileset);
    option.textContent = `${index === 0 ? 'Main' : 'Extra'} · ${tileset.id}`;
    tilesetSelect.append(option);
  }
  if (!tilesets.some((tileset) => tileset.id === activeTilesetId)) activeTilesetId = tilesets[0]?.id ?? null;
  if (activeTilesetId) tilesetSelect.value = activeTilesetId;
  const tileset = currentTileset();
  const tilesetIndex = tilesets.findIndex((candidate) => candidate.id === tileset?.id);
  requiredElement<HTMLParagraphElement>('tileset-role').textContent = tileset
    ? `${tilesetIndex === 0 ? 'Main source' : 'Extra source'} · ${tileset.id}`
    : 'No tile source selected';
  requiredElement<HTMLButtonElement>('set-main-tileset').disabled = !documentEditable || tileset === null || tilesetIndex === 0;
  if (!tileset) {
    tilesetCanvas.hidden = true;
    requiredElement<HTMLParagraphElement>('tile-selection-label').textContent = 'No tile selected';
    return;
  }
  let selectedIds = tileIdsInSelection(tileSelection, tileset.columns, tileset.tileCount);
  if (selectedIds.length === 0) {
    tileSelection = { x: 0, y: 0, width: 1, height: 1 };
    selectedIds = tileIdsInSelection(tileSelection, tileset.columns, tileset.tileCount);
  }
  activeTileId = tileSelection.y * tileset.columns + tileSelection.x;
  const image = getImage(assetUris[tileset.image]);
  if (!image || !tilesetContext) {
    tilesetCanvas.hidden = true;
    requiredElement<HTMLParagraphElement>('tile-selection-label').textContent = 'Loading tileset image…';
    return;
  }
  tilesetCanvas.hidden = false;
  const displayScale = tilePaletteDisplayScale(tileset.tileWidth, tileset.tileHeight);
  tilesetCanvas.style.width = `${image.naturalWidth * displayScale}px`;
  tilesetCanvas.style.height = `${image.naturalHeight * displayScale}px`;
  if (tilesetCanvas.width !== image.naturalWidth || tilesetCanvas.height !== image.naturalHeight) {
    tilesetCanvas.width = image.naturalWidth;
    tilesetCanvas.height = image.naturalHeight;
  }
  tilesetContext.clearRect(0, 0, tilesetCanvas.width, tilesetCanvas.height);
  tilesetContext.imageSmoothingEnabled = false;
  tilesetContext.drawImage(image, 0, 0);
  const selectedTileSet = new Set(selectedIds);
  for (let tileId = 0; tileId < tileset.tileCount; tileId++) {
    const source = tileSource(tileset, tileId);
    if (source.x + tileset.tileWidth > image.naturalWidth || source.y + tileset.tileHeight > image.naturalHeight) continue;
    if (selectedTileSet.has(tileId)) {
      tilesetContext.fillStyle = 'rgba(80, 160, 255, .36)';
      tilesetContext.fillRect(source.x, source.y, tileset.tileWidth, tileset.tileHeight);
      tilesetContext.strokeStyle = 'rgba(130, 195, 255, .98)';
      tilesetContext.lineWidth = Math.max(1, Math.min(3, tileset.tileWidth / 8, tileset.tileHeight / 8));
      tilesetContext.strokeRect(source.x + .5, source.y + .5, tileset.tileWidth - 1, tileset.tileHeight - 1);
    } else {
      tilesetContext.strokeStyle = 'rgba(255, 255, 255, .26)';
      tilesetContext.lineWidth = 1;
      tilesetContext.strokeRect(source.x + .5, source.y + .5, tileset.tileWidth - 1, tileset.tileHeight - 1);
    }
  }
  requiredElement<HTMLParagraphElement>('tile-selection-label').textContent = selectedIds.length > 1
    ? `${selectedIds.length} tiles selected · starts at ${activeTileId}`
    : `Tile ${activeTileId} selected`;
}

function tilesetCellAt(event: PointerEvent): { x: number; y: number } | null {
  const tileset = currentTileset();
  if (!tileset) return null;
  const bounds = tilesetCanvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const imageX = (event.clientX - bounds.left) * tilesetCanvas.width / bounds.width;
  const imageY = (event.clientY - bounds.top) * tilesetCanvas.height / bounds.height;
  if (imageX < 0 || imageY < 0 || imageX >= tilesetCanvas.width || imageY >= tilesetCanvas.height) return null;
  const strideX = tileset.tileWidth + tileset.spacing.x;
  const strideY = tileset.tileHeight + tileset.spacing.y;
  const relativeX = imageX - tileset.margin.x;
  const relativeY = imageY - tileset.margin.y;
  if (relativeX < 0 || relativeY < 0) return null;
  const x = Math.floor(relativeX / strideX);
  const y = Math.floor(relativeY / strideY);
  if (relativeX % strideX >= tileset.tileWidth || relativeY % strideY >= tileset.tileHeight) return null;
  const tileId = y * tileset.columns + x;
  if (x >= tileset.columns || tileId < 0 || tileId >= tileset.tileCount) return null;
  return { x, y };
}

function updateTileSelection(end: { x: number; y: number }): void {
  if (!tileSelectionDrag) return;
  tileSelection = tileSelectionFromDrag(tileSelectionDrag.start, end);
  const tileset = currentTileset();
  if (tileset) activeTileId = tileSelection.y * tileset.columns + tileSelection.x;
  renderPalette();
  stampPreviewCache = null;
  renderCanvas();
}

function updateHoverPreview(point: { x: number; y: number } | null, redraw = true): boolean {
  lastCanvasPoint = point;
  let next: typeof hoveredCell = null;
  const layer = currentLayer();
  if (point && documentEditable && activeTool === 'paint' && layer?.type === 'tilemap') {
    const world = screenToWorld(point, { zoom, panX, panY });
    const cell = worldToCell({ x: world.x - layer.offset.x, y: world.y - layer.offset.y }, layer.tileSize);
    if (cell.x >= 0 && cell.y >= 0 && cell.x < layer.width && cell.y < layer.height) {
      next = { layerId: layer.id, x: cell.x, y: cell.y };
    }
  }
  const changed = next?.layerId !== hoveredCell?.layerId || next?.x !== hoveredCell?.x || next?.y !== hoveredCell?.y;
  if (changed) {
    hoveredCell = next;
    if (redraw) renderCanvas();
  }
  return changed;
}

function updateTilesetDimensions(): void {
  const imageWidth = previewImage.naturalWidth;
  const imageHeight = previewImage.naturalHeight;
  if (!pendingTilesetAsset || imageWidth <= 0 || imageHeight <= 0) {
    confirmTilesetButton.disabled = true;
    return;
  }
  const tileWidth = numberInput('tile-width');
  const tileHeight = numberInput('tile-height');
  const marginX = numberInput('margin-x');
  const marginY = numberInput('margin-y');
  const spacingX = numberInput('spacing-x');
  const spacingY = numberInput('spacing-y');
  const columns = Math.floor((imageWidth - 2 * marginX + spacingX) / (tileWidth + spacingX));
  const rows = Math.floor((imageHeight - 2 * marginY + spacingY) / (tileHeight + spacingY));
  const valid = [tileWidth, tileHeight].every((value) => Number.isInteger(value) && value > 0) &&
    [marginX, marginY, spacingX, spacingY].every((value) => Number.isInteger(value) && value >= 0) &&
    columns > 0 && rows > 0;
  confirmTilesetButton.disabled = !valid || !documentEditable;
  errorLabel.textContent = valid ? '' : 'Cell, margin, or spacing values do not fit inside this image.';
  derivedLabel.textContent = valid
    ? `${columns} columns × ${rows} rows · ${columns * rows} tiles`
    : 'Adjust the cell, margin, or spacing values to fit this image.';
}

function numberInput(id: string): number {
  return requiredElement<HTMLInputElement>(id).valueAsNumber;
}

function createLayerId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return `${prefix}-${random}`;
}

function createTileLayer(): World2DTileLayer {
  const index = (mapDocument?.layers.filter((layer) => layer.type === 'tilemap').length ?? 0) + 1;
  return {
    id: createLayerId('tile-layer'),
    name: `Tile Layer ${index}`,
    type: 'tilemap',
    visible: true,
    opacity: 1,
    offset: { x: 0, y: 0 },
    parallax: { x: 1, y: 1 },
    width: 32,
    height: 32,
    tileSize: { x: 16, y: 16 },
    data: Array<World2DTileCell | null>(32 * 32).fill(null),
  };
}

function createObjectLayer(): World2DObjectLayer {
  const index = (mapDocument?.layers.filter((layer) => layer.type === 'objects').length ?? 0) + 1;
  return {
    id: createLayerId('object-layer'),
    name: `Object Layer ${index}`,
    type: 'objects',
    visible: true,
    opacity: 1,
    offset: { x: 0, y: 0 },
    parallax: { x: 1, y: 1 },
    objects: [],
  };
}

function screenPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function paintAt(point: { x: number; y: number }): void {
  const layer = currentLayer();
  if (!layer || layer.type !== 'tilemap') return;
  const world = screenToWorld(point, { zoom, panX, panY });
  const cell = worldToCell({ x: world.x - layer.offset.x, y: world.y - layer.offset.y }, layer.tileSize);
  if (cell.x < 0 || cell.y < 0 || cell.x >= layer.width || cell.y >= layer.height) return;
  const key = `${layer.id}:${cell.x}:${cell.y}`;
  if (key === lastPaintedCell) return;
  lastPaintedCell = key;
  if (activeTool === 'erase') {
    sendEdit({ type: 'eraseTile', layerId: layer.id, x: cell.x, y: cell.y });
    return;
  }
  const tileset = currentTileset();
  if (!tileset || activeTileId < 0 || activeTileId >= tileset.tileCount) return;
  const activeCell: World2DTileCell = {
    tilesetId: tileset.id,
    tileId: activeTileId,
    flipX: false,
    flipY: false,
    flipDiagonal: false,
  };
  if (activeTool === 'bucket') {
    sendEdit({ type: 'fillTiles', layerId: layer.id, x: cell.x, y: cell.y, cell: activeCell });
    return;
  }
  const tiles = stampTileSelection(tileSelection, cell, tileset.columns, tileset.tileCount, layer.width, layer.height)
    .map((stamped) => ({
      x: stamped.x,
      y: stamped.y,
      cell: { ...activeCell, tileId: stamped.tileId },
    }));
  if (tiles.length > 0) sendEdit({ type: 'paintTiles', layerId: layer.id, tiles });
}

function objectAt(layer: World2DObjectLayer, world: World2DVector): World2DObjectData | null {
  for (let index = layer.objects.length - 1; index >= 0; index--) {
    const object = layer.objects[index];
    if (!object || !object.visible) continue;
    const local = objectLocalPoint(layer, object, world);
    const x = -object.size.x * object.origin.x;
    const y = -object.size.y * object.origin.y;
    if (local.x >= x && local.y >= y && local.x <= x + object.size.x && local.y <= y + object.size.y) return object;
  }
  return null;
}

function handleMode(layer: World2DObjectLayer, object: World2DObjectData, world: World2DVector): 'resize' | 'rotate' | null {
  const local = objectLocalPoint(layer, object, world);
  const x = -object.size.x * object.origin.x;
  const y = -object.size.y * object.origin.y;
  const resize = { x: x + object.size.x, y: y + object.size.y };
  const rotate = { x: x + object.size.x / 2, y: y - 18 / zoom };
  const threshold = 9 / zoom;
  if (Math.hypot(local.x - resize.x, local.y - resize.y) <= threshold) return 'resize';
  if (Math.hypot(local.x - rotate.x, local.y - rotate.y) <= threshold) return 'rotate';
  return null;
}

function startObjectDrag(
  layer: World2DObjectLayer,
  object: World2DObjectData,
  point: { x: number; y: number },
  pointerId: number,
  mode: 'move' | 'resize' | 'rotate',
): void {
  const world = screenToWorld(point, { zoom, panX, panY });
  const anchorX = object.position.x + layer.offset.x;
  const anchorY = object.position.y + layer.offset.y;
  objectDrag = {
    id: pointerId,
    layerId: layer.id,
    objectId: object.id,
    mode,
    startPointer: world,
    startPosition: { ...object.position },
    startSize: { ...object.size },
    startRotation: object.rotation,
    startPointerAngle: Math.atan2(world.y - anchorY, world.x - anchorX),
  };
}

function handleObjectPointerDown(point: { x: number; y: number }, pointerId: number): void {
  const layer = currentLayer();
  if (!layer || layer.type !== 'objects') return;
  const world = screenToWorld(point, { zoom, panX, panY });
  const localPosition = { x: world.x - layer.offset.x, y: world.y - layer.offset.y };

  if (activeTool === 'placeObject') {
    const object = createDefaultWorld2DObject(createLayerId('object'), localPosition, layer.objects.length + 1);
    selectedObjectId = object.id;
    selectedObjectLayerId = layer.id;
    sendEdit({ type: 'placeObject', layerId: layer.id, object });
    renderLayers();
    renderCanvas();
    return;
  }
  if (activeTool !== 'select') return;

  const selection = selectedObject();
  if (selection?.layer.id === layer.id) {
    const mode = handleMode(layer, selection.object, world);
    if (mode) {
      startObjectDrag(layer, selection.object, point, pointerId, mode);
      return;
    }
  }

  const object = objectAt(layer, world);
  if (!object) {
    selectedObjectId = null;
    selectedObjectLayerId = null;
    objectDrag = null;
    renderLayers();
    renderCanvas();
    return;
  }
  selectedObjectId = object.id;
  selectedObjectLayerId = layer.id;
  startObjectDrag(layer, object, point, pointerId, 'move');
  renderLayers();
  renderCanvas();
}

function dragSelectedObject(point: { x: number; y: number }, pointerId: number): void {
  if (!objectDrag || objectDrag.id !== pointerId) return;
  const layer = mapDocument?.layers.find((candidate) => candidate.id === objectDrag?.layerId);
  if (!layer || layer.type !== 'objects') return;
  const object = layer.objects.find((candidate) => candidate.id === objectDrag?.objectId);
  if (!object) return;
  const world = screenToWorld(point, { zoom, panX, panY });
  const delta = { x: world.x - objectDrag.startPointer.x, y: world.y - objectDrag.startPointer.y };
  if (objectDrag.mode === 'move') {
    sendEdit({
      type: 'transformObject',
      layerId: layer.id,
      objectId: object.id,
      transform: {
        position: { x: objectDrag.startPosition.x + delta.x, y: objectDrag.startPosition.y + delta.y },
      },
    });
  } else if (objectDrag.mode === 'resize') {
    const widthFactor = object.origin.x === 1 ? 1 : 1 - object.origin.x;
    const heightFactor = object.origin.y === 1 ? 1 : 1 - object.origin.y;
    sendEdit({
      type: 'transformObject',
      layerId: layer.id,
      objectId: object.id,
      transform: {
        size: {
          x: Math.max(0, objectDrag.startSize.x + delta.x / widthFactor),
          y: Math.max(0, objectDrag.startSize.y + delta.y / heightFactor),
        },
      },
    });
  } else {
    const anchorX = objectDrag.startPosition.x + layer.offset.x;
    const anchorY = objectDrag.startPosition.y + layer.offset.y;
    const currentAngle = Math.atan2(world.y - anchorY, world.x - anchorX);
    const rotation = objectDrag.startRotation + (currentAngle - objectDrag.startPointerAngle) * 180 / Math.PI;
    sendEdit({
      type: 'transformObject',
      layerId: layer.id,
      objectId: object.id,
      transform: { rotation },
    });
  }
}

function chooseTilesetImage(): void {
  pendingTilesetAsset = null;
  errorLabel.textContent = '';
  requiredElement<HTMLParagraphElement>('tileset-source').textContent = 'Choose an image from this workspace.';
  previewImage.hidden = true;
  previewImage.removeAttribute('src');
  dialog.showModal();
  host.postMessage({ type: 'requestTilesetImage' });
}

function makeTileset(): void {
  if (!pendingTilesetAsset) return;
  const imageWidth = previewImage.naturalWidth;
  const imageHeight = previewImage.naturalHeight;
  const tileWidth = numberInput('tile-width');
  const tileHeight = numberInput('tile-height');
  const marginX = numberInput('margin-x');
  const marginY = numberInput('margin-y');
  const spacingX = numberInput('spacing-x');
  const spacingY = numberInput('spacing-y');
  const columns = Math.floor((imageWidth - 2 * marginX + spacingX) / (tileWidth + spacingX));
  const rows = Math.floor((imageHeight - 2 * marginY + spacingY) / (tileHeight + spacingY));
  if (columns <= 0 || rows <= 0) return;
  const imageName = pendingTilesetAsset.assetPath.split('/').pop() ?? 'tileset';
  const baseId = imageName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'tileset';
  let id = baseId;
  let suffix = 2;
  while (mapDocument?.tilesets.some((tileset) => tileset.id === id)) id = `${baseId}-${suffix++}`;
  sendEdit({
    type: 'addTileset',
    tileset: {
      id,
      image: pendingTilesetAsset.assetPath,
      tileWidth,
      tileHeight,
      columns,
      tileCount: columns * rows,
      margin: { x: marginX, y: marginY },
      spacing: { x: spacingX, y: spacingY },
      tiles: [],
    },
  });
  dialog.close();
}

function commitInspectorTransform(): void {
  const values = [
    numberInput('object-x'),
    numberInput('object-y'),
    numberInput('object-rotation'),
    numberInput('object-width'),
    numberInput('object-height'),
    numberInput('object-origin-x'),
    numberInput('object-origin-y'),
  ];
  if (!values.every(Number.isFinite)) return;
  const [x, y, rotation, width, height, originX, originY] = values;
  if (width < 0 || height < 0 || originX < 0 || originX > 1 || originY < 0 || originY > 1) return;
  sendInspectorChange({
    type: 'transform',
    transform: {
      position: { x, y },
      rotation,
      size: { x: width, y: height },
      origin: { x: originX, y: originY },
    },
  });
}

function addBuiltinComponent(kind: 'spriteRenderer' | 'physicsBody2D'): void {
  const object = selectedObject()?.object;
  if (!object || object.components.some((component) => component.kind === kind)) return;
  if (kind === 'spriteRenderer') {
    const tileset = currentTileset();
    if (!tileset) return;
    sendInspectorChange({
      type: 'component',
      kind,
      data: { tilesetId: tileset.id, tileId: 0, flipX: false, flipY: false, flipDiagonal: false },
    });
  } else {
    sendInspectorChange({
      type: 'component',
      kind,
      data: { type: 'static', shape: { type: 'box', width: object.size.x, height: object.size.y }, isSensor: false },
    });
  }
}

function applyHostMessage(message: MapEditorHostMessage): void {
  if (message.type === 'document') {
    if (editGesture) {
      editGesture.cancel();
      editGesture = null;
    }
    mapDocument = message.document;
    documentEditable = message.editable;
    assetUris = message.assets ?? {};
    if (!mapDocument?.layers.some((layer) => layer.id === activeLayerId)) activeLayerId = mapDocument?.layers[0]?.id ?? null;
    if (!mapDocument?.tilesets.some((tileset) => tileset.id === activeTilesetId)) activeTilesetId = mapDocument?.tilesets[0]?.id ?? null;
    if (!selectedObject()) {
      selectedObjectId = null;
      selectedObjectLayerId = null;
      objectDrag = null;
    }
    updateHoverPreview(lastCanvasPoint, false);
    requiredElement<HTMLParagraphElement>('diagnostics').textContent = message.diagnostics;
    if (message.title) requiredElement<HTMLSpanElement>('document-name').textContent = message.title;
    renderLayers();
    renderPalette();
    renderCanvas();
    updateStatus();
    return;
  }
  if (message.type === 'assetSelected') {
    pendingTilesetAsset = { assetPath: message.assetPath, uri: message.uri };
    previewImage.hidden = false;
    requiredElement<HTMLParagraphElement>('tileset-source').textContent = message.assetPath;
    previewImage.onload = () => {
      requiredElement<HTMLParagraphElement>('tileset-image-size').textContent = `${previewImage.naturalWidth} × ${previewImage.naturalHeight} px`;
      updateTilesetDimensions();
    };
    previewImage.src = message.uri;
    return;
  }
  if (message.type === 'error') {
    diagnosticsElement.textContent = message.message;
    diagnosticsElement.hidden = false;
    errorLabel.textContent = message.message;
  }
}

document.querySelectorAll<HTMLButtonElement>('.toolbar button[data-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    const tool = button.dataset.tool;
    if (tool === 'select' || tool === 'paint' || tool === 'bucket' || tool === 'erase' || tool === 'placeObject') setTool(tool);
  });
});

requiredElement<HTMLButtonElement>('zoom-in').addEventListener('click', () => {
  zoom = Math.min(8, zoom * 1.2);
  renderCanvas();
});
requiredElement<HTMLButtonElement>('zoom-out').addEventListener('click', () => {
  zoom = Math.max(0.2, zoom / 1.2);
  renderCanvas();
});
zoomLabel.addEventListener('click', () => {
  zoom = 1;
  panX = 24;
  panY = 24;
  renderCanvas();
});
requiredElement<HTMLButtonElement>('add-tile-layer').addEventListener('click', () => {
  const layer = createTileLayer();
  activeLayerId = layer.id;
  sendEdit({ type: 'addLayer', layer });
});
requiredElement<HTMLButtonElement>('add-object-layer').addEventListener('click', () => {
  const layer = createObjectLayer();
  activeLayerId = layer.id;
  selectedObjectId = null;
  selectedObjectLayerId = null;
  sendEdit({ type: 'addLayer', layer });
  setTool('placeObject');
});
requiredElement<HTMLButtonElement>('move-layer-up').addEventListener('click', () => {
  if (!mapDocument || !activeLayerId) return;
  const index = mapDocument.layers.findIndex((layer) => layer.id === activeLayerId);
  if (index > 0) sendEdit({ type: 'reorderLayer', layerId: activeLayerId, toIndex: index - 1 });
});
requiredElement<HTMLButtonElement>('move-layer-down').addEventListener('click', () => {
  if (!mapDocument || !activeLayerId) return;
  const index = mapDocument.layers.findIndex((layer) => layer.id === activeLayerId);
  if (index >= 0 && index < mapDocument.layers.length - 1) sendEdit({ type: 'reorderLayer', layerId: activeLayerId, toIndex: index + 1 });
});
requiredElement<HTMLButtonElement>('apply-layer-settings').addEventListener('click', commitLayerSettings);
requiredElement<HTMLButtonElement>('add-tileset').addEventListener('click', chooseTilesetImage);
requiredElement<HTMLButtonElement>('set-main-tileset').addEventListener('click', () => {
  if (activeTilesetId) sendEdit({ type: 'setMainTileset', tilesetId: activeTilesetId });
});
requiredElement<HTMLButtonElement>('choose-tileset-image').addEventListener('click', () => host.postMessage({ type: 'requestTilesetImage' }));
requiredElement<HTMLButtonElement>('close-tileset-dialog').addEventListener('click', () => dialog.close());
requiredElement<HTMLFormElement>('tileset-form').addEventListener('submit', (event) => {
  event.preventDefault();
  makeTileset();
});
tilesetSelect.addEventListener('change', () => {
  activeTilesetId = tilesetSelect.value || null;
  activeTileId = 0;
  tileSelection = { x: 0, y: 0, width: 1, height: 1 };
  stampPreviewCache = null;
  renderPalette();
  renderCanvas();
});
for (const id of ['tile-width', 'tile-height', 'margin-x', 'margin-y', 'spacing-x', 'spacing-y']) {
  requiredElement<HTMLInputElement>(id).addEventListener('input', updateTilesetDimensions);
}

requiredElement<HTMLInputElement>('object-name').addEventListener('change', (event) => {
  sendInspectorChange({ type: 'name', value: (event.currentTarget as HTMLInputElement).value });
});
requiredElement<HTMLInputElement>('object-type').addEventListener('change', (event) => {
  sendInspectorChange({ type: 'objectType', value: (event.currentTarget as HTMLInputElement).value });
});
requiredElement<HTMLInputElement>('object-tags').addEventListener('change', (event) => {
  const tags = (event.currentTarget as HTMLInputElement).value.split(',').map((tag) => tag.trim()).filter(Boolean);
  sendInspectorChange({ type: 'tags', value: tags });
});
requiredElement<HTMLInputElement>('object-visible').addEventListener('change', (event) => {
  sendInspectorChange({ type: 'visible', value: (event.currentTarget as HTMLInputElement).checked });
});
for (const id of ['object-x', 'object-y', 'object-rotation', 'object-width', 'object-height', 'object-origin-x', 'object-origin-y']) {
  requiredElement<HTMLInputElement>(id).addEventListener('change', commitInspectorTransform);
}
requiredElement<HTMLButtonElement>('add-property').addEventListener('click', () => {
  const name = requiredElement<HTMLInputElement>('new-property-name').value.trim();
  const valueInput = requiredElement<HTMLInputElement>('new-property-value');
  const value = propertyValue(requiredElement<HTMLSelectElement>('new-property-type').value, valueInput);
  if (!name || !value) return;
  sendInspectorChange({ type: 'property', name, value });
  requiredElement<HTMLInputElement>('new-property-name').value = '';
  valueInput.value = '';
});
requiredElement<HTMLButtonElement>('add-sprite-component').addEventListener('click', () => addBuiltinComponent('spriteRenderer'));
requiredElement<HTMLButtonElement>('add-physics-component').addEventListener('click', () => addBuiltinComponent('physicsBody2D'));

tilesetCanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const cell = tilesetCellAt(event);
  if (!cell) return;
  tilesetCanvas.setPointerCapture(event.pointerId);
  tileSelectionDrag = { pointerId: event.pointerId, start: cell };
  updateTileSelection(cell);
});
tilesetCanvas.addEventListener('pointermove', (event) => {
  if (tileSelectionDrag?.pointerId !== event.pointerId) return;
  const cell = tilesetCellAt(event);
  if (cell) updateTileSelection(cell);
});
const stopTilesetSelection = (event: PointerEvent): void => {
  if (tileSelectionDrag?.pointerId === event.pointerId) tileSelectionDrag = null;
};
tilesetCanvas.addEventListener('pointerup', stopTilesetSelection);
tilesetCanvas.addEventListener('pointercancel', stopTilesetSelection);

canvas.addEventListener('pointerdown', (event) => {
  if (!documentEditable) return;
  if (event.button !== 0 && event.button !== 1) return;
  canvas.setPointerCapture(event.pointerId);
  lastPaintedCell = '';
  if (event.button === 1 || spaceDown || activeTool === 'pan') {
    updateHoverPreview(null, false);
    panningPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.classList.add('panning');
    return;
  }
  if (mapDocument) editGesture = new World2DEditGesture(mapDocument);
  const point = screenPoint(event);
  updateHoverPreview(point, false);
  if (activeTool === 'select' || activeTool === 'placeObject') handleObjectPointerDown(point, event.pointerId);
  else paintAt(point);
});
canvas.addEventListener('pointermove', (event) => {
  if (panningPointer?.id === event.pointerId) {
    panX += event.clientX - panningPointer.x;
    panY += event.clientY - panningPointer.y;
    panningPointer.x = event.clientX;
    panningPointer.y = event.clientY;
    renderCanvas();
    return;
  }
  if (objectDrag?.id === event.pointerId) {
    dragSelectedObject(screenPoint(event), event.pointerId);
    return;
  }
  const point = screenPoint(event);
  const hoverChanged = updateHoverPreview(point, false);
  if ((event.buttons & 1) !== 0 && (activeTool === 'paint' || activeTool === 'erase')) paintAt(point);
  else if (hoverChanged) renderCanvas();
});
const stopPointer = (event: PointerEvent): void => {
  if (panningPointer?.id === event.pointerId) panningPointer = null;
  if (objectDrag?.id === event.pointerId) objectDrag = null;
  canvas.classList.remove('panning');
  updateHoverPreview(screenPoint(event), false);
  if (editGesture) completeEditGesture(event.type === 'pointercancel');
};
canvas.addEventListener('pointerup', stopPointer);
canvas.addEventListener('pointercancel', stopPointer);
canvas.addEventListener('pointerleave', (event) => {
  if (event.buttons === 0 && !panningPointer) updateHoverPreview(null);
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const point = screenPoint(event);
  const world = screenToWorld(point, { zoom, panX, panY });
  zoom = Math.min(8, Math.max(0.2, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
  panX = point.x - world.x * zoom;
  panY = point.y - world.y * zoom;
  renderCanvas();
}, { passive: false });
window.addEventListener('keydown', (event) => {
  const target = event.target;
  const editingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
  if (event.code === 'Space' && !editingText) {
    spaceDown = true;
    canvas.classList.add('pan-tool');
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    spaceDown = false;
    canvas.classList.toggle('pan-tool', activeTool === 'pan');
  }
});
window.addEventListener('message', (event: MessageEvent<MapEditorHostMessage>) => applyHostMessage(event.data));
window.addEventListener('resize', renderCanvas);
new ResizeObserver(renderCanvas).observe(canvas);

renderLayers();
renderPalette();
renderCanvas();
host.postMessage({ type: 'ready' });
