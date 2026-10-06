import type {
  SpriteAnimationClipDefinition,
  SpriteAnimationDocument,
  SpriteAnimationFrameDefinition,
  SpriteAnimationFrameTransform,
  SpriteAnimationLoop,
  SpriteSheetCharacterMetadata,
} from '../animations/spriteAnimationSchema';
import { getAnimationPreviewClipOptions, selectFramesForGroupAndDirection } from '../animations/animationPreview';
import type { AnimationPreviewSelection } from '../animations/animationPreview';
import { cropSpriteFrameFromDrag } from '../animations/animationFrames';
import { DEFAULT_SPRITE_FRAME_TRANSFORM, getSpriteAnimationCanvasSize, getSpriteAnimationFrameTransform } from '../animations/animationFrameTransform';
import { applySpriteAnimationClipUpdate, shouldAcceptSpriteAnimationSnapshot } from '../animations/spriteAnimationEdits';

interface HostApi {
  postMessage(message: unknown): void;
}

interface FrameImageAsset {
  path: string;
  uri: string;
  size: { width: number; height: number };
}

interface DocumentMessage {
  type: 'document';
  document: SpriteAnimationDocument | null;
  metadata: SpriteSheetCharacterMetadata | null;
  imageUri: string | null;
  imageSize: { width: number; height: number } | null;
  sourceImagePath: string | null;
  frameImages: FrameImageAsset[];
  editable: boolean;
  dirty: boolean;
  diagnostics: string;
  title: string;
  externalEditGeneration: number;
  acknowledgedEditId?: number;
}

interface FrameImagesSelectedMessage {
  type: 'frameImagesSelected';
  images: FrameImageAsset[];
}

declare function acquireVsCodeApi(): HostApi;

const vscode = acquireVsCodeApi();
const clipSelect = getElement<HTMLSelectElement>('#clip-select');
const addClipButton = getElement<HTMLButtonElement>('#add-clip');
const deleteClipButton = getElement<HTMLButtonElement>('#delete-clip');
const clipNameInput = getElement<HTMLInputElement>('#clip-name');
const groupSelect = getElement<HTMLSelectElement>('#group-select');
const fpsInput = getElement<HTMLInputElement>('#clip-fps');
const loopSelect = getElement<HTMLSelectElement>('#clip-loop');
const canvasWidthInput = getElement<HTMLInputElement>('#canvas-width');
const canvasHeightInput = getElement<HTMLInputElement>('#canvas-height');
const directionSelect = getElement<HTMLSelectElement>('#direction-select');
const clipInspector = getElement<HTMLElement>('#clip-inspector');
const emptyNote = getElement<HTMLElement>('#empty-note');
const loadingNote = getElement<HTMLElement>('#loading-note');
const sourceLabel = getElement<HTMLElement>('#source-label');
const titleLabel = getElement<HTMLElement>('#document-name');
const saveStatus = getElement<HTMLElement>('#save-status');
const diagnosticsPanel = getElement<HTMLElement>('#diagnostics');
const previewCanvas = getElement<HTMLCanvasElement>('#preview-canvas');
const atlasCanvas = getElement<HTMLCanvasElement>('#atlas-canvas');
const atlasDimensions = getElement<HTMLElement>('#atlas-dimensions');
const atlasImageSelect = getElement<HTMLSelectElement>('#atlas-image');
const gridSizeInput = getElement<HTMLInputElement>('#crop-grid-size');
const snapGridInput = getElement<HTMLInputElement>('#snap-grid');
const cropModeButton = getElement<HTMLButtonElement>('#crop-mode');
const cropHint = getElement<HTMLElement>('#crop-hint');
const frameList = getElement<HTMLOListElement>('#frame-list');
const addFramesButton = getElement<HTMLButtonElement>('#add-frames');
const frameNameInput = getElement<HTMLInputElement>('#frame-name');
const frameDurationInput = getElement<HTMLInputElement>('#frame-duration');
const frameOffsetXInput = getElement<HTMLInputElement>('#frame-offset-x');
const frameOffsetYInput = getElement<HTMLInputElement>('#frame-offset-y');
const frameStretchXInput = getElement<HTMLInputElement>('#frame-stretch-x');
const frameStretchYInput = getElement<HTMLInputElement>('#frame-stretch-y');
const framePivotXInput = getElement<HTMLInputElement>('#frame-pivot-x');
const framePivotYInput = getElement<HTMLInputElement>('#frame-pivot-y');
const frameZoomInput = getElement<HTMLInputElement>('#frame-zoom');
const frameZoomRangeInput = getElement<HTMLInputElement>('#frame-zoom-range');
const frameRotationInput = getElement<HTMLInputElement>('#frame-rotation');
const frameRotationRangeInput = getElement<HTMLInputElement>('#frame-rotation-range');
const resetFrameTransformButton = getElement<HTMLButtonElement>('#reset-frame-transform');
const moveFrameUpButton = getElement<HTMLButtonElement>('#move-frame-up');
const moveFrameDownButton = getElement<HTMLButtonElement>('#move-frame-down');
const deleteFrameButton = getElement<HTMLButtonElement>('#delete-frame');
const frameLabel = getElement<HTMLElement>('#frame-label');
const playButton = getElement<HTMLButtonElement>('#play-toggle');
const resetButton = getElement<HTMLButtonElement>('#reset-preview');
const frameScrubber = getElement<HTMLInputElement>('#frame-scrubber');

let animationDocument: SpriteAnimationDocument | null = null;
let metadata: SpriteSheetCharacterMetadata | null = null;
let imageUri: string | null = null;
let imageSize: { width: number; height: number } | null = null;
let sourceImagePath: string | null = null;
let frameImageAssets = new Map<string, FrameImageAsset>();
const frameImageCache = new Map<string, HTMLImageElement>();
let editable = false;
let documentDirty = false;
let diagnostics = '';
let selectedClipName = '';
let selectedDirection = '';
let selectedFrameIndex = 0;
let selectedAtlasImagePath = '';
let cropMode = false;
let cropStart: { x: number; y: number } | null = null;
let cropEnd: { x: number; y: number } | null = null;
let loadedImage: HTMLImageElement | null = null;
let loadingImageUri: string | null = null;
let imageFailed = false;
let currentSelection: AnimationPreviewSelection | null = null;
let currentFrames: SpriteAnimationFrameDefinition[] = [];
let currentFrameIndex = 0;
let previewTransformDraft: SpriteAnimationFrameTransform | null = null;
let previewDragStart: { pointerId: number; x: number; y: number; offsetX: number; offsetY: number; scale: number } | null = null;
let playbackStartedAt = 0;
let pausedElapsedSeconds = 0;
let playing = false;
let animationFrameRequest = 0;
let latestLocalEditId = 0;
let acknowledgedEditId = 0;
let externalEditGeneration = 0;

function getElement<T extends HTMLElement>(selector: string): T {
  const element = window.document.querySelector<T>(selector);
  if (!element) throw new Error('Missing sprite animation editor element: ' + selector);
  return element;
}

function replaceOptions(select: HTMLSelectElement, values: readonly string[], selected: string): void {
  select.replaceChildren(...values.map((value) => new Option(value, value, false, value === selected)));
}

function activeClip(): SpriteAnimationClipDefinition | null {
  return animationDocument?.clips.find((clip) => clip.name === selectedClipName) ?? null;
}

function uniqueAnimationGroups(): string[] {
  if (!metadata) return [];
  const result: string[] = [];
  for (const row of metadata.rows) {
    if (row.animation_group_id && row.direction && !result.includes(row.animation_group_id)) result.push(row.animation_group_id);
  }
  return result;
}

function canEdit(): boolean {
  return editable && imageSize !== null && !imageFailed;
}

function postDocument(next: SpriteAnimationDocument): void {
  if (!canEdit()) return;
  animationDocument = next;
  documentDirty = true;
  const editId = ++latestLocalEditId;
  stopPlayback();
  saveStatus.textContent = 'Saving…';
  vscode.postMessage({ type: 'edit', editId, externalEditGeneration, document: next });
  render();
}

function updateClip(update: (clip: SpriteAnimationClipDefinition) => SpriteAnimationClipDefinition): void {
  const clip = activeClip();
  if (!clip || !animationDocument) return;
  const nextClip = update(clip);
  selectedClipName = nextClip.name;
  pausedElapsedSeconds = 0;
  currentFrameIndex = 0;
  postDocument(applySpriteAnimationClipUpdate(animationDocument, clip.name, () => nextClip));
}

function setImage(uri: string | null): void {
  if (uri === loadingImageUri && (loadedImage || imageFailed)) return;
  loadingImageUri = uri;
  loadedImage = null;
  imageFailed = false;
  imageSize = null;
  if (!uri) return;

  const image = new Image();
  image.onload = () => {
    if (loadingImageUri !== uri) return;
    loadedImage = image;
    imageFailed = false;
    vscode.postMessage({ type: 'imageSize', width: image.naturalWidth, height: image.naturalHeight });
    render();
  };
  image.onerror = () => {
    if (loadingImageUri !== uri) return;
    loadedImage = null;
    imageFailed = true;
    vscode.postMessage({ type: 'imageLoadError' });
    render();
  };
  image.src = uri;
}

function imageForPath(path: string | undefined): HTMLImageElement | null {
  if (!path || path === sourceImagePath) return loadedImage;
  const asset = frameImageAssets.get(path);
  if (!asset) return null;
  const cached = frameImageCache.get(path);
  if (cached) return cached;

  const image = new Image();
  frameImageCache.set(path, image);
  image.onload = () => {
    if (frameImageCache.get(path) !== image) return;
    drawPreview();
    drawAtlas();
    refreshFrameThumbnails();
    updatePlaybackControls();
  };
  image.onerror = () => {
    if (frameImageCache.get(path) !== image) return;
    frameImageCache.delete(path);
    cropHint.textContent = 'Could not decode ' + basename(path) + '.';
    updatePlaybackControls();
  };
  image.src = asset.uri;
  return image;
}

function setCanvasSize(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D | null {
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(cssWidth * ratio));
  const height = Math.max(1, Math.round(cssHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = false;
  return context;
}

function drawFrameInBox(
  context: CanvasRenderingContext2D,
  frame: SpriteAnimationFrameDefinition,
  image: HTMLImageElement | null,
  stageWidth: number,
  stageHeight: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): number {
  const padding = 8;
  const scale = Math.max(0.01, Math.min(
    (boxWidth - padding * 2) / stageWidth,
    (boxHeight - padding * 2) / stageHeight,
  ));
  const drawnStageWidth = stageWidth * scale;
  const drawnStageHeight = stageHeight * scale;
  const stageX = boxX + (boxWidth - drawnStageWidth) / 2;
  const stageY = boxY + (boxHeight - drawnStageHeight) / 2;
  context.fillStyle = 'rgba(0, 0, 0, 0.08)';
  context.fillRect(stageX, stageY, drawnStageWidth, drawnStageHeight);
  context.strokeStyle = 'rgba(150, 160, 180, 0.7)';
  context.lineWidth = 1;
  context.strokeRect(stageX + 0.5, stageY + 0.5, drawnStageWidth - 1, drawnStageHeight - 1);

  if (image && image.naturalWidth > 0) {
    const transform = previewTransformDraft ?? getSpriteAnimationFrameTransform(frame);
    context.save();
    context.translate(
      stageX + (stageWidth / 2 + transform.offset.x) * scale,
      stageY + (stageHeight / 2 + transform.offset.y) * scale,
    );
    context.rotate(transform.rotation * Math.PI / 180);
    context.scale(transform.stretch.x * transform.zoom * scale, transform.stretch.y * transform.zoom * scale);
    context.drawImage(image, frame.x, frame.y, frame.width, frame.height,
      -transform.pivot.x * frame.width, -transform.pivot.y * frame.height, frame.width, frame.height);
    context.restore();
  }
  return scale;
}

function drawFrameThumbnail(canvas: HTMLCanvasElement, frame: SpriteAnimationFrameDefinition): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const stageWidth = currentSelection?.canvasWidth ?? frame.width;
  const stageHeight = currentSelection?.canvasHeight ?? frame.height;
  drawFrameInBox(context, frame, imageForPath(frame.image), stageWidth, stageHeight, 0, 0, canvas.width, canvas.height);
}

function refreshFrameThumbnails(): void {
  for (const canvas of frameList.querySelectorAll<HTMLCanvasElement>('.frame-thumb')) {
    const index = Number(canvas.dataset.frameIndex);
    const frame = currentFrames[index];
    if (frame) drawFrameThumbnail(canvas, frame);
  }
}

function drawPreview(): void {
  const bounds = previewCanvas.getBoundingClientRect();
  const context = setCanvasSize(previewCanvas, bounds.width || 256, bounds.height || 256);
  if (!context) return;
  context.clearRect(0, 0, bounds.width || 256, bounds.height || 256);
  const frame = currentFrames[currentFrameIndex];
  if (!frame || !currentSelection) return;
  const image = imageForPath(frame.image);
  drawFrameInBox(context, frame, image, currentSelection.canvasWidth, currentSelection.canvasHeight,
    0, 0, bounds.width || 256, bounds.height || 256);
}

function gridSize(): number {
  const value = Number(gridSizeInput.value);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1024) : 16;
}

function assetSize(path: string): { width: number; height: number } | null {
  return frameImageAssets.get(path)?.size ?? (path === sourceImagePath ? imageSize : null);
}

function visibleFramesForClip(clip: SpriteAnimationClipDefinition): SpriteAnimationFrameDefinition[] {
  if (clip.frames !== undefined) return clip.frames;
  if (!sourceImagePath || !currentSelection) return [];
  return currentSelection.frames.map((frame, index) => ({
    image: sourceImagePath!,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    name: 'frame-' + String(index + 1),
  }));
}

function renderFrameList(): void {
  frameList.replaceChildren();
  currentFrames.forEach((frame, index) => {
    const row = window.document.createElement('li');
    row.className = 'frame-row';

    const select = window.document.createElement('button');
    select.type = 'button';
    select.className = 'frame-select' + (index === selectedFrameIndex ? ' active' : '');
    select.setAttribute('aria-pressed', String(index === selectedFrameIndex));
    const thumbnail = window.document.createElement('canvas');
    thumbnail.className = 'frame-thumb';
    thumbnail.width = 64;
    thumbnail.height = 64;
    thumbnail.dataset.frameIndex = String(index);
    const name = window.document.createElement('strong');
    name.textContent = String(index + 1).padStart(2, '0') + ' · ' + (frame.name || basename(frame.image));
    const details = window.document.createElement('span');
    details.textContent = basename(frame.image) + ' · ' + frame.width + '×' + frame.height +
      ' at ' + frame.x + ',' + frame.y +
      (frame.duration ? ' · ' + frame.duration + 's' : '');
    const copy = window.document.createElement('span');
    copy.className = 'frame-copy';
    copy.append(name, details);
    select.append(thumbnail, copy);
    drawFrameThumbnail(thumbnail, frame);
    select.addEventListener('click', () => {
      selectedFrameIndex = index;
      currentFrameIndex = index;
      selectedAtlasImagePath = frame.image;
      render();
    });
    row.append(select);

    const order = window.document.createElement('span');
    order.className = 'frame-order';
    const up = window.document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.title = 'Move frame up';
    up.disabled = !canEdit() || index === 0;
    up.addEventListener('click', () => moveFrame(index, -1));
    const down = window.document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.title = 'Move frame down';
    down.disabled = !canEdit() || index === currentFrames.length - 1;
    down.addEventListener('click', () => moveFrame(index, 1));
    order.append(up, down);
    row.append(order);
    frameList.append(row);
  });

  const frame = currentFrames[selectedFrameIndex];
  const hasFrame = frame !== undefined;
  frameNameInput.disabled = !canEdit() || !hasFrame;
  frameDurationInput.disabled = !canEdit() || !hasFrame;
  moveFrameUpButton.disabled = !canEdit() || !hasFrame || selectedFrameIndex === 0;
  moveFrameDownButton.disabled = !canEdit() || !hasFrame || selectedFrameIndex >= currentFrames.length - 1;
  deleteFrameButton.disabled = !canEdit() || !hasFrame;
  frameNameInput.value = frame?.name ?? '';
  frameDurationInput.value = frame?.duration === undefined ? '' : String(frame.duration);
  const transform = frame ? getSpriteAnimationFrameTransform(frame) : DEFAULT_SPRITE_FRAME_TRANSFORM;
  frameOffsetXInput.disabled = !canEdit() || !hasFrame;
  frameOffsetYInput.disabled = !canEdit() || !hasFrame;
  frameStretchXInput.disabled = !canEdit() || !hasFrame;
  frameStretchYInput.disabled = !canEdit() || !hasFrame;
  frameZoomInput.disabled = !canEdit() || !hasFrame;
  frameZoomRangeInput.disabled = !canEdit() || !hasFrame;
  framePivotXInput.disabled = !canEdit() || !hasFrame;
  framePivotYInput.disabled = !canEdit() || !hasFrame;
  frameRotationInput.disabled = !canEdit() || !hasFrame;
  frameRotationRangeInput.disabled = !canEdit() || !hasFrame;
  resetFrameTransformButton.disabled = !canEdit() || !hasFrame;
  frameOffsetXInput.value = String(transform.offset.x);
  frameOffsetYInput.value = String(transform.offset.y);
  frameStretchXInput.value = String(transform.stretch.x);
  frameStretchYInput.value = String(transform.stretch.y);
  frameZoomInput.value = String(transform.zoom);
  frameZoomRangeInput.value = String(Math.max(0.1, Math.min(4, transform.zoom)));
  framePivotXInput.value = String(transform.pivot.x);
  framePivotYInput.value = String(transform.pivot.y);
  frameRotationInput.value = String(transform.rotation);
  frameRotationRangeInput.value = String(Math.max(-180, Math.min(180, transform.rotation)));
}

function renderAtlasImageOptions(): void {
  const paths = [...frameImageAssets.keys()];
  if (!paths.includes(selectedAtlasImagePath)) selectedAtlasImagePath = currentFrames[selectedFrameIndex]?.image ?? sourceImagePath ?? paths[0] ?? '';
  atlasImageSelect.replaceChildren(...paths.map((path) =>
    new Option(basename(path), path, false, path === selectedAtlasImagePath)));
  atlasImageSelect.disabled = paths.length === 0;
  cropModeButton.disabled = !canEdit() || paths.length === 0;
  cropModeButton.textContent = cropMode ? 'Stop cropping' : 'Crop frames';
  atlasCanvas.classList.toggle('crop-mode', cropMode);
}

function drawAtlas(): void {
  const path = selectedAtlasImagePath;
  const size = path ? assetSize(path) : null;
  if (!path || !size) {
    atlasCanvas.width = 1;
    atlasCanvas.height = 1;
    atlasDimensions.textContent = 'No image available';
    return;
  }

  const scale = Math.min(1, 2048 / Math.max(size.width, size.height), Math.sqrt(4_000_000 / (size.width * size.height)));
  const width = Math.max(1, Math.floor(size.width * scale));
  const height = Math.max(1, Math.floor(size.height * scale));
  atlasCanvas.width = width;
  atlasCanvas.height = height;
  const displayScale = Math.min(1, 960 / width, 600 / height);
  atlasCanvas.style.width = Math.floor(width * displayScale) + 'px';
  atlasCanvas.style.height = Math.floor(height * displayScale) + 'px';
  const context = atlasCanvas.getContext('2d');
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);

  const image = imageForPath(path);
  if (image && image.naturalWidth > 0) context.drawImage(image, 0, 0, width, height);

  const step = gridSize() * scale;
  if (step >= 2) {
    context.beginPath();
    context.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    context.lineWidth = 1;
    for (let x = step; x < width; x += step) {
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = step; y < height; y += step) {
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
    }
    context.stroke();
  }

  currentFrames.forEach((frame, index) => {
    if (frame.image !== path) return;
    context.fillStyle = index === selectedFrameIndex ? 'rgba(255, 200, 60, 0.18)' : 'rgba(50, 150, 255, 0.12)';
    context.fillRect(frame.x * scale, frame.y * scale, frame.width * scale, frame.height * scale);
    context.strokeStyle = index === selectedFrameIndex ? 'rgba(255, 212, 74, 1)' : 'rgba(88, 180, 255, 0.9)';
    context.lineWidth = index === selectedFrameIndex ? 2 : 1;
    context.strokeRect(frame.x * scale + 0.5, frame.y * scale + 0.5,
      Math.max(0, frame.width * scale - 1), Math.max(0, frame.height * scale - 1));
  });

  if (cropStart && cropEnd) {
    const rect = cropSpriteFrameFromDrag(cropStart, cropEnd, size.width, size.height, gridSize(), snapGridInput.checked);
    if (rect) {
      context.fillStyle = 'rgba(90, 230, 170, 0.25)';
      context.fillRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
      context.strokeStyle = 'rgba(90, 230, 170, 1)';
      context.lineWidth = 2;
      context.strokeRect(rect.x * scale + 1, rect.y * scale + 1,
        Math.max(0, rect.width * scale - 2), Math.max(0, rect.height * scale - 2));
    }
  }

  atlasDimensions.textContent = size.width + ' × ' + size.height + ' · ' + basename(path);
  cropHint.textContent = cropMode
    ? (snapGridInput.checked ? 'Drag to crop; selection snaps to ' + gridSize() + ' px.' : 'Drag to crop pixel-exact bounds.')
    : 'Select an image, then drag to crop a frame.';
}

function stopPlayback(): void {
  playing = false;
  if (animationFrameRequest) window.cancelAnimationFrame(animationFrameRequest);
  animationFrameRequest = 0;
  playButton.textContent = 'Play';
}

function elapsedFrameIndex(elapsedSeconds: number): number {
  if (!currentSelection) return 0;
  const count = currentFrames.length;
  if (count === 0) return 0;
  const durationAt = (index: number): number => currentFrames[index]?.duration ?? (1 / currentSelection!.fps);
  const order: number[] = [];
  for (let index = 0; index < count; index++) order.push(index);
  if (currentSelection.loop === 'ping-pong' && count > 2) {
    for (let index = count - 2; index > 0; index--) order.push(index);
  }
  const total = order.reduce((sum, index) => sum + durationAt(index), 0);
  let time = Math.max(0, elapsedSeconds);
  if (currentSelection.loop === 'loop' || currentSelection.loop === 'ping-pong') time = total > 0 ? time % total : 0;
  else if (currentSelection.loop === 'once' && time >= total) return count - 1;

  for (const index of order) {
    const duration = durationAt(index);
    if (time < duration) return index;
    time -= duration;
  }
  return order[order.length - 1] ?? 0;
}

function frameStartTime(index: number): number {
  if (!currentSelection) return 0;
  let elapsed = 0;
  for (let current = 0; current < Math.min(index, currentFrames.length); current++) {
    elapsed += currentFrames[current]?.duration ?? (1 / currentSelection.fps);
  }
  return elapsed;
}

function sequenceDuration(): number {
  if (!currentSelection) return 0;
  const count = currentFrames.length;
  const durationAt = (index: number): number => currentFrames[index]?.duration ?? (1 / currentSelection!.fps);
  let total = 0;
  for (let index = 0; index < count; index++) total += durationAt(index);
  if (currentSelection.loop === 'ping-pong' && count > 2) {
    for (let index = count - 2; index > 0; index--) total += durationAt(index);
  }
  return total;
}

function paintFrame(index: number): void {
  currentFrameIndex = Math.max(0, Math.min(index, Math.max(0, (currentSelection?.frameCount ?? 1) - 1)));
  frameScrubber.value = String(currentFrameIndex);
  const frame = currentFrames[currentFrameIndex];
  frameLabel.textContent = currentSelection
    ? currentSelection.direction + ' · frame ' + (currentFrameIndex + 1) + ' / ' + currentSelection.frameCount +
      ' · ' + currentSelection.fps + ' FPS · ' + currentSelection.loop +
      (frame?.duration ? ' · ' + frame.duration + 's' : '')
    : '—';
  drawPreview();
  drawAtlas();
}

function playbackTick(now: number): void {
  if (!playing || !currentSelection) return;
  const elapsed = Math.max(0, (now - playbackStartedAt) / 1000);
  paintFrame(elapsedFrameIndex(elapsed));
  if (currentSelection.loop === 'once' && elapsed >= sequenceDuration()) {
    pausedElapsedSeconds = Math.max(0, sequenceDuration() - (currentFrames[currentFrames.length - 1]?.duration ?? (1 / currentSelection.fps)));
    stopPlayback();
    return;
  }
  animationFrameRequest = window.requestAnimationFrame(playbackTick);
}

function updatePlaybackControls(): void {
  const hasFrames = currentSelection !== null && currentFrames.length > 0;
  playButton.disabled = !hasFrames;
  resetButton.disabled = !hasFrames;
  frameScrubber.disabled = !hasFrames;
  frameScrubber.max = String(Math.max(0, (currentSelection?.frameCount ?? 1) - 1));
}

function customFramesForClip(clip: SpriteAnimationClipDefinition): SpriteAnimationFrameDefinition[] {
  if (clip.frames !== undefined) return clip.frames.map((frame) => ({ ...frame }));
  return visibleFramesForClip(clip).map((frame) => ({ ...frame }));
}

function postFrameList(nextFrames: SpriteAnimationFrameDefinition[], nextSelectedIndex: number): void {
  const clip = activeClip();
  if (!clip || !animationDocument) return;
  selectedFrameIndex = Math.max(0, Math.min(nextSelectedIndex, Math.max(0, nextFrames.length - 1)));
  selectedDirection = 'Frames';
  currentFrameIndex = selectedFrameIndex;
  pausedElapsedSeconds = 0;
  const nextClip = { ...clip, frames: nextFrames };
  selectedClipName = nextClip.name;
  postDocument(applySpriteAnimationClipUpdate(animationDocument, clip.name, () => nextClip));
}

function writeSelectedFrameTransform(transform: SpriteAnimationFrameTransform): void {
  const clip = activeClip();
  if (!clip || !canEdit()) return;
  const frames = customFramesForClip(clip);
  const frame = frames[selectedFrameIndex];
  if (!frame) return;
  frames[selectedFrameIndex] = { ...frame, transform: {
    offset: { ...transform.offset },
    stretch: { ...transform.stretch },
    zoom: transform.zoom,
    rotation: transform.rotation,
    pivot: { ...transform.pivot },
  } };
  postFrameList(frames, selectedFrameIndex);
}

function updateSelectedFrameTransform(update: (transform: SpriteAnimationFrameTransform) => SpriteAnimationFrameTransform): void {
  const frame = currentFrames[selectedFrameIndex];
  if (!frame) return;
  writeSelectedFrameTransform(update(getSpriteAnimationFrameTransform(frame)));
}

function moveFrame(index: number, offset: -1 | 1): void {
  const clip = activeClip();
  if (!clip || !canEdit()) return;
  const frames = customFramesForClip(clip);
  const target = index + offset;
  if (target < 0 || target >= frames.length) return;
  const [frame] = frames.splice(index, 1);
  if (!frame) return;
  frames.splice(target, 0, frame);
  postFrameList(frames, target);
}

function appendFrameDefinitions(framesToAdd: SpriteAnimationFrameDefinition[]): boolean {
  const clip = activeClip();
  if (!clip || !canEdit() || framesToAdd.length === 0) return false;
  const frames = customFramesForClip(clip);
  const start = frames.length;
  frames.push(...framesToAdd.map((frame) => ({ ...frame })));
  postFrameList(frames, start);
  return true;
}

function render(): void {
  const doc = animationDocument;
  const sheet = metadata;
  titleLabel.textContent = titleLabel.title = animationDocument
    ? animationDocument.source.split('/').pop() ?? 'Sprite Animation'
    : 'Sprite Animation';
  sourceLabel.textContent = doc ? 'Source metadata: ' + doc.source : '';
  diagnosticsPanel.textContent = diagnostics;
  diagnosticsPanel.hidden = diagnostics.length === 0;
  loadingNote.hidden = !imageUri || imageSize !== null || imageFailed;
  if (imageFailed && !diagnostics) {
    diagnosticsPanel.textContent = 'The sprite sheet image could not be decoded by the editor.';
    diagnosticsPanel.hidden = false;
  }
  if (!editable && imageUri && !imageSize && !diagnostics && !imageFailed) saveStatus.textContent = 'Checking image…';
  else if (!editable) saveStatus.textContent = 'Read only';
  else saveStatus.textContent = documentDirty ? 'Unsaved changes · Ctrl+S to save' : 'Saved';

  if (!doc || !sheet) {
    clipSelect.replaceChildren();
    currentSelection = null;
    currentFrames = [];
    clipInspector.hidden = true;
    emptyNote.hidden = false;
    addClipButton.disabled = true;
    deleteClipButton.disabled = true;
    addFramesButton.disabled = true;
    canvasWidthInput.disabled = true;
    canvasHeightInput.disabled = true;
    renderFrameList();
    renderAtlasImageOptions();
    updatePlaybackControls();
    drawPreview();
    atlasDimensions.textContent = '';
    atlasCanvas.width = 1;
    atlasCanvas.height = 1;
    return;
  }

  if (imageUri !== loadingImageUri) setImage(imageUri);
  const clipNames = doc.clips.map((clip) => clip.name);
  if (!clipNames.includes(selectedClipName)) selectedClipName = clipNames[0] ?? '';
  replaceOptions(clipSelect, clipNames, selectedClipName);
  clipSelect.disabled = clipNames.length === 0;
  emptyNote.hidden = clipNames.length > 0;
  clipInspector.hidden = clipNames.length === 0;
  addClipButton.disabled = !canEdit() || uniqueAnimationGroups().length === 0;
  deleteClipButton.disabled = !canEdit() || clipNames.length === 0;
  addFramesButton.disabled = !canEdit() || clipNames.length === 0;

  const clip = activeClip();
  if (!clip) {
    currentSelection = null;
    currentFrames = [];
    groupSelect.replaceChildren();
    directionSelect.replaceChildren();
    canvasWidthInput.disabled = true;
    canvasHeightInput.disabled = true;
    renderFrameList();
    updatePlaybackControls();
    emptyNote.textContent = uniqueAnimationGroups().length === 0
      ? 'No animation groups with direction rows are available in this metadata.'
      : 'Create a clip to start previewing this sprite sheet.';
    paintFrame(0);
    renderAtlasImageOptions();
    drawAtlas();
    return;
  }

  clipNameInput.value = clip.name;
  fpsInput.value = String(clip.fps);
  loopSelect.value = clip.loop;
  const canvasSize = getSpriteAnimationCanvasSize(clip, sheet);
  canvasWidthInput.value = String(canvasSize.width);
  canvasHeightInput.value = String(canvasSize.height);
  canvasWidthInput.disabled = !canEdit();
  canvasHeightInput.disabled = !canEdit();
  const groups = uniqueAnimationGroups();
  replaceOptions(groupSelect, groups, clip.animationGroupId);
  groupSelect.disabled = !canEdit() || clip.frames !== undefined;
  const options = getAnimationPreviewClipOptions(doc, sheet).find((option) => option.name === clip.name);
  const directions = options?.directions ?? [];
  if (!directions.includes(selectedDirection)) selectedDirection = directions[0] ?? '';
  replaceOptions(directionSelect, directions, selectedDirection);
  directionSelect.disabled = directions.length === 0 || clip.frames !== undefined;
  clipNameInput.disabled = !canEdit();
  fpsInput.disabled = !canEdit();
  loopSelect.disabled = !canEdit();

  currentSelection = selectedDirection
    ? selectFramesForGroupAndDirection(doc, sheet, clip.name, selectedDirection)
    : null;
  currentFrames = visibleFramesForClip(clip);
  if (currentFrames.length === 0 && clip.frames !== undefined) currentFrames = clip.frames;
  if (selectedFrameIndex >= currentFrames.length) selectedFrameIndex = Math.max(0, currentFrames.length - 1);
  if (!currentSelection) {
    stopPlayback();
    currentFrameIndex = 0;
  } else if (currentFrameIndex >= currentSelection.frameCount) {
    currentFrameIndex = 0;
  }

  renderFrameList();
  if (currentFrames[selectedFrameIndex]) selectedAtlasImagePath = currentFrames[selectedFrameIndex]!.image;
  renderAtlasImageOptions();
  updatePlaybackControls();
  paintFrame(currentFrameIndex);
}

function commitNewClip(): void {
  if (!animationDocument || !canEdit()) return;
  const group = uniqueAnimationGroups()[0];
  if (!group) return;
  const existingNames = new Set(animationDocument.clips.map((clip) => clip.name));
  let suffix = 1;
  let name = group;
  while (existingNames.has(name)) name = group + '_' + String(suffix++);
  const clip: SpriteAnimationClipDefinition = { name, animationGroupId: group, fps: 12, loop: 'loop' };
  selectedClipName = name;
  selectedDirection = '';
  selectedFrameIndex = 0;
  postDocument({ ...animationDocument, clips: [...animationDocument.clips, clip] });
}

function basename(path: string): string {
  const file = path.split('/').pop() ?? path;
  const extensionIndex = file.lastIndexOf('.');
  return extensionIndex > 0 ? file.slice(0, extensionIndex) : file;
}

function pointFromPointer(event: PointerEvent): { x: number; y: number } | null {
  const rect = atlasCanvas.getBoundingClientRect();
  const size = assetSize(selectedAtlasImagePath);
  if (!size || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: Math.max(0, Math.min(size.width - 1, ((event.clientX - rect.left) / rect.width) * size.width)),
    y: Math.max(0, Math.min(size.height - 1, ((event.clientY - rect.top) / rect.height) * size.height)),
  };
}

function selectFrameAtPoint(point: { x: number; y: number }): boolean {
  for (let index = currentFrames.length - 1; index >= 0; index--) {
    const frame = currentFrames[index];
    if (!frame || frame.image !== selectedAtlasImagePath) continue;
    if (point.x >= frame.x && point.y >= frame.y && point.x < frame.x + frame.width && point.y < frame.y + frame.height) {
      selectedFrameIndex = index;
      currentFrameIndex = index;
      render();
      return true;
    }
  }
  return false;
}

function finishCrop(point: { x: number; y: number }): void {
  const start = cropStart;
  const path = selectedAtlasImagePath;
  const size = assetSize(path);
  cropStart = null;
  cropEnd = null;
  if (!start || !size || !activeClip()) {
    drawAtlas();
    return;
  }
  const rect = cropSpriteFrameFromDrag(start, point, size.width, size.height, gridSize(), snapGridInput.checked);
  if (!rect) {
    drawAtlas();
    return;
  }
  const name = basename(path) + '-' + String(currentFrames.length + 1);
  appendFrameDefinitions([{ image: path, ...rect, name }]);
}

function handleFrameImagesSelected(message: FrameImagesSelectedMessage): void {
  if (!Array.isArray(message.images) || message.images.length === 0) {
    saveStatus.textContent = 'No images were selected';
    return;
  }
  if (!canEdit() || !activeClip()) {
    diagnosticsPanel.textContent = 'Create or select an editable animation clip before adding images.';
    diagnosticsPanel.hidden = false;
    return;
  }
  for (const asset of message.images) {
    frameImageAssets.set(asset.path, asset);
  }
  if (message.images[0]) selectedAtlasImagePath = message.images[0].path;
  const frames = message.images.map((asset) => ({
    image: asset.path,
    x: 0,
    y: 0,
    width: asset.size.width,
    height: asset.size.height,
    name: basename(asset.path),
  }));
  if (!appendFrameDefinitions(frames)) {
    diagnosticsPanel.textContent = 'The selected images could not be added to this animation.';
    diagnosticsPanel.hidden = false;
    return;
  }
  saveStatus.textContent = 'Added ' + frames.length + (frames.length === 1 ? ' frame' : ' frames');
}

function previewStageScale(): number | null {
  if (!currentSelection) return null;
  const bounds = previewCanvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return Math.max(0.01, Math.min(
    (bounds.width - 16) / currentSelection.canvasWidth,
    (bounds.height - 16) / currentSelection.canvasHeight,
  ));
}

function updateTransformControls(transform: SpriteAnimationFrameTransform): void {
  frameOffsetXInput.value = String(transform.offset.x);
  frameOffsetYInput.value = String(transform.offset.y);
  frameStretchXInput.value = String(transform.stretch.x);
  frameStretchYInput.value = String(transform.stretch.y);
  frameZoomInput.value = String(transform.zoom);
  frameZoomRangeInput.value = String(Math.max(0.1, Math.min(4, transform.zoom)));
  framePivotXInput.value = String(transform.pivot.x);
  framePivotYInput.value = String(transform.pivot.y);
  frameRotationInput.value = String(transform.rotation);
  frameRotationRangeInput.value = String(Math.max(-180, Math.min(180, transform.rotation)));
}

addClipButton.addEventListener('click', commitNewClip);
deleteClipButton.addEventListener('click', () => {
  if (!animationDocument || !canEdit()) return;
  const remaining = animationDocument.clips.filter((clip) => clip.name !== selectedClipName);
  selectedClipName = remaining[0]?.name ?? '';
  selectedDirection = '';
  selectedFrameIndex = 0;
  postDocument({ ...animationDocument, clips: remaining });
});
clipSelect.addEventListener('change', () => {
  stopPlayback();
  selectedClipName = clipSelect.value;
  selectedDirection = '';
  selectedFrameIndex = 0;
  pausedElapsedSeconds = 0;
  render();
});
clipNameInput.addEventListener('change', () => updateClip((clip) => ({ ...clip, name: clipNameInput.value.trim() })));
groupSelect.addEventListener('change', () => {
  selectedDirection = '';
  updateClip((clip) => ({ ...clip, animationGroupId: groupSelect.value }));
});
fpsInput.addEventListener('change', () => updateClip((clip) => ({ ...clip, fps: Number(fpsInput.value) })));
loopSelect.addEventListener('change', () => updateClip((clip) => ({ ...clip, loop: loopSelect.value as SpriteAnimationLoop })));
const applyCanvasSize = (): void => {
  const width = Number(canvasWidthInput.value);
  const height = Number(canvasHeightInput.value);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return;
  updateClip((clip) => ({ ...clip, canvasSize: { width, height } }));
};
canvasWidthInput.addEventListener('change', applyCanvasSize);
canvasHeightInput.addEventListener('change', applyCanvasSize);
directionSelect.addEventListener('change', () => {
  stopPlayback();
  selectedDirection = directionSelect.value;
  selectedFrameIndex = 0;
  pausedElapsedSeconds = 0;
  render();
});

addFramesButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'selectFrameImages' });
});
frameNameInput.addEventListener('change', () => {
  const frame = currentFrames[selectedFrameIndex];
  if (!frame) return;
  const frames = customFramesForClip(activeClip()!);
  const name = frameNameInput.value.trim();
  if (name) frames[selectedFrameIndex] = { ...frame, name };
  else {
    const next = { ...frame };
    delete next.name;
    frames[selectedFrameIndex] = next;
  }
  postFrameList(frames, selectedFrameIndex);
});
frameDurationInput.addEventListener('change', () => {
  const frame = currentFrames[selectedFrameIndex];
  if (!frame) return;
  const frames = customFramesForClip(activeClip()!);
  const duration = frameDurationInput.value.trim() === '' ? undefined : Number(frameDurationInput.value);
  const next = { ...frame };
  if (duration === undefined) delete next.duration;
  else next.duration = duration;
  frames[selectedFrameIndex] = next;
  postFrameList(frames, selectedFrameIndex);
});
const applyFrameTransformInputs = (): void => {
  previewTransformDraft = null;
  updateSelectedFrameTransform(() => ({
    offset: { x: Number(frameOffsetXInput.value), y: Number(frameOffsetYInput.value) },
    stretch: { x: Number(frameStretchXInput.value), y: Number(frameStretchYInput.value) },
    zoom: Number(frameZoomInput.value),
    rotation: Number(frameRotationInput.value),
    pivot: { x: Number(framePivotXInput.value), y: Number(framePivotYInput.value) },
  }));
};
for (const input of [frameOffsetXInput, frameOffsetYInput, frameStretchXInput, frameStretchYInput,
  framePivotXInput, framePivotYInput, frameZoomInput, frameRotationInput]) {
  input.addEventListener('change', applyFrameTransformInputs);
}
frameZoomRangeInput.addEventListener('input', () => {
  frameZoomInput.value = frameZoomRangeInput.value;
  const frame = currentFrames[selectedFrameIndex];
  if (!frame) return;
  previewTransformDraft = {
    ...getSpriteAnimationFrameTransform(frame),
    zoom: Number(frameZoomRangeInput.value),
  };
  drawPreview();
});
frameZoomRangeInput.addEventListener('change', applyFrameTransformInputs);
frameRotationRangeInput.addEventListener('input', () => {
  frameRotationInput.value = frameRotationRangeInput.value;
  const frame = currentFrames[selectedFrameIndex];
  if (!frame) return;
  previewTransformDraft = {
    ...getSpriteAnimationFrameTransform(frame),
    rotation: Number(frameRotationRangeInput.value),
  };
  drawPreview();
});
frameRotationRangeInput.addEventListener('change', applyFrameTransformInputs);
resetFrameTransformButton.addEventListener('click', () => writeSelectedFrameTransform({
  offset: { ...DEFAULT_SPRITE_FRAME_TRANSFORM.offset },
  stretch: { ...DEFAULT_SPRITE_FRAME_TRANSFORM.stretch },
  zoom: DEFAULT_SPRITE_FRAME_TRANSFORM.zoom,
  rotation: DEFAULT_SPRITE_FRAME_TRANSFORM.rotation,
  pivot: { ...DEFAULT_SPRITE_FRAME_TRANSFORM.pivot },
}));
moveFrameUpButton.addEventListener('click', () => moveFrame(selectedFrameIndex, -1));
moveFrameDownButton.addEventListener('click', () => moveFrame(selectedFrameIndex, 1));
deleteFrameButton.addEventListener('click', () => {
  const clip = activeClip();
  if (!clip || !canEdit()) return;
  const frames = customFramesForClip(clip);
  if (selectedFrameIndex < 0 || selectedFrameIndex >= frames.length) return;
  frames.splice(selectedFrameIndex, 1);
  postFrameList(frames, Math.min(selectedFrameIndex, frames.length - 1));
});
atlasImageSelect.addEventListener('change', () => {
  selectedAtlasImagePath = atlasImageSelect.value;
  cropStart = null;
  cropEnd = null;
  drawAtlas();
});
gridSizeInput.addEventListener('change', () => {
  const value = Number(gridSizeInput.value);
  if (!Number.isInteger(value) || value < 1) gridSizeInput.value = '16';
  drawAtlas();
});
snapGridInput.addEventListener('change', drawAtlas);
cropModeButton.addEventListener('click', () => {
  cropMode = !cropMode;
  cropStart = null;
  cropEnd = null;
  renderAtlasImageOptions();
  drawAtlas();
});
atlasCanvas.addEventListener('pointerdown', (event) => {
  const point = pointFromPointer(event);
  if (!point) return;
  if (!cropMode) {
    selectFrameAtPoint(point);
    return;
  }
  event.preventDefault();
  cropStart = point;
  cropEnd = point;
  atlasCanvas.setPointerCapture(event.pointerId);
  drawAtlas();
});
atlasCanvas.addEventListener('pointermove', (event) => {
  if (!cropStart) return;
  const point = pointFromPointer(event);
  if (!point) return;
  cropEnd = point;
  drawAtlas();
});
atlasCanvas.addEventListener('pointerup', (event) => {
  if (!cropStart) return;
  const point = pointFromPointer(event);
  if (!point) {
    cropStart = null;
    cropEnd = null;
    drawAtlas();
    return;
  }
  finishCrop(point);
});
previewCanvas.addEventListener('pointerdown', (event) => {
  const frame = currentFrames[currentFrameIndex];
  const scale = previewStageScale();
  if (!frame || !scale || !canEdit()) return;
  event.preventDefault();
  stopPlayback();
  selectedFrameIndex = currentFrameIndex;
  renderFrameList();
  const transform = getSpriteAnimationFrameTransform(frame);
  previewTransformDraft = {
    offset: { ...transform.offset },
    stretch: { ...transform.stretch },
    zoom: transform.zoom,
    rotation: transform.rotation,
    pivot: { ...transform.pivot },
  };
  previewDragStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offsetX: transform.offset.x,
    offsetY: transform.offset.y,
    scale,
  };
  previewCanvas.classList.add('preview-canvas-dragging');
  previewCanvas.setPointerCapture(event.pointerId);
});
previewCanvas.addEventListener('pointermove', (event) => {
  const drag = previewDragStart;
  if (!drag || drag.pointerId !== event.pointerId) return;
  previewTransformDraft = {
    ...(previewTransformDraft ?? DEFAULT_SPRITE_FRAME_TRANSFORM),
    offset: {
      x: Math.round((drag.offsetX + (event.clientX - drag.x) / drag.scale) * 100) / 100,
      y: Math.round((drag.offsetY + (event.clientY - drag.y) / drag.scale) * 100) / 100,
    },
  };
  updateTransformControls(previewTransformDraft);
  drawPreview();
});
previewCanvas.addEventListener('pointerup', (event) => {
  const drag = previewDragStart;
  if (!drag || drag.pointerId !== event.pointerId) return;
  previewDragStart = null;
  previewCanvas.classList.remove('preview-canvas-dragging');
  const transform = previewTransformDraft;
  previewTransformDraft = null;
  if (transform && (transform.offset.x !== drag.offsetX || transform.offset.y !== drag.offsetY)) {
    writeSelectedFrameTransform(transform);
  }
  else drawPreview();
});
previewCanvas.addEventListener('pointercancel', () => {
  previewDragStart = null;
  previewTransformDraft = null;
  previewCanvas.classList.remove('preview-canvas-dragging');
  render();
});

playButton.addEventListener('click', () => {
  if (!currentSelection || currentFrames.length === 0) return;
  if (playing) {
    pausedElapsedSeconds = Math.max(0, (performance.now() - playbackStartedAt) / 1000);
    stopPlayback();
    return;
  }
  if (currentSelection.loop === 'once' && currentFrameIndex === currentSelection.frameCount - 1) pausedElapsedSeconds = 0;
  playbackStartedAt = performance.now() - pausedElapsedSeconds * 1000;
  playing = true;
  playButton.textContent = 'Pause';
  animationFrameRequest = window.requestAnimationFrame(playbackTick);
});
resetButton.addEventListener('click', () => {
  stopPlayback();
  pausedElapsedSeconds = 0;
  paintFrame(0);
});
frameScrubber.addEventListener('input', () => {
  stopPlayback();
  currentFrameIndex = Number(frameScrubber.value) || 0;
  pausedElapsedSeconds = frameStartTime(currentFrameIndex);
  paintFrame(currentFrameIndex);
});

window.addEventListener('message', (event: MessageEvent<DocumentMessage | FrameImagesSelectedMessage | { type: 'error'; message: string }>) => {
  const message = event.data;
  if (message.type === 'error') {
    saveStatus.textContent = 'Action failed';
    diagnosticsPanel.textContent = message.message;
    diagnosticsPanel.hidden = false;
    return;
  }
  if (message.type === 'frameImagesSelected') {
    handleFrameImagesSelected(message);
    return;
  }
  if (message.type !== 'document') return;
  const previousUri = imageUri;
  if (typeof message.acknowledgedEditId === 'number' && Number.isSafeInteger(message.acknowledgedEditId) &&
      message.acknowledgedEditId >= 0) {
    acknowledgedEditId = Math.max(acknowledgedEditId, message.acknowledgedEditId);
  }
  const hasPendingLocalEdits = !shouldAcceptSpriteAnimationSnapshot(latestLocalEditId, acknowledgedEditId);
  if (!hasPendingLocalEdits) {
    animationDocument = message.document;
    if (Number.isSafeInteger(message.externalEditGeneration) && message.externalEditGeneration >= 0) {
      externalEditGeneration = Math.max(externalEditGeneration, message.externalEditGeneration);
    }
  }
  metadata = message.metadata;
  imageUri = message.imageUri;
  imageSize = message.imageSize;
  sourceImagePath = message.sourceImagePath;
  frameImageAssets = new Map<string, FrameImageAsset>();
  for (const asset of message.frameImages) frameImageAssets.set(asset.path, asset);
  editable = message.editable;
  documentDirty = message.dirty || hasPendingLocalEdits;
  diagnostics = message.diagnostics;
  titleLabel.title = message.title;
  if (imageUri !== previousUri) setImage(imageUri);
  if (imageUri && !imageSize) imageSize = null;
  if (imageSize && loadedImage) imageSize = { width: loadedImage.naturalWidth, height: loadedImage.naturalHeight };
  if (canEdit()) saveStatus.textContent = documentDirty ? 'Unsaved changes · Ctrl+S to save' : 'Saved';
  render();
});

window.addEventListener('resize', () => {
  drawPreview();
  drawAtlas();
});

window.addEventListener('beforeunload', stopPlayback);
render();
vscode.postMessage({ type: 'ready' });
