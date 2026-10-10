import {
  addSpriteAnimationTemplateClip,
  addSpriteAnimationTemplateFrame,
  addSpriteAnimationTemplateLayer,
  addSpriteAnimationTemplateParameter,
  copySpriteAnimationTemplateDirection,
  moveSpriteAnimationTemplateFrame,
  moveSpriteAnimationTemplateLayer,
  moveSpriteAnimationTemplateParameter,
  removeSpriteAnimationTemplateClip,
  removeSpriteAnimationTemplateFrame,
  removeSpriteAnimationTemplateLayer,
  removeSpriteAnimationTemplateParameter,
  setSpriteAnimationTemplateClipDirectional,
  updateSpriteAnimationTemplateClip,
  updateSpriteAnimationTemplateFrame,
  updateSpriteAnimationTemplateLayer,
  updateSpriteAnimationTemplateParameter,
} from '../animations/spriteAnimationTemplateEdits';
import { cropSpriteFrameFromDrag } from '../animations/animationFrames';
import { spriteAnimationTemplateSource, validateSpriteAnimationTemplate } from '../animations/spriteAnimationTemplateSchema';
import { drawSpriteAnimationTemplateFrame, getSpriteAnimationTemplateFrameIndex } from '../animations/spriteAnimationTemplatePreview';
import {
  ANIMATION_DIRECTIONS,
  ANIMATION_DIRECTION_ARROWS,
  ANIMATION_DIRECTION_LABELS,
  DEFAULT_ANIMATION_DIRECTION,
  getClipFrameList,
  isAnimationDirection,
  oppositeHorizontalDirection,
} from '../animations/animationDirections';
import type { AnimationDirection } from '../animations/animationDirections';
import type {
  ResolvedSpriteAnimationTemplateTransform,
  SpriteAnimationTemplate,
  SpriteAnimationTemplateClip,
  SpriteAnimationTemplateFrame,
  SpriteAnimationTemplateLayer,
  SpriteAnimationTemplateParameter,
} from '../animations/spriteAnimationTemplateSchema';

interface HostApi {
  postMessage(message: unknown): void;
}

interface PreviewImageAsset {
  id: string;
  name: string;
  uri: string;
  size: { width: number; height: number };
}

interface DocumentMessage {
  type: 'document';
  mode: 'template';
  template: SpriteAnimationTemplate | null;
  editable: boolean;
  dirty: boolean;
  diagnostics: string;
  title: string;
  externalEditGeneration: number;
  acknowledgedEditId?: number;
  previewImagesByParameter?: Record<string, PreviewImageAsset[]>;
}

interface PreviewImagesSelectedMessage {
  type: 'previewImagesSelected';
  parameterId: string;
  images: PreviewImageAsset[];
}

type CropRect = { x: number; y: number; width: number; height: number };

declare function acquireVsCodeApi(): HostApi;

const vscode = acquireVsCodeApi();
const titleLabel = getElement<HTMLElement>('#document-name');
const saveStatus = getElement<HTMLElement>('#save-status');
const noticeLabel = getElement<HTMLElement>('#notice');
const diagnosticsPanel = getElement<HTMLElement>('#diagnostics');
const templateIdInput = getElement<HTMLInputElement>('#template-id');
const templateNameInput = getElement<HTMLInputElement>('#template-name');
const templateDescriptionInput = getElement<HTMLInputElement>('#template-description');
const inputList = getElement<HTMLUListElement>('#input-list');
const inputTagFilter = getElement<HTMLSelectElement>('#input-tag-filter');
const addInputButton = getElement<HTMLButtonElement>('#add-input');
const inputEditor = getElement<HTMLElement>('#input-editor');
const inputIdInput = getElement<HTMLInputElement>('#input-id');
const inputLabelInput = getElement<HTMLInputElement>('#input-label');
const inputTagsInput = getElement<HTMLInputElement>('#input-tags');
const inputRequiredInput = getElement<HTMLInputElement>('#input-required');
const moveInputUpButton = getElement<HTMLButtonElement>('#move-input-up');
const moveInputDownButton = getElement<HTMLButtonElement>('#move-input-down');
const deleteInputButton = getElement<HTMLButtonElement>('#delete-input');
const clipList = getElement<HTMLUListElement>('#clip-list');
const addClipButton = getElement<HTMLButtonElement>('#add-clip');
const deleteClipButton = getElement<HTMLButtonElement>('#delete-clip');
const clipNameInput = getElement<HTMLInputElement>('#clip-name');
const clipFpsInput = getElement<HTMLInputElement>('#clip-fps');
const clipLoopSelect = getElement<HTMLSelectElement>('#clip-loop');
const canvasWidthInput = getElement<HTMLInputElement>('#canvas-width');
const canvasHeightInput = getElement<HTMLInputElement>('#canvas-height');
const directionalInput = getElement<HTMLInputElement>('#clip-directional');
const directionPad = getElement<HTMLElement>('#direction-pad');
const directionLabel = getElement<HTMLElement>('#direction-label');
const directionTools = getElement<HTMLElement>('#direction-tools');
const copyDirectionTarget = getElement<HTMLSelectElement>('#copy-direction-target');
const copyDirectionMirror = getElement<HTMLInputElement>('#copy-direction-mirror');
const copyDirectionButton = getElement<HTMLButtonElement>('#copy-direction');
const stageTitle = getElement<HTMLElement>('#stage-title');
const previewEmpty = getElement<HTMLElement>('#preview-empty');
const frameList = getElement<HTMLOListElement>('#frame-list');
const timelineDirection = getElement<HTMLElement>('#timeline-direction');
const addFrameButton = getElement<HTMLButtonElement>('#add-frame');
const deleteFrameButton = getElement<HTMLButtonElement>('#delete-frame');
const moveFrameUpButton = getElement<HTMLButtonElement>('#move-frame-up');
const moveFrameDownButton = getElement<HTMLButtonElement>('#move-frame-down');
const frameIndexLabel = getElement<HTMLElement>('#frame-index-label');
const frameDurationInput = getElement<HTMLInputElement>('#frame-duration');
const frameMarkersInput = getElement<HTMLInputElement>('#frame-markers');
const layerList = getElement<HTMLOListElement>('#layer-list');
const layerFields = getElement<HTMLElement>('#layer-fields');
const addLayerButton = getElement<HTMLButtonElement>('#add-layer');
const layerParameterSelect = getElement<HTMLSelectElement>('#layer-parameter');
const layerVisibleInput = getElement<HTMLInputElement>('#layer-visible');
const layerSourceX = getElement<HTMLInputElement>('#layer-source-x');
const layerSourceY = getElement<HTMLInputElement>('#layer-source-y');
const layerSourceWidth = getElement<HTMLInputElement>('#layer-source-width');
const layerSourceHeight = getElement<HTMLInputElement>('#layer-source-height');
const layerOffsetX = getElement<HTMLInputElement>('#layer-offset-x');
const layerOffsetY = getElement<HTMLInputElement>('#layer-offset-y');
const layerStretchX = getElement<HTMLInputElement>('#layer-stretch-x');
const layerStretchY = getElement<HTMLInputElement>('#layer-stretch-y');
const layerZoom = getElement<HTMLInputElement>('#layer-zoom');
const layerRotation = getElement<HTMLInputElement>('#layer-rotation');
const layerPivotX = getElement<HTMLInputElement>('#layer-pivot-x');
const layerPivotY = getElement<HTMLInputElement>('#layer-pivot-y');
const moveLayerUpButton = getElement<HTMLButtonElement>('#move-layer-up');
const moveLayerDownButton = getElement<HTMLButtonElement>('#move-layer-down');
const deleteLayerButton = getElement<HTMLButtonElement>('#delete-layer');
const previewCanvas = getElement<HTMLCanvasElement>('#preview-canvas');
const frameLabel = getElement<HTMLElement>('#frame-label');
const playButton = getElement<HTMLButtonElement>('#play-toggle');
const resetButton = getElement<HTMLButtonElement>('#reset-preview');
const prevFrameButton = getElement<HTMLButtonElement>('#prev-frame');
const nextFrameButton = getElement<HTMLButtonElement>('#next-frame');
const frameScrubber = getElement<HTMLInputElement>('#frame-scrubber');
const atlasCanvas = getElement<HTMLCanvasElement>('#atlas-canvas');
const atlasDimensions = getElement<HTMLElement>('#atlas-dimensions');
const atlasParameterSelect = getElement<HTMLSelectElement>('#atlas-parameter');
const atlasPreviewSelect = getElement<HTMLSelectElement>('#atlas-preview');
const selectPreviewsButton = getElement<HTMLButtonElement>('#select-previews');
const cropActionSelect = getElement<HTMLSelectElement>('#crop-action');
const cropGridSize = getElement<HTMLInputElement>('#crop-grid-size');
const snapGridInput = getElement<HTMLInputElement>('#snap-grid');
const cropHint = getElement<HTMLElement>('#crop-hint');
const directionButtons = [...directionPad.querySelectorAll<HTMLButtonElement>('button[data-direction]')];

const CROP_DRAG_THRESHOLD = 4;
const DEFAULT_TRANSFORM: ResolvedSpriteAnimationTemplateTransform = {
  offset: { x: 0, y: 0 },
  stretch: { x: 1, y: 1 },
  zoom: 1,
  rotation: 0,
  pivot: { x: 0.5, y: 0.5 },
};

let template: SpriteAnimationTemplate | null = null;
let editable = false;
let selectedParameterId = '';
let selectedClipName = '';
let activeDirection: AnimationDirection = DEFAULT_ANIMATION_DIRECTION;
let copyTargetDirection: AnimationDirection | null = null;
let selectedFrameIndex = 0;
let selectedLayerIndex = 0;
let atlasParameterId = '';
let selectedTag = '';
let previewImages = new Map<string, PreviewImageAsset[]>();
const activePreviewIds = new Map<string, string>();
const imageCache = new Map<string, HTMLImageElement>();
let atlasPointer: { pointerId: number; start: { x: number; y: number }; clientX: number; clientY: number; moved: boolean } | null = null;
let cropStart: { x: number; y: number } | null = null;
let cropEnd: { x: number; y: number } | null = null;
let currentAtlasImage: HTMLImageElement | null = null;
let timelineDragFrom: number | null = null;
let playing = false;
let playbackStartedAt = 0;
let animationFrameRequest = 0;
let previewElapsed = 0;
let latestLocalEditId = 0;
let acknowledgedEditId = 0;
let externalEditGeneration = 0;
let currentPlaybackFrameIndex = 0;
let noticeTimer = 0;

function getElement<T extends HTMLElement>(selector: string): T {
  const element = window.document.querySelector<T>(selector);
  if (!element) throw new Error('Missing animation template editor element: ' + selector);
  return element;
}

function showNotice(text: string): void {
  noticeLabel.textContent = text;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { noticeLabel.textContent = ''; }, 6000);
}

function selectedClip(): SpriteAnimationTemplateClip | null {
  return template?.clips.find((clip) => clip.name === selectedClipName) ?? null;
}

function clipFrames(clip: SpriteAnimationTemplateClip | null = selectedClip()): readonly SpriteAnimationTemplateFrame[] {
  return clip ? getClipFrameList(clip, activeDirection) : [];
}

function selectedFrame(): SpriteAnimationTemplateFrame | null {
  return clipFrames()[selectedFrameIndex] ?? null;
}

function selectedLayer(): SpriteAnimationTemplateLayer | null {
  return selectedFrame()?.layers[selectedLayerIndex] ?? null;
}

function selectedParameter(): SpriteAnimationTemplateParameter | null {
  return template?.imageParameters.find((parameter) => parameter.id === selectedParameterId) ?? null;
}

function layerTransform(layer: SpriteAnimationTemplateLayer): ResolvedSpriteAnimationTemplateTransform {
  const transform = layer.transform ?? {};
  return {
    offset: { ...(transform.offset ?? DEFAULT_TRANSFORM.offset) },
    stretch: { ...(transform.stretch ?? DEFAULT_TRANSFORM.stretch) },
    zoom: transform.zoom ?? DEFAULT_TRANSFORM.zoom,
    rotation: transform.rotation ?? DEFAULT_TRANSFORM.rotation,
    pivot: { ...(transform.pivot ?? DEFAULT_TRANSFORM.pivot) },
  };
}

function parameterName(parameterId: string): string {
  const parameter = template?.imageParameters.find((entry) => entry.id === parameterId);
  return parameter?.label || parameterId;
}

function activePreview(parameterId: string): PreviewImageAsset | null {
  const images = previewImages.get(parameterId) ?? [];
  const id = activePreviewIds.get(parameterId);
  return images.find((image) => image.id === id) ?? images[0] ?? null;
}

function parameterOptions(select: HTMLSelectElement, selected: string): void {
  select.replaceChildren(...(template?.imageParameters ?? []).map((parameter) => {
    const option = new Option(parameter.label ? `${parameter.label} (${parameter.id})` : parameter.id, parameter.id);
    option.selected = parameter.id === selected;
    return option;
  }));
}

function setDiagnostics(text: string): void {
  diagnosticsPanel.textContent = text;
  diagnosticsPanel.hidden = text.length === 0;
}

function stopPlayback(): void {
  playing = false;
  playButton.textContent = '▶ Play';
  if (animationFrameRequest !== 0) cancelAnimationFrame(animationFrameRequest);
  animationFrameRequest = 0;
  for (const card of frameList.querySelectorAll('.frame-card.playing')) card.classList.remove('playing');
}

function postEdit(next: SpriteAnimationTemplate): void {
  if (!editable) return;
  const checked = validateSpriteAnimationTemplate(next);
  if (!checked.ok) {
    setDiagnostics(checked.diagnostics.map((item) => `${item.path || '/'}: ${item.message}`).join('\n'));
    return;
  }
  template = spriteAnimationTemplateSource(checked.value);
  const editId = ++latestLocalEditId;
  stopPlayback();
  saveStatus.textContent = 'Saving…';
  vscode.postMessage({ type: 'edit', editId, externalEditGeneration, template });
  render();
}

function tryEdit(edit: () => SpriteAnimationTemplate, failure: string): void {
  try {
    postEdit(edit());
  } catch (error) {
    setDiagnostics(error instanceof Error ? error.message : failure);
  }
}

function postParameterUpdate(parameterId: string, update: Partial<SpriteAnimationTemplateParameter>): void {
  if (!template) return;
  const nextId = update.id ?? parameterId;
  let next: SpriteAnimationTemplate;
  try {
    next = updateSpriteAnimationTemplateParameter(template, parameterId, update);
  } catch (error) {
    setDiagnostics(error instanceof Error ? error.message : 'The input could not be updated.');
    renderInputs();
    return;
  }
  if (nextId !== parameterId) {
    const images = previewImages.get(parameterId);
    const activeId = activePreviewIds.get(parameterId);
    if (images) {
      previewImages.set(nextId, images);
      previewImages.delete(parameterId);
    }
    if (activeId) {
      activePreviewIds.set(nextId, activeId);
      activePreviewIds.delete(parameterId);
    }
    if (atlasParameterId === parameterId) atlasParameterId = nextId;
    if (selectedParameterId === parameterId) selectedParameterId = nextId;
  }
  postEdit(next);
}

function updateSelectedFrame(update: Partial<SpriteAnimationTemplateFrame>): void {
  if (!template || !selectedClip() || !selectedFrame()) return;
  postEdit(updateSpriteAnimationTemplateFrame(template, selectedClipName, selectedFrameIndex, update, activeDirection));
}

function updateSelectedLayer(update: Partial<SpriteAnimationTemplateLayer>): void {
  if (!template || !selectedClip() || !selectedLayer()) return;
  postEdit(updateSpriteAnimationTemplateLayer(template, selectedClipName, selectedFrameIndex, selectedLayerIndex, update, activeDirection));
}

function listItem(label: string, meta: string, active: boolean, onSelect: () => void): HTMLButtonElement {
  const button = window.document.createElement('button');
  button.type = 'button';
  button.className = 'list-item' + (active ? ' active' : '');
  button.setAttribute('aria-pressed', String(active));
  const name = window.document.createElement('span');
  name.className = 'item-name';
  name.textContent = label;
  const detail = window.document.createElement('span');
  detail.className = 'item-meta';
  detail.textContent = meta;
  button.append(name, detail);
  button.addEventListener('click', onSelect);
  return button;
}

function renderInputs(): void {
  const parameters = template?.imageParameters ?? [];
  const allTags = [...new Set(parameters.flatMap((parameter) => parameter.tags ?? []))].sort();
  inputTagFilter.replaceChildren(new Option('All tags', ''), ...allTags.map((tag) => new Option(tag, tag)));
  if (!allTags.includes(selectedTag)) selectedTag = '';
  inputTagFilter.value = selectedTag;
  inputTagFilter.disabled = allTags.length === 0;
  const visible = parameters.filter((parameter) => !selectedTag || parameter.tags?.includes(selectedTag));
  inputList.replaceChildren(...visible.map((parameter) => {
    const item = window.document.createElement('li');
    const images = previewImages.get(parameter.id)?.length ?? 0;
    const meta = (parameter.required ? 'required' : 'optional') + (images > 0 ? ` · ${images} preview${images === 1 ? '' : 's'}` : '');
    item.append(listItem(parameter.label || parameter.id, meta, parameter.id === selectedParameterId, () => {
      selectedParameterId = parameter.id;
      atlasParameterId = parameter.id;
      render();
    }));
    return item;
  }));
  addInputButton.disabled = !editable;

  const parameter = selectedParameter();
  inputEditor.hidden = parameter === null;
  if (!parameter) return;
  const index = parameters.indexOf(parameter);
  for (const input of [inputIdInput, inputLabelInput, inputTagsInput, inputRequiredInput]) input.disabled = !editable;
  inputIdInput.value = parameter.id;
  inputLabelInput.value = parameter.label ?? '';
  inputTagsInput.value = (parameter.tags ?? []).join(', ');
  inputRequiredInput.checked = parameter.required;
  moveInputUpButton.disabled = !editable || index <= 0;
  moveInputDownButton.disabled = !editable || index >= parameters.length - 1;
  deleteInputButton.disabled = !editable || parameters.length <= 1;
  inputEditor.querySelector('.preview-choices')?.remove();
  const images = previewImages.get(parameter.id) ?? [];
  if (images.length === 0) return;
  const choices = window.document.createElement('div');
  choices.className = 'preview-choices';
  for (const image of images) {
    const row = window.document.createElement('label');
    row.className = 'preview-choice';
    const radio = window.document.createElement('input');
    radio.type = 'radio';
    radio.name = `active-preview-${parameter.id}`;
    radio.checked = activePreview(parameter.id)?.id === image.id;
    radio.addEventListener('change', () => { activePreviewIds.set(parameter.id, image.id); renderAtlasSelectors(); renderPreviewAndAtlas(); });
    const thumb = window.document.createElement('img');
    thumb.className = 'preview-thumb';
    thumb.alt = '';
    thumb.src = image.uri;
    const name = window.document.createElement('span');
    name.textContent = `${image.name} · ${image.size.width}×${image.size.height}`;
    row.append(radio, thumb, name);
    choices.append(row);
  }
  inputEditor.append(choices);
}

function renderClips(): void {
  const clips = template?.clips ?? [];
  if (!clips.some((clip) => clip.name === selectedClipName)) selectedClipName = clips[0]?.name ?? '';
  clipList.replaceChildren(...clips.map((clip) => {
    const item = window.document.createElement('li');
    const meta = clip.directions !== undefined
      ? '4 dirs'
      : `${clip.frames?.length ?? 0} frame${clip.frames?.length === 1 ? '' : 's'}`;
    item.append(listItem(clip.name, meta, clip.name === selectedClipName, () => selectClip(clip.name)));
    return item;
  }));
  const clip = selectedClip();
  const enabled = editable && clip !== null;
  for (const input of [clipNameInput, clipFpsInput, canvasWidthInput, canvasHeightInput, clipLoopSelect, directionalInput]) input.disabled = !enabled;
  addClipButton.disabled = !editable || !template?.imageParameters.length;
  deleteClipButton.disabled = !enabled || clips.length <= 1;
  if (!clip) return;
  clipNameInput.value = clip.name;
  clipFpsInput.value = String(clip.fps);
  clipLoopSelect.value = clip.loop;
  canvasWidthInput.value = String(clip.canvasSize.width);
  canvasHeightInput.value = String(clip.canvasSize.height);
  directionalInput.checked = clip.directions !== undefined;
}

function selectClip(name: string): void {
  stopPlayback();
  selectedClipName = name;
  selectedFrameIndex = 0;
  selectedLayerIndex = 0;
  currentPlaybackFrameIndex = 0;
  copyTargetDirection = null;
  previewElapsed = 0;
  render();
}

function renderDirectionControls(): void {
  const clip = selectedClip();
  const directions = clip?.directions;
  directionPad.hidden = directions === undefined;
  directionTools.hidden = directions === undefined;
  timelineDirection.textContent = directions === undefined
    ? ''
    : ANIMATION_DIRECTION_ARROWS[activeDirection] + ' ' + ANIMATION_DIRECTION_LABELS[activeDirection];
  stageTitle.textContent = clip
    ? clip.name + (directions === undefined ? '' : ` · ${ANIMATION_DIRECTION_LABELS[activeDirection]} (dir ${ANIMATION_DIRECTIONS.indexOf(activeDirection)})`)
    : 'No clip selected';
  if (directions === undefined) return;
  directionLabel.textContent = ANIMATION_DIRECTION_ARROWS[activeDirection];
  for (const button of directionButtons) {
    const direction = button.dataset.direction;
    if (!isAnimationDirection(direction)) continue;
    const count = directions[direction].length;
    button.classList.toggle('active', direction === activeDirection);
    button.setAttribute('aria-pressed', String(direction === activeDirection));
    button.title = `${ANIMATION_DIRECTION_LABELS[direction]} · dir ${ANIMATION_DIRECTIONS.indexOf(direction)} · ${count} frame${count === 1 ? '' : 's'}`;
  }
  const targets = ANIMATION_DIRECTIONS.filter((direction) => direction !== activeDirection);
  copyDirectionTarget.replaceChildren(...targets.map((direction) =>
    new Option(ANIMATION_DIRECTION_ARROWS[direction] + ' ' + ANIMATION_DIRECTION_LABELS[direction], direction)));
  if (copyTargetDirection === null || copyTargetDirection === activeDirection) {
    copyTargetDirection = oppositeHorizontalDirection(activeDirection) ?? targets[0]!;
    copyDirectionMirror.checked = oppositeHorizontalDirection(activeDirection) === copyTargetDirection;
  }
  copyDirectionTarget.value = copyTargetDirection;
  for (const control of [copyDirectionTarget, copyDirectionMirror, copyDirectionButton]) control.disabled = !editable;
}

function setActiveDirection(direction: AnimationDirection): void {
  const clip = selectedClip();
  if (!clip || clip.directions === undefined || direction === activeDirection) return;
  activeDirection = direction;
  copyTargetDirection = null;
  const count = clip.directions[direction].length;
  selectedFrameIndex = Math.min(selectedFrameIndex, count - 1);
  currentPlaybackFrameIndex = Math.min(currentPlaybackFrameIndex, count - 1);
  selectedLayerIndex = 0;
  if (playing) render();
  else {
    previewElapsed = 0;
    render();
  }
}

function renderFrames(): void {
  const clip = selectedClip();
  const frames = clipFrames(clip);
  selectedFrameIndex = Math.max(0, Math.min(selectedFrameIndex, frames.length - 1));
  frameList.replaceChildren(...frames.map((frame, index) => {
    const item = window.document.createElement('li');
    item.className = 'timeline-item';
    item.draggable = editable;
    item.dataset.frameIndex = String(index);
    const card = window.document.createElement('button');
    card.type = 'button';
    card.className = `frame-card${index === selectedFrameIndex ? ' active' : ''}`;
    card.setAttribute('aria-pressed', String(index === selectedFrameIndex));
    card.title = `${frame.layers.length} layer${frame.layers.length === 1 ? '' : 's'}` +
      (frame.markers?.length ? ` · markers: ${frame.markers.join(', ')}` : '');
    const thumb = window.document.createElement('canvas');
    thumb.className = 'frame-thumb';
    thumb.dataset.frameIndex = String(index);
    const caption = window.document.createElement('span');
    caption.className = 'frame-caption';
    const number = window.document.createElement('strong');
    number.textContent = String(index + 1);
    const detail = window.document.createElement('span');
    detail.textContent = frame.duration !== undefined
      ? `${frame.duration}s`
      : frame.markers?.length ? `◆ ${frame.markers[0]}` : `${frame.layers.length} layer${frame.layers.length === 1 ? '' : 's'}`;
    caption.append(number, detail);
    card.append(thumb, caption);
    card.addEventListener('click', () => selectFrame(index));
    item.append(card);
    return item;
  }));
  const frame = frames[selectedFrameIndex];
  frameIndexLabel.textContent = frame ? `${selectedFrameIndex + 1} / ${frames.length}` : '';
  frameDurationInput.value = frame?.duration === undefined ? '' : String(frame.duration);
  frameMarkersInput.value = (frame?.markers ?? []).join(', ');
  const enabled = editable && frame !== undefined;
  for (const input of [frameDurationInput, frameMarkersInput]) input.disabled = !enabled;
  addFrameButton.disabled = !enabled;
  deleteFrameButton.disabled = !enabled || frames.length <= 1;
  moveFrameUpButton.disabled = !enabled || selectedFrameIndex <= 0;
  moveFrameDownButton.disabled = !enabled || selectedFrameIndex >= frames.length - 1;
}

function selectFrame(index: number): void {
  stopPlayback();
  selectedFrameIndex = index;
  currentPlaybackFrameIndex = index;
  selectedLayerIndex = 0;
  previewElapsed = 0;
  render();
}

function renderLayers(): void {
  const frame = selectedFrame();
  const layers = frame?.layers ?? [];
  selectedLayerIndex = Math.max(0, Math.min(selectedLayerIndex, layers.length - 1));
  layerList.replaceChildren(...layers.map((layer, index) => {
    const item = window.document.createElement('li');
    item.className = 'list-row';
    const button = listItem(`${index + 1}. ${parameterName(layer.parameter)}`,
      `${layer.source.width}×${layer.source.height}`, index === selectedLayerIndex, () => { selectedLayerIndex = index; render(); });
    button.classList.toggle('is-hidden', layer.visible === false);
    const visibility = window.document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'visibility-toggle';
    visibility.textContent = layer.visible === false ? 'show' : 'hide';
    visibility.title = layer.visible === false ? 'Show layer' : 'Hide layer';
    visibility.disabled = !editable;
    visibility.addEventListener('click', () => {
      if (!template) return;
      selectedLayerIndex = index;
      postEdit(updateSpriteAnimationTemplateLayer(template, selectedClipName, selectedFrameIndex, index, { visible: layer.visible === false }, activeDirection));
    });
    item.append(button, visibility);
    return item;
  }));
  const layer = selectedLayer();
  const enabled = editable && layer !== null;
  layerFields.hidden = layer === null;
  for (const input of [layerVisibleInput, layerSourceX, layerSourceY, layerSourceWidth, layerSourceHeight,
    layerOffsetX, layerOffsetY, layerStretchX, layerStretchY, layerZoom, layerRotation, layerPivotX, layerPivotY]) input.disabled = !enabled;
  layerParameterSelect.disabled = !enabled;
  parameterOptions(layerParameterSelect, layer?.parameter ?? selectedParameterId);
  addLayerButton.disabled = !editable || !frame || !template?.imageParameters.length;
  moveLayerUpButton.disabled = !enabled || selectedLayerIndex <= 0;
  moveLayerDownButton.disabled = !enabled || selectedLayerIndex >= layers.length - 1;
  deleteLayerButton.disabled = !enabled || layers.length <= 1;
  if (!layer) return;
  const transform = layerTransform(layer);
  layerVisibleInput.checked = layer.visible !== false;
  layerSourceX.value = String(layer.source.x);
  layerSourceY.value = String(layer.source.y);
  layerSourceWidth.value = String(layer.source.width);
  layerSourceHeight.value = String(layer.source.height);
  layerOffsetX.value = String(transform.offset.x);
  layerOffsetY.value = String(transform.offset.y);
  layerStretchX.value = String(transform.stretch.x);
  layerStretchY.value = String(transform.stretch.y);
  layerZoom.value = String(transform.zoom);
  layerRotation.value = String(transform.rotation);
  layerPivotX.value = String(transform.pivot.x);
  layerPivotY.value = String(transform.pivot.y);
}

function renderAtlasSelectors(): void {
  const parameters = template?.imageParameters ?? [];
  if (!parameters.some((parameter) => parameter.id === atlasParameterId)) atlasParameterId = parameters[0]?.id ?? '';
  if (!parameters.some((parameter) => parameter.id === selectedParameterId)) selectedParameterId = parameters[0]?.id ?? '';
  parameterOptions(atlasParameterSelect, atlasParameterId);
  const images = atlasParameterId ? previewImages.get(atlasParameterId) ?? [] : [];
  const active = activePreview(atlasParameterId);
  atlasPreviewSelect.replaceChildren(...images.map((image) => new Option(`${image.name} · ${image.size.width}×${image.size.height}`, image.id,
    false, image.id === active?.id)));
  atlasParameterSelect.disabled = parameters.length === 0;
  atlasPreviewSelect.disabled = images.length === 0;
  selectPreviewsButton.disabled = !editable || !atlasParameterId;
  selectPreviewsButton.textContent = images.length > 0 ? 'Replace preview images…' : 'Choose preview images…';
  const replaceOption = cropActionSelect.querySelector<HTMLOptionElement>('option[value="replace-layer"]');
  if (replaceOption) replaceOption.disabled = selectedLayer() === null;
  if (cropActionSelect.value === 'replace-layer' && replaceOption?.disabled) cropActionSelect.value = 'add-layer';
  cropActionSelect.disabled = !editable;
}

function getImage(asset: PreviewImageAsset | null): HTMLImageElement | null {
  if (!asset) return null;
  const cached = imageCache.get(asset.id);
  if (cached) return cached;
  const image = new Image();
  imageCache.set(asset.id, image);
  image.onload = () => { renderPreviewAndAtlas(); };
  image.onerror = () => { imageCache.delete(asset.id); cropHint.textContent = `Could not decode ${asset.name}.`; };
  image.src = asset.uri;
  return image;
}

function imageLookup(): Record<string, { image: HTMLImageElement } | undefined> {
  const result: Record<string, { image: HTMLImageElement } | undefined> = Object.create(null);
  for (const parameter of template?.imageParameters ?? []) {
    const image = getImage(activePreview(parameter.id));
    if (image?.complete && image.naturalWidth > 0) result[parameter.id] = { image };
  }
  return result;
}

function drawPreviewFrame(frameIndex: number): void {
  const clip = selectedClip();
  const context = previewCanvas.getContext('2d');
  if (!context) return;
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const rect = previewCanvas.getBoundingClientRect();
  const width = Math.round(Math.max(200, rect.width || 480) * pixelRatio);
  const height = Math.round(Math.max(200, rect.height || 360) * pixelRatio);
  if (previewCanvas.width !== width || previewCanvas.height !== height) {
    previewCanvas.width = width;
    previewCanvas.height = height;
  }
  context.clearRect(0, 0, width, height);
  if (!clip) return;
  context.imageSmoothingEnabled = false;
  const scale = Math.max(0.1, Math.min((width - 24) / clip.canvasSize.width, (height - 24) / clip.canvasSize.height));
  const renderedWidth = clip.canvasSize.width * scale;
  const renderedHeight = clip.canvasSize.height * scale;
  const x = (width - renderedWidth) / 2;
  const y = (height - renderedHeight) / 2;
  context.save();
  context.strokeStyle = 'rgba(127, 127, 127, 0.5)';
  context.lineWidth = pixelRatio;
  context.strokeRect(x, y, renderedWidth, renderedHeight);
  context.restore();
  const frame = clipFrames(clip)[frameIndex];
  if (frame) drawSpriteAnimationTemplateFrame(context, clip, frame, imageLookup(), { x, y, scale });
}

function renderFrameThumbnails(): void {
  const clip = selectedClip();
  const frames = clipFrames(clip);
  const images = imageLookup();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  for (const canvas of frameList.querySelectorAll<HTMLCanvasElement>('.frame-thumb')) {
    const frame = frames[Number(canvas.dataset.frameIndex)];
    if (!clip || !frame) continue;
    canvas.width = Math.round(78 * ratio);
    canvas.height = Math.round(64 * ratio);
    const context = canvas.getContext('2d');
    if (!context) continue;
    context.imageSmoothingEnabled = false;
    const scale = Math.min((canvas.width - 8) / clip.canvasSize.width, (canvas.height - 8) / clip.canvasSize.height);
    drawSpriteAnimationTemplateFrame(context, clip, frame, images, {
      x: (canvas.width - clip.canvasSize.width * scale) / 2,
      y: (canvas.height - clip.canvasSize.height * scale) / 2,
      scale,
    });
  }
}

function previewEmptyText(): string {
  if (!template) return 'Fix the template JSON in the text editor to continue.';
  const clip = selectedClip();
  if (!clip) return 'Select a clip.';
  const used = new Set(clipFrames(clip).flatMap((frame) => frame.layers.map((layer) => layer.parameter)));
  const missing = [...used].filter((id) => !activePreview(id));
  if (missing.length === used.size && used.size > 0) {
    return `Choose preview images for ${missing.map(parameterName).join(', ')} to see this clip. Use “Choose preview images…” in the atlas.`;
  }
  return '';
}

function renderPreviewAndAtlas(): void {
  const clip = selectedClip();
  const frames = clipFrames(clip);
  const index = playing ? currentPlaybackFrameIndex : selectedFrameIndex;
  drawPreviewFrame(index);
  frameLabel.textContent = clip && frames[index]
    ? `Frame ${index + 1} of ${frames.length} · ${clip.fps} FPS · ${clip.loop}${frames[index]!.duration ? ` · ${frames[index]!.duration}s` : ''}`
    : '—';
  if (!playing) frameScrubber.value = String(selectedFrameIndex);
  const empty = previewEmptyText();
  previewEmpty.textContent = empty;
  previewEmpty.hidden = empty.length === 0;
  drawAtlas();
  renderFrameThumbnails();
}

function drawAtlas(): void {
  const asset = activePreview(atlasParameterId);
  const image = getImage(asset);
  if (!asset || !image || !image.complete || image.naturalWidth === 0) {
    currentAtlasImage = null;
    atlasCanvas.width = 1;
    atlasCanvas.height = 1;
    atlasDimensions.textContent = '';
    cropHint.textContent = template?.imageParameters.length
      ? `Choose preview images for “${parameterName(atlasParameterId)}” to crop from them.`
      : 'Add an image input first.';
    return;
  }
  currentAtlasImage = image;
  if (atlasCanvas.width !== image.naturalWidth || atlasCanvas.height !== image.naturalHeight) {
    atlasCanvas.width = image.naturalWidth;
    atlasCanvas.height = image.naturalHeight;
  }
  const displayScale = Math.max(1, Math.min(4, Math.floor(640 / Math.max(image.naturalWidth, image.naturalHeight)) || 1));
  atlasCanvas.style.width = `${image.naturalWidth * displayScale}px`;
  atlasCanvas.style.height = `${image.naturalHeight * displayScale}px`;
  const context = atlasCanvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const grid = Math.max(1, Math.floor(Number(cropGridSize.value) || 16));
  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  context.lineWidth = 1;
  context.beginPath();
  for (let x = grid; x < atlasCanvas.width; x += grid) { context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, atlasCanvas.height); }
  for (let y = grid; y < atlasCanvas.height; y += grid) { context.moveTo(0, y + 0.5); context.lineTo(atlasCanvas.width, y + 0.5); }
  context.stroke();
  const layers = selectedFrame()?.layers ?? [];
  layers.forEach((layer, index) => {
    if (layer.parameter !== atlasParameterId) return;
    const active = index === selectedLayerIndex;
    context.strokeStyle = active ? '#ffd166' : 'rgba(88, 180, 255, 0.9)';
    context.fillStyle = active ? 'rgba(255, 200, 60, 0.16)' : 'rgba(50, 150, 255, 0.1)';
    context.lineWidth = active ? 2 : 1;
    context.fillRect(layer.source.x, layer.source.y, layer.source.width, layer.source.height);
    context.strokeRect(layer.source.x + 0.5, layer.source.y + 0.5, layer.source.width - 1, layer.source.height - 1);
  });
  if (cropStart && cropEnd) {
    const crop = cropSpriteFrameFromDrag(cropStart, cropEnd, image.naturalWidth, image.naturalHeight, grid, snapGridInput.checked);
    if (crop) {
      context.strokeStyle = '#5ae6aa';
      context.fillStyle = 'rgba(90, 230, 170, 0.22)';
      context.lineWidth = 1;
      context.fillRect(crop.x, crop.y, crop.width, crop.height);
      context.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.width - 1, crop.height - 1);
    }
  }
  context.restore();
  atlasDimensions.textContent = `${image.naturalWidth}×${image.naturalHeight} · ${asset.name}`;
  cropHint.textContent = editable
    ? 'Click a highlighted crop to select its layer. Drag to crop' + (snapGridInput.checked ? ` (snaps to ${grid} px).` : '.')
    : 'Read only.';
}

function render(): void {
  if (!template) {
    setDiagnostics(diagnosticsPanel.textContent || 'Template JSON is invalid. Fix it in the text editor to continue.');
    previewEmpty.textContent = previewEmptyText();
    previewEmpty.hidden = false;
    return;
  }
  titleLabel.textContent = template.name || 'Sprite Animation Template';
  templateIdInput.value = template.id;
  templateNameInput.value = template.name;
  templateDescriptionInput.value = template.description ?? '';
  for (const input of [templateIdInput, templateNameInput, templateDescriptionInput]) input.disabled = !editable;
  renderClips();
  renderInputs();
  renderDirectionControls();
  renderFrames();
  renderLayers();
  renderAtlasSelectors();
  const frames = clipFrames();
  frameScrubber.max = String(Math.max(0, frames.length - 1));
  for (const control of [frameScrubber, playButton, prevFrameButton, nextFrameButton]) control.disabled = frames.length <= 1;
  resetButton.disabled = frames.length === 0;
  renderPreviewAndAtlas();
}

function frameDurationSeconds(frame: SpriteAnimationTemplateFrame, fps: number): number {
  return frame.duration ?? 1 / fps;
}

function playbackTick(now: number): void {
  if (!playing) return;
  const clip = selectedClip();
  if (!clip) { stopPlayback(); return; }
  const frames = clipFrames(clip);
  const frame = getSpriteAnimationTemplateFrameIndex({ ...clip, frames }, previewElapsed + Math.max(0, now - playbackStartedAt) / 1000);
  currentPlaybackFrameIndex = frame.index;
  drawPreviewFrame(currentPlaybackFrameIndex);
  frameLabel.textContent = `Frame ${currentPlaybackFrameIndex + 1} of ${frames.length} · ${clip.fps} FPS · ${clip.loop}`;
  for (const card of frameList.querySelectorAll<HTMLButtonElement>('.frame-card')) {
    card.classList.toggle('playing', card.parentElement?.dataset.frameIndex === String(currentPlaybackFrameIndex));
  }
  if (frame.done) {
    previewElapsed = 0;
    stopPlayback();
    selectedFrameIndex = frames.length - 1;
    render();
    return;
  }
  animationFrameRequest = requestAnimationFrame(playbackTick);
}

function togglePlayback(): void {
  const clip = selectedClip();
  const frames = clipFrames(clip);
  if (!clip || frames.length <= 1) return;
  if (playing) {
    previewElapsed += Math.max(0, performance.now() - playbackStartedAt) / 1000;
    stopPlayback();
    selectedFrameIndex = currentPlaybackFrameIndex;
    render();
    return;
  }
  if (previewElapsed === 0) previewElapsed = frames.slice(0, selectedFrameIndex)
    .reduce((sum, frame) => sum + frameDurationSeconds(frame, clip.fps), 0);
  playbackStartedAt = performance.now();
  playing = true;
  playButton.textContent = '❚❚ Pause';
  animationFrameRequest = requestAnimationFrame(playbackTick);
}

function stepFrame(delta: number): void {
  const count = clipFrames().length;
  if (count === 0) return;
  const from = playing ? currentPlaybackFrameIndex : selectedFrameIndex;
  selectFrame((from + delta + count) % count);
}

function moveFrameTo(from: number, insertBefore: number): void {
  if (!template) return;
  const count = clipFrames().length;
  const target = Math.max(0, Math.min(count - 1, insertBefore > from ? insertBefore - 1 : insertBefore));
  if (target === from || from < 0 || from >= count) return;
  let next = template;
  const step = target > from ? 1 : -1;
  for (let index = from; index !== target; index += step) {
    next = moveSpriteAnimationTemplateFrame(next, selectedClipName, index, step, activeDirection);
  }
  selectedFrameIndex = target;
  currentPlaybackFrameIndex = target;
  postEdit(next);
}

function removeSelectedFrame(): void {
  if (!template || !selectedClip()) return;
  const index = selectedFrameIndex;
  tryEdit(() => {
    const next = removeSpriteAnimationTemplateFrame(template!, selectedClipName, index, activeDirection);
    selectedFrameIndex = Math.max(0, index - 1);
    selectedLayerIndex = 0;
    return next;
  }, 'Frame could not be removed.');
}

function atlasPoint(event: PointerEvent): { x: number; y: number } | null {
  if (!currentAtlasImage) return null;
  const rect = atlasCanvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: Math.max(0, Math.min(currentAtlasImage.naturalWidth - 1, (event.clientX - rect.left) * currentAtlasImage.naturalWidth / rect.width)),
    y: Math.max(0, Math.min(currentAtlasImage.naturalHeight - 1, (event.clientY - rect.top) * currentAtlasImage.naturalHeight / rect.height)),
  };
}

function selectLayerAtPoint(point: { x: number; y: number }): boolean {
  const layers = selectedFrame()?.layers ?? [];
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index]!;
    if (layer.parameter !== atlasParameterId) continue;
    const { x, y, width, height } = layer.source;
    if (point.x >= x && point.y >= y && point.x < x + width && point.y < y + height) {
      selectedLayerIndex = index;
      render();
      return true;
    }
  }
  return false;
}

function applyCrop(crop: CropRect): void {
  if (!template || !selectedClip()) return;
  const action = cropActionSelect.value;
  const layer = { parameter: atlasParameterId, source: crop };
  if (action === 'add-frame') {
    const count = clipFrames().length;
    selectedFrameIndex = count;
    currentPlaybackFrameIndex = count;
    selectedLayerIndex = 0;
    tryEdit(() => addSpriteAnimationTemplateFrame(template!, selectedClipName, { layers: [layer] }, activeDirection), 'Frame could not be added.');
    return;
  }
  if (!selectedFrame()) return;
  if (action === 'replace-layer' && selectedLayer()) {
    tryEdit(() => updateSpriteAnimationTemplateLayer(template!, selectedClipName, selectedFrameIndex, selectedLayerIndex, layer, activeDirection),
      'Layer crop could not be replaced.');
    return;
  }
  const count = selectedFrame()!.layers.length;
  selectedLayerIndex = count;
  tryEdit(() => addSpriteAnimationTemplateLayer(template!, selectedClipName, selectedFrameIndex, layer, activeDirection), 'Layer could not be added.');
}

function numberValue(input: HTMLInputElement): number | null {
  if (input.value.trim().length === 0) return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'range' && target.type !== 'radio';
}

function clearDropMarkers(): void {
  for (const item of frameList.querySelectorAll('.drop-before, .drop-after')) item.classList.remove('drop-before', 'drop-after');
}

addInputButton.addEventListener('click', () => {
  if (!template) return;
  let suffix = template.imageParameters.length + 1;
  let id = `input-${suffix}`;
  while (template.imageParameters.some((parameter) => parameter.id === id)) id = `input-${++suffix}`;
  selectedParameterId = id;
  atlasParameterId = id;
  postEdit(addSpriteAnimationTemplateParameter(template, { id, required: true }));
  window.setTimeout(() => inputIdInput.select(), 0);
});
inputIdInput.addEventListener('change', () => {
  const id = inputIdInput.value.trim();
  if (!id) { renderInputs(); return; }
  postParameterUpdate(selectedParameterId, { id });
});
inputLabelInput.addEventListener('change', () => postParameterUpdate(selectedParameterId, { label: inputLabelInput.value.trim() || undefined }));
inputTagsInput.addEventListener('change', () => postParameterUpdate(selectedParameterId, {
  tags: [...new Set(inputTagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean))],
}));
inputRequiredInput.addEventListener('change', () => postParameterUpdate(selectedParameterId, { required: inputRequiredInput.checked }));
moveInputUpButton.addEventListener('click', () => { if (template) tryEdit(() => moveSpriteAnimationTemplateParameter(template!, selectedParameterId, -1), 'Input could not be moved.'); });
moveInputDownButton.addEventListener('click', () => { if (template) tryEdit(() => moveSpriteAnimationTemplateParameter(template!, selectedParameterId, 1), 'Input could not be moved.'); });
deleteInputButton.addEventListener('click', () => {
  if (!template) return;
  const parameterId = selectedParameterId;
  tryEdit(() => {
    const next = removeSpriteAnimationTemplateParameter(template!, parameterId);
    previewImages.delete(parameterId);
    activePreviewIds.delete(parameterId);
    return next;
  }, 'The input could not be removed.');
});
templateIdInput.addEventListener('change', () => {
  if (!template) return;
  const id = templateIdInput.value.trim();
  if (id) postEdit({ ...template, id });
  else render();
});
templateNameInput.addEventListener('change', () => {
  if (!template) return;
  const name = templateNameInput.value.trim();
  if (name) postEdit({ ...template, name });
  else render();
});
templateDescriptionInput.addEventListener('change', () => {
  if (!template) return;
  const description = templateDescriptionInput.value.trim();
  postEdit({ ...template, ...(description ? { description } : { description: undefined }) });
});
inputTagFilter.addEventListener('change', () => { selectedTag = inputTagFilter.value; renderInputs(); });

clipNameInput.addEventListener('change', () => {
  const clip = selectedClip();
  if (!template || !clip) return;
  const name = clipNameInput.value.trim();
  if (!name) { renderClips(); return; }
  tryEdit(() => {
    const next = updateSpriteAnimationTemplateClip(template!, clip.name, { name });
    selectedClipName = name;
    return next;
  }, 'Clip could not be renamed.');
});
clipFpsInput.addEventListener('change', () => {
  const clip = selectedClip(); const value = numberValue(clipFpsInput);
  if (template && clip && value !== null) postEdit(updateSpriteAnimationTemplateClip(template, clip.name, { fps: value }));
});
clipLoopSelect.addEventListener('change', () => {
  const clip = selectedClip();
  if (template && clip) postEdit(updateSpriteAnimationTemplateClip(template, clip.name, { loop: clipLoopSelect.value as 'loop' | 'once' | 'ping-pong' }));
});
canvasWidthInput.addEventListener('change', () => {
  const clip = selectedClip(); const value = numberValue(canvasWidthInput);
  if (template && clip && value !== null) postEdit(updateSpriteAnimationTemplateClip(template, clip.name, { canvasSize: { ...clip.canvasSize, width: value } }));
});
canvasHeightInput.addEventListener('change', () => {
  const clip = selectedClip(); const value = numberValue(canvasHeightInput);
  if (template && clip && value !== null) postEdit(updateSpriteAnimationTemplateClip(template, clip.name, { canvasSize: { ...clip.canvasSize, height: value } }));
});
directionalInput.addEventListener('change', () => {
  const clip = selectedClip();
  if (!template || !clip) return;
  const enabled = directionalInput.checked;
  showNotice(enabled
    ? 'All four directions start as a copy of the current frames.'
    : `Kept the ${ANIMATION_DIRECTION_LABELS[activeDirection]} frames. Undo (Ctrl+Z) restores the other directions.`);
  postEdit(setSpriteAnimationTemplateClipDirectional(template, clip.name, enabled, activeDirection));
});
addClipButton.addEventListener('click', () => {
  if (!template) return;
  let name = 'clip'; let suffix = 2;
  while (template.clips.some((clip) => clip.name === name)) name = `clip-${suffix++}`;
  const parameter = template.imageParameters[0];
  if (!parameter) return;
  const clip = {
    name, fps: 8, loop: 'loop' as const, canvasSize: { width: 32, height: 32 },
    frames: [{ layers: [{ parameter: parameter.id, source: { x: 0, y: 0, width: 1, height: 1 } }] }],
  };
  selectedClipName = name; selectedFrameIndex = 0; selectedLayerIndex = 0; previewElapsed = 0;
  postEdit(addSpriteAnimationTemplateClip(template, clip));
  window.setTimeout(() => clipNameInput.select(), 0);
});
deleteClipButton.addEventListener('click', () => {
  const clip = selectedClip(); if (!template || !clip) return;
  tryEdit(() => {
    const next = removeSpriteAnimationTemplateClip(template!, clip.name);
    selectedClipName = next.clips[0]?.name ?? '';
    selectedFrameIndex = 0; selectedLayerIndex = 0; previewElapsed = 0;
    showNotice(`Deleted clip “${clip.name}”. Undo with Ctrl+Z.`);
    return next;
  }, 'Clip could not be removed.');
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
  if (!template || !isAnimationDirection(target)) return;
  const mirror = copyDirectionMirror.checked;
  showNotice(`${mirror ? 'Mirrored' : 'Copied'} ${ANIMATION_DIRECTION_LABELS[activeDirection]} into ${ANIMATION_DIRECTION_LABELS[target]}.`);
  tryEdit(() => copySpriteAnimationTemplateDirection(template!, selectedClipName, activeDirection, target, mirror), 'Direction could not be copied.');
});

addFrameButton.addEventListener('click', () => {
  const clip = selectedClip(); const frame = selectedFrame();
  if (!template || !clip || !frame) return;
  const clone: SpriteAnimationTemplateFrame = {
    ...(frame.duration === undefined ? {} : { duration: frame.duration }),
    ...(frame.markers === undefined ? {} : { markers: [...frame.markers] }),
    layers: frame.layers.map((layer) => ({ ...layer, source: { ...layer.source }, transform: layerTransform(layer) })),
  };
  let next = addSpriteAnimationTemplateFrame(template, clip.name, clone, activeDirection);
  const last = clipFrames(clip).length;
  for (let index = last; index > selectedFrameIndex + 1; index--) {
    next = moveSpriteAnimationTemplateFrame(next, clip.name, index, -1, activeDirection);
  }
  selectedFrameIndex += 1; selectedLayerIndex = 0; currentPlaybackFrameIndex = selectedFrameIndex;
  postEdit(next);
});
deleteFrameButton.addEventListener('click', removeSelectedFrame);
moveFrameUpButton.addEventListener('click', () => moveFrameTo(selectedFrameIndex, selectedFrameIndex - 1));
moveFrameDownButton.addEventListener('click', () => moveFrameTo(selectedFrameIndex, selectedFrameIndex + 2));
frameDurationInput.addEventListener('change', () => {
  const value = numberValue(frameDurationInput);
  if (value !== null && value <= 0) { renderFrames(); return; }
  updateSelectedFrame(value === null ? { duration: undefined } : { duration: value });
});
frameMarkersInput.addEventListener('change', () => {
  const markers = [...new Set(frameMarkersInput.value.split(',').map((value) => value.trim()).filter(Boolean))];
  updateSelectedFrame(markers.length === 0 ? { markers: undefined } : { markers });
});
frameList.addEventListener('dragstart', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLLIElement>('.timeline-item');
  if (!item || !editable) return;
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

layerParameterSelect.addEventListener('change', () => updateSelectedLayer({ parameter: layerParameterSelect.value }));
layerVisibleInput.addEventListener('change', () => updateSelectedLayer({ visible: layerVisibleInput.checked }));
const sourceInputs = [layerSourceX, layerSourceY, layerSourceWidth, layerSourceHeight];
for (const input of sourceInputs) input.addEventListener('change', () => {
  const values = sourceInputs.map(numberValue);
  if (values.some((value) => value === null)) { renderLayers(); return; }
  updateSelectedLayer({ source: { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! } });
});
const transformInputs = [layerOffsetX, layerOffsetY, layerStretchX, layerStretchY, layerZoom, layerRotation, layerPivotX, layerPivotY];
for (const input of transformInputs) input.addEventListener('change', () => {
  const values = transformInputs.map(numberValue);
  if (values.some((value) => value === null)) { renderLayers(); return; }
  const [offsetX, offsetY, stretchX, stretchY, zoom, rotation, pivotX, pivotY] = values as number[];
  updateSelectedLayer({ transform: {
    offset: { x: offsetX!, y: offsetY! }, stretch: { x: stretchX!, y: stretchY! }, zoom: zoom!, rotation: rotation!,
    pivot: { x: pivotX!, y: pivotY! },
  } });
});
addLayerButton.addEventListener('click', () => {
  const frame = selectedFrame();
  if (!template || !frame || !atlasParameterId) return;
  selectedLayerIndex = frame.layers.length;
  tryEdit(() => addSpriteAnimationTemplateLayer(template!, selectedClipName, selectedFrameIndex, {
    parameter: atlasParameterId, source: { x: 0, y: 0, width: 1, height: 1 }, visible: true,
  }, activeDirection), 'Layer could not be added.');
});
moveLayerUpButton.addEventListener('click', () => {
  if (!template) return;
  const next = moveSpriteAnimationTemplateLayer(template, selectedClipName, selectedFrameIndex, selectedLayerIndex, -1, activeDirection);
  selectedLayerIndex--;
  postEdit(next);
});
moveLayerDownButton.addEventListener('click', () => {
  if (!template) return;
  const next = moveSpriteAnimationTemplateLayer(template, selectedClipName, selectedFrameIndex, selectedLayerIndex, 1, activeDirection);
  selectedLayerIndex++;
  postEdit(next);
});
deleteLayerButton.addEventListener('click', () => {
  if (!template) return;
  const index = selectedLayerIndex;
  tryEdit(() => {
    const next = removeSpriteAnimationTemplateLayer(template!, selectedClipName, selectedFrameIndex, index, activeDirection);
    selectedLayerIndex = Math.max(0, index - 1);
    return next;
  }, 'Layer could not be removed.');
});

atlasParameterSelect.addEventListener('change', () => {
  atlasParameterId = atlasParameterSelect.value;
  selectedParameterId = atlasParameterId;
  render();
});
atlasPreviewSelect.addEventListener('change', () => {
  activePreviewIds.set(atlasParameterId, atlasPreviewSelect.value);
  renderInputs();
  renderPreviewAndAtlas();
});
selectPreviewsButton.addEventListener('click', () => {
  if (atlasParameterId) vscode.postMessage({ type: 'selectPreviewImages', parameterId: atlasParameterId });
});
cropGridSize.addEventListener('change', drawAtlas);
snapGridInput.addEventListener('change', drawAtlas);
atlasCanvas.addEventListener('pointerdown', (event) => {
  const point = atlasPoint(event);
  if (!point) return;
  event.preventDefault();
  atlasPointer = { pointerId: event.pointerId, start: point, clientX: event.clientX, clientY: event.clientY, moved: false };
  atlasCanvas.setPointerCapture(event.pointerId);
});
atlasCanvas.addEventListener('pointermove', (event) => {
  const pointer = atlasPointer;
  if (!pointer || pointer.pointerId !== event.pointerId || !editable) return;
  if (!pointer.moved && Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) < CROP_DRAG_THRESHOLD) return;
  const point = atlasPoint(event);
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
  const point = atlasPoint(event);
  cropStart = null;
  cropEnd = null;
  if (!point || !currentAtlasImage) { drawAtlas(); return; }
  if (!pointer.moved) {
    if (!selectLayerAtPoint(point)) drawAtlas();
    return;
  }
  const crop = cropSpriteFrameFromDrag(pointer.start, point, currentAtlasImage.naturalWidth, currentAtlasImage.naturalHeight,
    Math.max(1, Math.floor(Number(cropGridSize.value) || 16)), snapGridInput.checked);
  if (crop) applyCrop(crop);
  else drawAtlas();
});
atlasCanvas.addEventListener('pointercancel', () => { atlasPointer = null; cropStart = null; cropEnd = null; drawAtlas(); });
playButton.addEventListener('click', togglePlayback);
resetButton.addEventListener('click', () => selectFrame(0));
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
  else if (key === 'end') selectFrame(Math.max(0, clipFrames().length - 1));
  else if (key === 'delete') removeSelectedFrame();
  else if (Object.hasOwn(directionKeys, key)) setActiveDirection(directionKeys[key]!);
  else return;
  event.preventDefault();
});

window.addEventListener('message', (event: MessageEvent<DocumentMessage | PreviewImagesSelectedMessage | { type: 'error'; message: string }>) => {
  const message = event.data;
  if (message.type === 'previewImagesSelected') {
    previewImages.set(message.parameterId, message.images);
    activePreviewIds.set(message.parameterId, message.images[0]?.id ?? '');
    imageCache.clear();
    render();
    return;
  }
  if (message.type === 'error') {
    saveStatus.textContent = 'Not saved';
    setDiagnostics(message.message);
    return;
  }
  if (message.type !== 'document') return;
  if (message.acknowledgedEditId !== undefined) {
    acknowledgedEditId = Math.max(acknowledgedEditId, message.acknowledgedEditId);
    if (message.acknowledgedEditId === latestLocalEditId) saveStatus.textContent = message.dirty ? 'Unsaved changes · Ctrl+S to save' : 'Saved';
  }
  if (message.acknowledgedEditId === undefined && latestLocalEditId > acknowledgedEditId) return;
  template = message.template;
  editable = message.editable;
  externalEditGeneration = message.externalEditGeneration;
  titleLabel.textContent = message.title;
  if (Object.hasOwn(message, 'previewImagesByParameter')) {
    previewImages = new Map(Object.entries(message.previewImagesByParameter ?? {}));
    activePreviewIds.clear();
    for (const [parameterId, images] of previewImages) if (images[0]) activePreviewIds.set(parameterId, images[0].id);
    imageCache.clear();
  }
  if (template) {
    if (!template.imageParameters.some((parameter) => parameter.id === selectedParameterId)) selectedParameterId = template.imageParameters[0]?.id ?? '';
    if (!template.imageParameters.some((parameter) => parameter.id === atlasParameterId)) atlasParameterId = selectedParameterId;
    if (!template.clips.some((clip) => clip.name === selectedClipName)) selectedClipName = template.clips[0]?.name ?? '';
  }
  setDiagnostics(message.diagnostics);
  if (!message.dirty && latestLocalEditId === acknowledgedEditId) saveStatus.textContent = 'Saved';
  render();
});

window.addEventListener('resize', () => renderPreviewAndAtlas());
vscode.postMessage({ type: 'ready' });
window.addEventListener('beforeunload', stopPlayback);
