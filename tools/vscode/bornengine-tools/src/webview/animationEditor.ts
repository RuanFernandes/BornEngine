import type {
  SpriteAnimationClipDefinition,
  SpriteAnimationDocument,
  SpriteAnimationFrameDefinition,
  SpriteAnimationFrameTransform,
  SpriteAnimationLoop,
  SpriteSheetCharacterMetadata,
} from '../animations/spriteAnimationSchema';
import {
  findMetadataDirectionRow,
  getAnimationPreviewClipOptions,
  selectFramesForGroupAndDirection,
} from '../animations/animationPreview';
import type { AnimationPreviewSelection } from '../animations/animationPreview';
import { cropSpriteFrameFromDrag } from '../animations/animationFrames';
import { DEFAULT_SPRITE_FRAME_TRANSFORM, getSpriteAnimationCanvasSize, getSpriteAnimationFrameTransform } from '../animations/animationFrameTransform';
import { applySpriteAnimationClipUpdate, shouldAcceptSpriteAnimationSnapshot } from '../animations/spriteAnimationEdits';
import {
  ANIMATION_DIRECTIONS,
  ANIMATION_DIRECTION_ARROWS,
  ANIMATION_DIRECTION_LABELS,
  DEFAULT_ANIMATION_DIRECTION,
  copyClipDirection,
  isAnimationDirection,
  oppositeHorizontalDirection,
  setClipDirectional,
  withClipFrameList,
} from '../animations/animationDirections';
import type { AnimationDirection } from '../animations/animationDirections';

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
const clipList = getElement<HTMLUListElement>('#clip-list');
const addClipButton = getElement<HTMLButtonElement>('#add-clip');
const deleteClipButton = getElement<HTMLButtonElement>('#delete-clip');
const clipNameInput = getElement<HTMLInputElement>('#clip-name');
const groupSelect = getElement<HTMLSelectElement>('#group-select');
const fpsInput = getElement<HTMLInputElement>('#clip-fps');
const loopSelect = getElement<HTMLSelectElement>('#clip-loop');
const canvasWidthInput = getElement<HTMLInputElement>('#canvas-width');
const canvasHeightInput = getElement<HTMLInputElement>('#canvas-height');
const directionalInput = getElement<HTMLInputElement>('#clip-directional');
const sheetSource = getElement<HTMLElement>('#sheet-source');
const directionSelect = getElement<HTMLSelectElement>('#direction-select');
const clipInspector = getElement<HTMLElement>('#clip-inspector');
const emptyNote = getElement<HTMLElement>('#empty-note');
const loadingNote = getElement<HTMLElement>('#loading-note');
const sourceLabel = getElement<HTMLElement>('#source-label');
const titleLabel = getElement<HTMLElement>('#document-name');
const saveStatus = getElement<HTMLElement>('#save-status');
const noticeLabel = getElement<HTMLElement>('#notice');
const diagnosticsPanel = getElement<HTMLElement>('#diagnostics');
const directionPad = getElement<HTMLElement>('#direction-pad');
const directionLabel = getElement<HTMLElement>('#direction-label');
const directionTools = getElement<HTMLElement>('#direction-tools');
const copyDirectionTarget = getElement<HTMLSelectElement>('#copy-direction-target');
const copyDirectionMirror = getElement<HTMLInputElement>('#copy-direction-mirror');
const copyDirectionButton = getElement<HTMLButtonElement>('#copy-direction');
const stageTitle = getElement<HTMLElement>('#stage-title');
const previewCanvas = getElement<HTMLCanvasElement>('#preview-canvas');
const previewEmpty = getElement<HTMLElement>('#preview-empty');
const atlasCanvas = getElement<HTMLCanvasElement>('#atlas-canvas');
const atlasDimensions = getElement<HTMLElement>('#atlas-dimensions');
const atlasImageSelect = getElement<HTMLSelectElement>('#atlas-image');
const cropActionSelect = getElement<HTMLSelectElement>('#crop-action');
const gridSizeInput = getElement<HTMLInputElement>('#crop-grid-size');
const snapGridInput = getElement<HTMLInputElement>('#snap-grid');
const cropHint = getElement<HTMLElement>('#crop-hint');
const frameList = getElement<HTMLOListElement>('#frame-list');
const timelineDirection = getElement<HTMLElement>('#timeline-direction');
const addFramesButton = getElement<HTMLButtonElement>('#add-frames');
const frameIndexLabel = getElement<HTMLElement>('#frame-index-label');
const frameEmpty = getElement<HTMLElement>('#frame-empty');
const frameFields = getElement<HTMLElement>('#frame-fields');
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
const duplicateFrameButton = getElement<HTMLButtonElement>('#duplicate-frame');
const deleteFrameButton = getElement<HTMLButtonElement>('#delete-frame');
const frameLabel = getElement<HTMLElement>('#frame-label');
const playButton = getElement<HTMLButtonElement>('#play-toggle');
const resetButton = getElement<HTMLButtonElement>('#reset-preview');
const prevFrameButton = getElement<HTMLButtonElement>('#prev-frame');
const nextFrameButton = getElement<HTMLButtonElement>('#next-frame');
const frameScrubber = getElement<HTMLInputElement>('#frame-scrubber');
const directionButtons = [...directionPad.querySelectorAll<HTMLButtonElement>('button[data-direction]')];

const CROP_DRAG_THRESHOLD = 4;

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
let activeDirection: AnimationDirection = DEFAULT_ANIMATION_DIRECTION;
let selectedFrameIndex = 0;
let selectedAtlasImagePath = '';
let atlasPointer: { pointerId: number; start: { x: number; y: number }; clientX: number; clientY: number; moved: boolean } | null = null;
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
let timelineDragFrom: number | null = null;
let copyTargetDirection: AnimationDirection | null = null;
let playbackStartedAt = 0;
let pausedElapsedSeconds = 0;
let playing = false;
let animationFrameRequest = 0;
let latestLocalEditId = 0;
let acknowledgedEditId = 0;
let externalEditGeneration = 0;
let noticeTimer = 0;

function getElement<T extends HTMLElement>(selector: string): T {
  const element = window.document.querySelector<T>(selector);
  if (!element) throw new Error('Missing sprite animation editor element: ' + selector);
  return element;
}

function replaceOptions(select: HTMLSelectElement, values: readonly string[], selected: string): void {
  select.replaceChildren(...values.map((value) => new Option(value, value, false, value === selected)));
}

function showNotice(text: string): void {
  noticeLabel.textContent = text;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { noticeLabel.textContent = ''; }, 6000);
}

function activeClip(): SpriteAnimationClipDefinition | null {
  return animationDocument?.clips.find((clip) => clip.name === selectedClipName) ?? null;
}

function isSheetClip(clip: SpriteAnimationClipDefinition): boolean {
  return clip.frames === undefined && clip.directions === undefined;
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
  transformOverride: SpriteAnimationFrameTransform | null = null,
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
    const transform = transformOverride ?? getSpriteAnimationFrameTransform(frame);
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
  const context = setCanvasSize(canvas, 78, 64);
  if (!context) return;
  context.clearRect(0, 0, 78, 64);
  const stageWidth = currentSelection?.canvasWidth ?? frame.width;
  const stageHeight = currentSelection?.canvasHeight ?? frame.height;
  drawFrameInBox(context, frame, imageForPath(frame.image), stageWidth, stageHeight, 0, 0, 78, 64);
}

function refreshFrameThumbnails(): void {
  for (const canvas of frameList.querySelectorAll<HTMLCanvasElement>('.frame-thumb')) {
    const frame = currentFrames[Number(canvas.dataset.frameIndex)];
    if (frame) drawFrameThumbnail(canvas, frame);
  }
}

function drawPreview(): void {
  const bounds = previewCanvas.getBoundingClientRect();
  const width = bounds.width || 256;
  const height = bounds.height || 256;
  const context = setCanvasSize(previewCanvas, width, height);
  if (!context) return;
  context.clearRect(0, 0, width, height);
  const frame = currentFrames[currentFrameIndex];
  if (!frame || !currentSelection) return;
  const draft = currentFrameIndex === selectedFrameIndex ? previewTransformDraft : null;
  drawFrameInBox(context, frame, imageForPath(frame.image), currentSelection.canvasWidth, currentSelection.canvasHeight,
    0, 0, width, height, draft);
}

function gridSize(): number {
  const value = Number(gridSizeInput.value);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1024) : 16;
}

function assetSize(path: string): { width: number; height: number } | null {
  return frameImageAssets.get(path)?.size ?? (path === sourceImagePath ? imageSize : null);
}

function selectionKey(clip: SpriteAnimationClipDefinition): string {
  if (clip.directions !== undefined) return activeDirection;
  if (clip.frames !== undefined) return 'Frames';
  return selectedDirection;
}

function sheetFramesForSelection(selection: AnimationPreviewSelection | null): SpriteAnimationFrameDefinition[] {
  if (!sourceImagePath || !selection) return [];
  return selection.frames.map((frame, index) => ({
    image: sourceImagePath!,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    name: 'frame-' + String(index + 1),
  }));
}

function visibleFramesForClip(clip: SpriteAnimationClipDefinition): SpriteAnimationFrameDefinition[] {
  if (clip.directions !== undefined) return clip.directions[activeDirection];
  if (clip.frames !== undefined) return clip.frames;
  return sheetFramesForSelection(currentSelection);
}

function customFramesForClip(clip: SpriteAnimationClipDefinition): SpriteAnimationFrameDefinition[] {
  return visibleFramesForClip(clip).map((frame) => ({ ...frame }));
}

function frameCaption(frame: SpriteAnimationFrameDefinition): string {
  if (frame.duration !== undefined) return frame.duration + 's';
  return frame.name ?? basename(frame.image);
}

function renderClipList(): void {
  const doc = animationDocument;
  clipList.replaceChildren(...(doc?.clips ?? []).map((clip) => {
    const item = window.document.createElement('li');
    const button = window.document.createElement('button');
    button.type = 'button';
    button.className = 'list-item' + (clip.name === selectedClipName ? ' active' : '');
    button.setAttribute('aria-pressed', String(clip.name === selectedClipName));
    const name = window.document.createElement('span');
    name.className = 'item-name';
    name.textContent = clip.name;
    const meta = window.document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = clip.directions !== undefined
      ? '4 dirs'
      : clip.frames !== undefined
        ? clip.frames.length + (clip.frames.length === 1 ? ' frame' : ' frames')
        : 'sheet rows';
    button.append(name, meta);
    button.addEventListener('click', () => selectClip(clip.name));
    item.append(button);
    return item;
  }));
}

function selectClip(name: string): void {
  stopPlayback();
  selectedClipName = name;
  selectedDirection = '';
  copyTargetDirection = null;
  selectedFrameIndex = 0;
  currentFrameIndex = 0;
  pausedElapsedSeconds = 0;
  render();
}

function renderDirectionControls(clip: SpriteAnimationClipDefinition | null): void {
  const directional = clip?.directions !== undefined;
  directionPad.hidden = !directional;
  directionTools.hidden = !directional;
  timelineDirection.textContent = directional
    ? ANIMATION_DIRECTION_ARROWS[activeDirection] + ' ' + ANIMATION_DIRECTION_LABELS[activeDirection]
    : '';
  if (!clip || clip.directions === undefined) return;
  const directions = clip.directions;
  directionLabel.textContent = ANIMATION_DIRECTION_ARROWS[activeDirection];
  for (const button of directionButtons) {
    const direction = button.dataset.direction;
    if (!isAnimationDirection(direction)) continue;
    const count = directions[direction].length;
    button.classList.toggle('active', direction === activeDirection);
    button.setAttribute('aria-pressed', String(direction === activeDirection));
    button.title = ANIMATION_DIRECTION_LABELS[direction] + ' · dir ' + ANIMATION_DIRECTIONS.indexOf(direction) +
      ' · ' + count + (count === 1 ? ' frame' : ' frames');
  }
  const targets = ANIMATION_DIRECTIONS.filter((direction) => direction !== activeDirection);
  copyDirectionTarget.replaceChildren(...targets.map((direction) =>
    new Option(ANIMATION_DIRECTION_ARROWS[direction] + ' ' + ANIMATION_DIRECTION_LABELS[direction], direction)));
  if (copyTargetDirection === null || copyTargetDirection === activeDirection) {
    copyTargetDirection = oppositeHorizontalDirection(activeDirection) ?? targets[0]!;
    copyDirectionMirror.checked = oppositeHorizontalDirection(activeDirection) === copyTargetDirection;
  }
  copyDirectionTarget.value = copyTargetDirection;
  copyDirectionButton.disabled = !canEdit();
  copyDirectionTarget.disabled = !canEdit();
  copyDirectionMirror.disabled = !canEdit();
}

function setActiveDirection(direction: AnimationDirection): void {
  const clip = activeClip();
  if (!clip || clip.directions === undefined || direction === activeDirection) return;
  activeDirection = direction;
  copyTargetDirection = null;
  const frames = clip.directions[direction];
  selectedFrameIndex = Math.min(selectedFrameIndex, Math.max(0, frames.length - 1));
  currentFrameIndex = Math.min(currentFrameIndex, Math.max(0, frames.length - 1));
  if (!playing) pausedElapsedSeconds = frameStartTime(currentFrameIndex);
  render();
}

function renderFrameList(): void {
  frameList.replaceChildren();
  currentFrames.forEach((frame, index) => {
    const item = window.document.createElement('li');
    item.className = 'timeline-item';
    item.draggable = canEdit();
    item.dataset.frameIndex = String(index);

    const card = window.document.createElement('button');
    card.type = 'button';
    card.className = 'frame-card' + (index === selectedFrameIndex ? ' active' : '');
    card.setAttribute('aria-pressed', String(index === selectedFrameIndex));
    card.title = (frame.name ?? basename(frame.image)) + ' · ' + frame.width + '×' + frame.height + ' at ' + frame.x + ',' + frame.y;
    const thumbnail = window.document.createElement('canvas');
    thumbnail.className = 'frame-thumb';
    thumbnail.dataset.frameIndex = String(index);
    const caption = window.document.createElement('span');
    caption.className = 'frame-caption';
    const number = window.document.createElement('strong');
    number.textContent = String(index + 1);
    const detail = window.document.createElement('span');
    detail.textContent = frameCaption(frame);
    caption.append(number, detail);
    card.append(thumbnail, caption);
    drawFrameThumbnail(thumbnail, frame);
    card.addEventListener('click', () => selectFrame(index));
    item.append(card);
    frameList.append(item);
  });
  renderFrameInspector();
}

function renderFrameInspector(): void {
  const frame = currentFrames[selectedFrameIndex];
  const hasFrame = frame !== undefined;
  const enabled = canEdit() && hasFrame;
  frameEmpty.hidden = hasFrame;
  frameFields.hidden = !hasFrame;
  frameIndexLabel.textContent = hasFrame ? (selectedFrameIndex + 1) + ' / ' + currentFrames.length : '';
  for (const input of [frameNameInput, frameDurationInput, frameOffsetXInput, frameOffsetYInput, frameStretchXInput,
    frameStretchYInput, frameZoomInput, frameZoomRangeInput, framePivotXInput, framePivotYInput, frameRotationInput,
    frameRotationRangeInput]) input.disabled = !enabled;
  resetFrameTransformButton.disabled = !enabled;
  duplicateFrameButton.disabled = !enabled;
  moveFrameUpButton.disabled = !enabled || selectedFrameIndex === 0;
  moveFrameDownButton.disabled = !enabled || selectedFrameIndex >= currentFrames.length - 1;
  deleteFrameButton.disabled = !enabled || !canRemoveFrame();
  frameNameInput.value = frame?.name ?? '';
  frameDurationInput.value = frame?.duration === undefined ? '' : String(frame.duration);
  updateTransformControls(frame ? getSpriteAnimationFrameTransform(frame) : DEFAULT_SPRITE_FRAME_TRANSFORM);
}

function canRemoveFrame(): boolean {
  const clip = activeClip();
  return clip?.directions === undefined || currentFrames.length > 1;
}

function selectFrame(index: number): void {
  stopPlayback();
  selectedFrameIndex = index;
  currentFrameIndex = index;
  pausedElapsedSeconds = frameStartTime(index);
  const frame = currentFrames[index];
  if (frame) selectedAtlasImagePath = frame.image;
  render();
}

function renderAtlasImageOptions(): void {
  const paths = [...frameImageAssets.keys()];
  if (!paths.includes(selectedAtlasImagePath)) selectedAtlasImagePath = currentFrames[selectedFrameIndex]?.image ?? sourceImagePath ?? paths[0] ?? '';
  atlasImageSelect.replaceChildren(...paths.map((path) =>
    new Option(basename(path), path, false, path === selectedAtlasImagePath)));
  atlasImageSelect.disabled = paths.length === 0;
  const replaceOption = cropActionSelect.querySelector<HTMLOptionElement>('option[value="replace"]');
  if (replaceOption) replaceOption.disabled = currentFrames[selectedFrameIndex] === undefined;
  if (cropActionSelect.value === 'replace' && replaceOption?.disabled) cropActionSelect.value = 'add';
  cropActionSelect.disabled = !canEdit() || paths.length === 0;
}

function drawAtlas(): void {
  const path = selectedAtlasImagePath;
  const size = path ? assetSize(path) : null;
  if (!path || !size) {
    atlasCanvas.width = 1;
    atlasCanvas.height = 1;
    atlasDimensions.textContent = 'No image available';
    cropHint.textContent = '';
    return;
  }

  const scale = Math.min(1, 2048 / Math.max(size.width, size.height), Math.sqrt(4_000_000 / (size.width * size.height)));
  const width = Math.max(1, Math.floor(size.width * scale));
  const height = Math.max(1, Math.floor(size.height * scale));
  atlasCanvas.width = width;
  atlasCanvas.height = height;
  const displayScale = Math.max(1, Math.min(4, Math.floor(640 / Math.max(width, height)) || 1));
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
    context.strokeStyle = 'rgba(255, 255, 255, 0.22)';
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
    const selected = index === selectedFrameIndex;
    context.fillStyle = selected ? 'rgba(255, 200, 60, 0.18)' : 'rgba(50, 150, 255, 0.12)';
    context.fillRect(frame.x * scale, frame.y * scale, frame.width * scale, frame.height * scale);
    context.strokeStyle = selected ? 'rgba(255, 212, 74, 1)' : 'rgba(88, 180, 255, 0.9)';
    context.lineWidth = selected ? 2 : 1;
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
  cropHint.textContent = !canEdit()
    ? 'Read only.'
    : 'Click a frame to select it. Drag to crop' + (snapGridInput.checked ? ' (snaps to ' + gridSize() + ' px).' : '.');
}

function stopPlayback(): void {
  playing = false;
  if (animationFrameRequest) window.cancelAnimationFrame(animationFrameRequest);
  animationFrameRequest = 0;
  playButton.textContent = '▶ Play';
  for (const card of frameList.querySelectorAll('.frame-card.playing')) card.classList.remove('playing');
}

function frameDuration(index: number): number {
  return currentFrames[index]?.duration ?? (1 / (currentSelection?.fps ?? 12));
}

function elapsedFrameIndex(elapsedSeconds: number): number {
  if (!currentSelection) return 0;
  const count = currentFrames.length;
  if (count === 0) return 0;
  const order: number[] = [];
  for (let index = 0; index < count; index++) order.push(index);
  if (currentSelection.loop === 'ping-pong' && count > 2) {
    for (let index = count - 2; index > 0; index--) order.push(index);
  }
  const total = order.reduce((sum, index) => sum + frameDuration(index), 0);
  let time = Math.max(0, elapsedSeconds);
  if (currentSelection.loop === 'loop' || currentSelection.loop === 'ping-pong') time = total > 0 ? time % total : 0;
  else if (currentSelection.loop === 'once' && time >= total) return count - 1;

  for (const index of order) {
    const duration = frameDuration(index);
    if (time < duration) return index;
    time -= duration;
  }
  return order[order.length - 1] ?? 0;
}

function frameStartTime(index: number): number {
  let elapsed = 0;
  for (let current = 0; current < Math.min(index, currentFrames.length); current++) elapsed += frameDuration(current);
  return elapsed;
}

function sequenceDuration(): number {
  if (!currentSelection) return 0;
  const count = currentFrames.length;
  let total = 0;
  for (let index = 0; index < count; index++) total += frameDuration(index);
  if (currentSelection.loop === 'ping-pong' && count > 2) {
    for (let index = count - 2; index > 0; index--) total += frameDuration(index);
  }
  return total;
}

function paintFrame(index: number): void {
  currentFrameIndex = Math.max(0, Math.min(index, Math.max(0, currentFrames.length - 1)));
  frameScrubber.value = String(currentFrameIndex);
  const frame = currentFrames[currentFrameIndex];
  frameLabel.textContent = currentSelection && frame
    ? 'Frame ' + (currentFrameIndex + 1) + ' of ' + currentFrames.length + ' · ' + currentSelection.fps + ' FPS · ' +
      currentSelection.loop + (frame.duration ? ' · ' + frame.duration + 's' : '')
    : '—';
  for (const card of frameList.querySelectorAll<HTMLButtonElement>('.frame-card')) {
    const item = card.parentElement;
    card.classList.toggle('playing', playing && item?.dataset.frameIndex === String(currentFrameIndex));
  }
  drawPreview();
  drawAtlas();
}

function playbackTick(now: number): void {
  if (!playing || !currentSelection) return;
  const elapsed = Math.max(0, (now - playbackStartedAt) / 1000);
  paintFrame(elapsedFrameIndex(elapsed));
  if (currentSelection.loop === 'once' && elapsed >= sequenceDuration()) {
    pausedElapsedSeconds = frameStartTime(currentFrames.length - 1);
    stopPlayback();
    return;
  }
  animationFrameRequest = window.requestAnimationFrame(playbackTick);
}

function togglePlayback(): void {
  if (!currentSelection || currentFrames.length === 0) return;
  if (playing) {
    pausedElapsedSeconds = Math.max(0, (performance.now() - playbackStartedAt) / 1000);
    stopPlayback();
    selectedFrameIndex = currentFrameIndex;
    render();
    return;
  }
  if (currentSelection.loop === 'once' && currentFrameIndex === currentFrames.length - 1) pausedElapsedSeconds = 0;
  playbackStartedAt = performance.now() - pausedElapsedSeconds * 1000;
  playing = true;
  playButton.textContent = '❚❚ Pause';
  animationFrameRequest = window.requestAnimationFrame(playbackTick);
}

function stepFrame(delta: number): void {
  if (currentFrames.length === 0) return;
  const count = currentFrames.length;
  selectFrame((currentFrameIndex + delta + count) % count);
}

function updatePlaybackControls(): void {
  const hasFrames = currentSelection !== null && currentFrames.length > 0;
  playButton.disabled = !hasFrames || currentFrames.length <= 1;
  resetButton.disabled = !hasFrames;
  prevFrameButton.disabled = !hasFrames || currentFrames.length <= 1;
  nextFrameButton.disabled = !hasFrames || currentFrames.length <= 1;
  frameScrubber.disabled = !hasFrames || currentFrames.length <= 1;
  frameScrubber.max = String(Math.max(0, currentFrames.length - 1));
}

function postFrameList(nextFrames: SpriteAnimationFrameDefinition[], nextSelectedIndex: number): void {
  const clip = activeClip();
  if (!clip || !animationDocument) return;
  selectedFrameIndex = Math.max(0, Math.min(nextSelectedIndex, Math.max(0, nextFrames.length - 1)));
  if (clip.directions === undefined) selectedDirection = 'Frames';
  currentFrameIndex = selectedFrameIndex;
  pausedElapsedSeconds = 0;
  const nextClip = withClipFrameList(clip, activeDirection, nextFrames);
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

function moveFrameTo(from: number, insertBefore: number): void {
  const clip = activeClip();
  if (!clip || !canEdit()) return;
  const frames = customFramesForClip(clip);
  if (from < 0 || from >= frames.length) return;
  const [frame] = frames.splice(from, 1);
  if (!frame) return;
  const target = Math.max(0, Math.min(frames.length, insertBefore > from ? insertBefore - 1 : insertBefore));
  if (target === from) return;
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

function removeSelectedFrame(): void {
  const clip = activeClip();
  if (!clip || !canEdit() || !canRemoveFrame()) return;
  const frames = customFramesForClip(clip);
  if (selectedFrameIndex < 0 || selectedFrameIndex >= frames.length) return;
  frames.splice(selectedFrameIndex, 1);
  postFrameList(frames, Math.min(selectedFrameIndex, frames.length - 1));
}

function previewEmptyText(clip: SpriteAnimationClipDefinition | null): string {
  if (!animationDocument || !metadata) return diagnostics ? 'Fix the problems listed below to edit this animation.' : 'Loading…';
  if (imageFailed) return 'The sprite sheet image could not be decoded.';
  if (!clip) return animationDocument.clips.length === 0 ? 'Create a clip with “+ New clip” to get started.' : 'Select a clip.';
  if (currentFrames.length === 0) {
    return isSheetClip(clip) ? 'Choose a sprite sheet row for this clip.' : 'No frames yet. Use “+ Add images” or drag a crop on the sprite sheet.';
  }
  return '';
}

function render(): void {
  const doc = animationDocument;
  const sheet = metadata;
  titleLabel.textContent = titleLabel.title = doc ? doc.source.split('/').pop() ?? 'Sprite Animation' : 'Sprite Animation';
  sourceLabel.textContent = doc ? 'Sheet metadata: ' + doc.source : '';
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
    currentSelection = null;
    currentFrames = [];
    clipList.replaceChildren();
    clipInspector.hidden = true;
    emptyNote.hidden = false;
    addClipButton.disabled = true;
    addFramesButton.disabled = true;
    stageTitle.textContent = 'No clip selected';
    renderDirectionControls(null);
    renderFrameList();
    renderAtlasImageOptions();
    updatePlaybackControls();
    previewEmpty.textContent = previewEmptyText(null);
    previewEmpty.hidden = false;
    drawPreview();
    atlasDimensions.textContent = '';
    atlasCanvas.width = 1;
    atlasCanvas.height = 1;
    return;
  }

  if (imageUri !== loadingImageUri) setImage(imageUri);
  const clipNames = doc.clips.map((clip) => clip.name);
  if (!clipNames.includes(selectedClipName)) selectedClipName = clipNames[0] ?? '';
  renderClipList();
  emptyNote.hidden = clipNames.length > 0;
  emptyNote.textContent = uniqueAnimationGroups().length === 0
    ? 'This sheet metadata has no animation rows, so new clips cannot be created here.'
    : 'Create a clip with “+ New clip” to start previewing this sprite sheet.';
  clipInspector.hidden = clipNames.length === 0;
  addClipButton.disabled = !canEdit() || uniqueAnimationGroups().length === 0;
  deleteClipButton.disabled = !canEdit() || clipNames.length === 0;

  const clip = activeClip();
  addFramesButton.disabled = !canEdit() || !clip;
  if (!clip) {
    currentSelection = null;
    currentFrames = [];
    stageTitle.textContent = 'No clip selected';
    renderDirectionControls(null);
    renderFrameList();
    updatePlaybackControls();
    previewEmpty.textContent = previewEmptyText(null);
    previewEmpty.hidden = false;
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
  for (const input of [clipNameInput, fpsInput, loopSelect, canvasWidthInput, canvasHeightInput, directionalInput]) input.disabled = !canEdit();
  directionalInput.checked = clip.directions !== undefined;

  sheetSource.hidden = !isSheetClip(clip);
  replaceOptions(groupSelect, uniqueAnimationGroups(), clip.animationGroupId);
  groupSelect.disabled = !canEdit() || !isSheetClip(clip);
  const options = getAnimationPreviewClipOptions(doc, sheet).find((option) => option.name === clip.name);
  const rows = isSheetClip(clip) ? options?.directions ?? [] : [];
  if (isSheetClip(clip) && !rows.includes(selectedDirection)) selectedDirection = rows[0] ?? '';
  replaceOptions(directionSelect, rows, selectedDirection);
  directionSelect.disabled = rows.length === 0;

  const key = selectionKey(clip);
  currentSelection = key ? selectFramesForGroupAndDirection(doc, sheet, clip.name, key) : null;
  currentFrames = visibleFramesForClip(clip);
  if (selectedFrameIndex >= currentFrames.length) selectedFrameIndex = Math.max(0, currentFrames.length - 1);
  if (!currentSelection) {
    stopPlayback();
    currentFrameIndex = 0;
  } else if (currentFrameIndex >= currentFrames.length) {
    currentFrameIndex = 0;
  }

  stageTitle.textContent = clip.name + (clip.directions !== undefined
    ? ' · ' + ANIMATION_DIRECTION_LABELS[activeDirection] + ' (dir ' + ANIMATION_DIRECTIONS.indexOf(activeDirection) + ')'
    : isSheetClip(clip) && selectedDirection ? ' · ' + selectedDirection : '');
  renderDirectionControls(clip);
  renderFrameList();
  if (currentFrames[selectedFrameIndex]) selectedAtlasImagePath = currentFrames[selectedFrameIndex]!.image;
  renderAtlasImageOptions();
  updatePlaybackControls();
  const emptyText = previewEmptyText(clip);
  previewEmpty.textContent = emptyText;
  previewEmpty.hidden = emptyText.length === 0;
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
  window.setTimeout(() => clipNameInput.select(), 0);
}

function sheetFramesForDirection(clip: SpriteAnimationClipDefinition, direction: AnimationDirection): SpriteAnimationFrameDefinition[] | undefined {
  if (!animationDocument || !metadata || !isSheetClip(clip)) return undefined;
  const row = findMetadataDirectionRow(metadata, clip.animationGroupId, direction);
  if (!row) return undefined;
  return sheetFramesForSelection(selectFramesForGroupAndDirection(animationDocument, metadata, clip.name, row));
}

function setDirectional(enabled: boolean): void {
  const clip = activeClip();
  if (!clip || !canEdit()) return;
  if (enabled) {
    const current = customFramesForClip(clip);
    const seeds = new Map(ANIMATION_DIRECTIONS.map((direction) => [direction, sheetFramesForDirection(clip, direction)]));
    if (current.length === 0 && [...seeds.values()].every((frames) => !frames || frames.length === 0)) {
      directionalInput.checked = false;
      showNotice('Add at least one frame before splitting the clip into directions.');
      return;
    }
    const matched = ANIMATION_DIRECTIONS.filter((direction) => (seeds.get(direction)?.length ?? 0) > 0);
    const nextClip = setClipDirectional({ ...clip, frames: current }, true, activeDirection, (direction) => seeds.get(direction));
    const filled = matched.map((direction) => ANIMATION_DIRECTION_LABELS[direction]).join(', ');
    showNotice(matched.length === ANIMATION_DIRECTIONS.length
      ? 'Filled every direction from matching sprite sheet rows.'
      : matched.length > 0
        ? 'Filled ' + filled + ' from matching sprite sheet rows; the others start as a copy of the current frames.'
        : 'All four directions start as a copy of the current frames.');
    updateClip(() => nextClip);
    return;
  }
  const kept = activeDirection;
  showNotice('Kept the ' + ANIMATION_DIRECTION_LABELS[kept] + ' frames. Undo (Ctrl+Z) restores the other directions.');
  updateClip((current) => setClipDirectional(current, false, kept));
}

function mirrorFrame(frame: SpriteAnimationFrameDefinition): SpriteAnimationFrameDefinition {
  const transform = getSpriteAnimationFrameTransform(frame);
  return {
    ...frame,
    transform: {
      ...transform,
      offset: { x: transform.offset.x === 0 ? 0 : -transform.offset.x, y: transform.offset.y },
      stretch: { x: -transform.stretch.x, y: transform.stretch.y },
      rotation: transform.rotation === 0 ? 0 : -transform.rotation,
    },
  };
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
      selectFrame(index);
      return true;
    }
  }
  return false;
}

function finishCrop(start: { x: number; y: number }, point: { x: number; y: number }): void {
  const path = selectedAtlasImagePath;
  const size = assetSize(path);
  const clip = activeClip();
  if (!size || !clip) {
    drawAtlas();
    return;
  }
  const rect = cropSpriteFrameFromDrag(start, point, size.width, size.height, gridSize(), snapGridInput.checked);
  if (!rect) {
    drawAtlas();
    return;
  }
  const selected = currentFrames[selectedFrameIndex];
  if (cropActionSelect.value === 'replace' && selected) {
    const frames = customFramesForClip(clip);
    frames[selectedFrameIndex] = { ...selected, image: path, ...rect };
    postFrameList(frames, selectedFrameIndex);
    return;
  }
  appendFrameDefinitions([{ image: path, ...rect, name: basename(path) + '-' + String(currentFrames.length + 1) }]);
}

function handleFrameImagesSelected(message: FrameImagesSelectedMessage): void {
  if (!Array.isArray(message.images) || message.images.length === 0) {
    showNotice('No images were selected.');
    return;
  }
  if (!canEdit() || !activeClip()) {
    diagnosticsPanel.textContent = 'Create or select an editable animation clip before adding images.';
    diagnosticsPanel.hidden = false;
    return;
  }
  for (const asset of message.images) frameImageAssets.set(asset.path, asset);
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
  showNotice('Added ' + frames.length + (frames.length === 1 ? ' frame.' : ' frames.'));
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

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'range';
}

function clearDropMarkers(): void {
  for (const item of frameList.querySelectorAll('.drop-before, .drop-after')) item.classList.remove('drop-before', 'drop-after');
}

addClipButton.addEventListener('click', commitNewClip);
deleteClipButton.addEventListener('click', () => {
  if (!animationDocument || !canEdit()) return;
  const removed = selectedClipName;
  const remaining = animationDocument.clips.filter((clip) => clip.name !== removed);
  selectedClipName = remaining[0]?.name ?? '';
  selectedDirection = '';
  selectedFrameIndex = 0;
  showNotice('Deleted clip “' + removed + '”. Undo with Ctrl+Z.');
  postDocument({ ...animationDocument, clips: remaining });
});
clipNameInput.addEventListener('change', () => {
  const name = clipNameInput.value.trim();
  if (!name || animationDocument?.clips.some((clip) => clip.name === name && clip.name !== selectedClipName)) {
    showNotice(name ? 'Another clip is already named “' + name + '”.' : 'Clip names cannot be empty.');
    render();
    return;
  }
  updateClip((clip) => ({ ...clip, name }));
});
groupSelect.addEventListener('change', () => {
  selectedDirection = '';
  updateClip((clip) => ({ ...clip, animationGroupId: groupSelect.value }));
});
fpsInput.addEventListener('change', () => {
  const fps = Number(fpsInput.value);
  if (!Number.isFinite(fps) || fps <= 0) { render(); return; }
  updateClip((clip) => ({ ...clip, fps }));
});
loopSelect.addEventListener('change', () => updateClip((clip) => ({ ...clip, loop: loopSelect.value as SpriteAnimationLoop })));
const applyCanvasSize = (): void => {
  const width = Number(canvasWidthInput.value);
  const height = Number(canvasHeightInput.value);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) { render(); return; }
  updateClip((clip) => ({ ...clip, canvasSize: { width, height } }));
};
canvasWidthInput.addEventListener('change', applyCanvasSize);
canvasHeightInput.addEventListener('change', applyCanvasSize);
directionalInput.addEventListener('change', () => setDirectional(directionalInput.checked));
directionSelect.addEventListener('change', () => {
  stopPlayback();
  selectedDirection = directionSelect.value;
  selectedFrameIndex = 0;
  currentFrameIndex = 0;
  pausedElapsedSeconds = 0;
  render();
});
for (const button of directionButtons) {
  button.addEventListener('click', () => {
    const direction = button.dataset.direction;
    if (isAnimationDirection(direction)) setActiveDirection(direction);
  });
}
copyDirectionTarget.addEventListener('change', () => {
  if (!isAnimationDirection(copyDirectionTarget.value)) return;
  copyTargetDirection = copyDirectionTarget.value;
  copyDirectionMirror.checked = oppositeHorizontalDirection(activeDirection) === copyTargetDirection;
});
copyDirectionButton.addEventListener('click', () => {
  const target = copyDirectionTarget.value;
  if (!isAnimationDirection(target)) return;
  const mirror = copyDirectionMirror.checked;
  const from = activeDirection;
  showNotice((mirror ? 'Mirrored ' : 'Copied ') + ANIMATION_DIRECTION_LABELS[from] + ' into ' + ANIMATION_DIRECTION_LABELS[target] + '.');
  updateClip((clip) => copyClipDirection(clip, from, target, mirror ? mirrorFrame : undefined));
});

addFramesButton.addEventListener('click', () => vscode.postMessage({ type: 'selectFrameImages' }));
frameNameInput.addEventListener('change', () => {
  const clip = activeClip();
  const frame = currentFrames[selectedFrameIndex];
  if (!clip || !frame) return;
  const frames = customFramesForClip(clip);
  const name = frameNameInput.value.trim();
  const next = { ...frame };
  if (name) next.name = name;
  else delete next.name;
  frames[selectedFrameIndex] = next;
  postFrameList(frames, selectedFrameIndex);
});
frameDurationInput.addEventListener('change', () => {
  const clip = activeClip();
  const frame = currentFrames[selectedFrameIndex];
  if (!clip || !frame) return;
  const frames = customFramesForClip(clip);
  const duration = frameDurationInput.value.trim() === '' ? undefined : Number(frameDurationInput.value);
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) { renderFrameInspector(); return; }
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
  previewTransformDraft = { ...getSpriteAnimationFrameTransform(frame), zoom: Number(frameZoomRangeInput.value) };
  drawPreview();
});
frameZoomRangeInput.addEventListener('change', applyFrameTransformInputs);
frameRotationRangeInput.addEventListener('input', () => {
  frameRotationInput.value = frameRotationRangeInput.value;
  const frame = currentFrames[selectedFrameIndex];
  if (!frame) return;
  previewTransformDraft = { ...getSpriteAnimationFrameTransform(frame), rotation: Number(frameRotationRangeInput.value) };
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
moveFrameUpButton.addEventListener('click', () => moveFrameTo(selectedFrameIndex, selectedFrameIndex - 1));
moveFrameDownButton.addEventListener('click', () => moveFrameTo(selectedFrameIndex, selectedFrameIndex + 2));
duplicateFrameButton.addEventListener('click', () => {
  const clip = activeClip();
  const frame = currentFrames[selectedFrameIndex];
  if (!clip || !frame || !canEdit()) return;
  const frames = customFramesForClip(clip);
  frames.splice(selectedFrameIndex + 1, 0, { ...frame });
  postFrameList(frames, selectedFrameIndex + 1);
});
deleteFrameButton.addEventListener('click', removeSelectedFrame);

frameList.addEventListener('dragstart', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLLIElement>('.timeline-item');
  if (!item || !canEdit()) return;
  timelineDragFrom = Number(item.dataset.frameIndex);
  event.dataTransfer?.setData('text/plain', String(timelineDragFrom));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
});
frameList.addEventListener('dragover', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLLIElement>('.timeline-item');
  if (!item || timelineDragFrom === null) return;
  event.preventDefault();
  clearDropMarkers();
  const rect = item.getBoundingClientRect();
  item.classList.add(event.clientX < rect.left + rect.width / 2 ? 'drop-before' : 'drop-after');
});
frameList.addEventListener('dragleave', (event) => {
  if (!frameList.contains(event.relatedTarget as Node | null)) clearDropMarkers();
});
frameList.addEventListener('drop', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLLIElement>('.timeline-item');
  const from = timelineDragFrom;
  timelineDragFrom = null;
  if (!item || from === null) { clearDropMarkers(); return; }
  event.preventDefault();
  const index = Number(item.dataset.frameIndex);
  const after = item.classList.contains('drop-after');
  clearDropMarkers();
  moveFrameTo(from, after ? index + 1 : index);
});
frameList.addEventListener('dragend', () => { timelineDragFrom = null; clearDropMarkers(); });

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
atlasCanvas.addEventListener('pointerdown', (event) => {
  const point = pointFromPointer(event);
  if (!point) return;
  event.preventDefault();
  atlasPointer = { pointerId: event.pointerId, start: point, clientX: event.clientX, clientY: event.clientY, moved: false };
  atlasCanvas.setPointerCapture(event.pointerId);
});
atlasCanvas.addEventListener('pointermove', (event) => {
  const pointer = atlasPointer;
  if (!pointer || pointer.pointerId !== event.pointerId || !canEdit() || !activeClip()) return;
  if (!pointer.moved && Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) < CROP_DRAG_THRESHOLD) return;
  const point = pointFromPointer(event);
  if (!point) return;
  pointer.moved = true;
  cropStart = pointer.start;
  cropEnd = point;
  drawAtlas();
});
atlasCanvas.addEventListener('pointerup', (event) => {
  const pointer = atlasPointer;
  atlasPointer = null;
  if (!pointer || pointer.pointerId !== event.pointerId) return;
  const point = pointFromPointer(event);
  cropStart = null;
  cropEnd = null;
  if (!point) { drawAtlas(); return; }
  if (pointer.moved) finishCrop(pointer.start, point);
  else if (!selectFrameAtPoint(point)) drawAtlas();
});
atlasCanvas.addEventListener('pointercancel', () => {
  atlasPointer = null;
  cropStart = null;
  cropEnd = null;
  drawAtlas();
});
previewCanvas.addEventListener('pointerdown', (event) => {
  const frame = currentFrames[currentFrameIndex];
  const scale = previewStageScale();
  if (!frame || !scale || !canEdit()) return;
  event.preventDefault();
  stopPlayback();
  if (selectedFrameIndex !== currentFrameIndex) {
    selectedFrameIndex = currentFrameIndex;
    renderFrameList();
  }
  const transform = getSpriteAnimationFrameTransform(frame);
  previewTransformDraft = transform;
  previewDragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: transform.offset.x, offsetY: transform.offset.y, scale };
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
  if (transform && (transform.offset.x !== drag.offsetX || transform.offset.y !== drag.offsetY)) writeSelectedFrameTransform(transform);
  else drawPreview();
});
previewCanvas.addEventListener('pointercancel', () => {
  previewDragStart = null;
  previewTransformDraft = null;
  previewCanvas.classList.remove('preview-canvas-dragging');
  render();
});

playButton.addEventListener('click', togglePlayback);
resetButton.addEventListener('click', () => {
  stopPlayback();
  pausedElapsedSeconds = 0;
  selectFrame(0);
});
prevFrameButton.addEventListener('click', () => stepFrame(-1));
nextFrameButton.addEventListener('click', () => stepFrame(1));
frameScrubber.addEventListener('input', () => selectFrame(Number(frameScrubber.value) || 0));

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target)) return;
  const key = event.key.toLowerCase();
  const directionKeys: Record<string, AnimationDirection> = { w: 'up', a: 'left', s: 'down', d: 'right' };
  if (key === ' ') togglePlayback();
  else if (key === 'arrowleft') stepFrame(-1);
  else if (key === 'arrowright') stepFrame(1);
  else if (key === 'home') selectFrame(0);
  else if (key === 'end') selectFrame(Math.max(0, currentFrames.length - 1));
  else if (key === 'delete') removeSelectedFrame();
  else if (Object.hasOwn(directionKeys, key)) setActiveDirection(directionKeys[key]!);
  else return;
  event.preventDefault();
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
  render();
});

window.addEventListener('resize', () => {
  drawPreview();
  drawAtlas();
});

window.addEventListener('beforeunload', stopPlayback);
render();
vscode.postMessage({ type: 'ready' });
