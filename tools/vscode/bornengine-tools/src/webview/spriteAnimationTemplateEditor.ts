import {
  addSpriteAnimationTemplateClip,
  addSpriteAnimationTemplateFrame,
  addSpriteAnimationTemplateLayer,
  addSpriteAnimationTemplateParameter,
  moveSpriteAnimationTemplateClip,
  moveSpriteAnimationTemplateFrame,
  moveSpriteAnimationTemplateLayer,
  moveSpriteAnimationTemplateParameter,
  removeSpriteAnimationTemplateClip,
  removeSpriteAnimationTemplateFrame,
  removeSpriteAnimationTemplateLayer,
  removeSpriteAnimationTemplateParameter,
  updateSpriteAnimationTemplateClip,
  updateSpriteAnimationTemplateFrame,
  updateSpriteAnimationTemplateLayer,
  updateSpriteAnimationTemplateParameter,
} from '../animations/spriteAnimationTemplateEdits';
import { cropSpriteFrameFromDrag } from '../animations/animationFrames';
import { validateSpriteAnimationTemplate } from '../animations/spriteAnimationTemplateSchema';
import { drawSpriteAnimationTemplateFrame, getSpriteAnimationTemplateFrameIndex } from '../animations/spriteAnimationTemplatePreview';
import type {
  ResolvedSpriteAnimationTemplate,
  ResolvedSpriteAnimationTemplateClip,
  ResolvedSpriteAnimationTemplateFrame,
  ResolvedSpriteAnimationTemplateLayer,
  SpriteAnimationTemplate,
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
  template: ResolvedSpriteAnimationTemplate | null;
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

declare function acquireVsCodeApi(): HostApi;

const vscode = acquireVsCodeApi();
const titleLabel = getElement<HTMLElement>('#document-name');
const saveStatus = getElement<HTMLElement>('#save-status');
const diagnosticsPanel = getElement<HTMLElement>('#diagnostics');
const templateIdInput = getElement<HTMLInputElement>('#template-id');
const templateNameInput = getElement<HTMLInputElement>('#template-name');
const templateDescriptionInput = getElement<HTMLInputElement>('#template-description');
const inputList = getElement<HTMLOListElement>('#input-list');
const inputTagFilter = getElement<HTMLSelectElement>('#input-tag-filter');
const addInputButton = getElement<HTMLButtonElement>('#add-input');
const clipSelect = getElement<HTMLSelectElement>('#clip-select');
const addClipButton = getElement<HTMLButtonElement>('#add-clip');
const deleteClipButton = getElement<HTMLButtonElement>('#delete-clip');
const clipNameInput = getElement<HTMLInputElement>('#clip-name');
const clipFpsInput = getElement<HTMLInputElement>('#clip-fps');
const clipLoopSelect = getElement<HTMLSelectElement>('#clip-loop');
const canvasWidthInput = getElement<HTMLInputElement>('#canvas-width');
const canvasHeightInput = getElement<HTMLInputElement>('#canvas-height');
const frameList = getElement<HTMLOListElement>('#frame-list');
const addFrameButton = getElement<HTMLButtonElement>('#add-frame');
const deleteFrameButton = getElement<HTMLButtonElement>('#delete-frame');
const moveFrameUpButton = getElement<HTMLButtonElement>('#move-frame-up');
const moveFrameDownButton = getElement<HTMLButtonElement>('#move-frame-down');
const frameDurationInput = getElement<HTMLInputElement>('#frame-duration');
const frameMarkersInput = getElement<HTMLInputElement>('#frame-markers');
const layerList = getElement<HTMLOListElement>('#layer-list');
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
const frameScrubber = getElement<HTMLInputElement>('#frame-scrubber');
const atlasCanvas = getElement<HTMLCanvasElement>('#atlas-canvas');
const atlasDimensions = getElement<HTMLElement>('#atlas-dimensions');
const atlasParameterSelect = getElement<HTMLSelectElement>('#atlas-parameter');
const atlasPreviewSelect = getElement<HTMLSelectElement>('#atlas-preview');
const selectPreviewsButton = getElement<HTMLButtonElement>('#select-previews');
const cropGridSize = getElement<HTMLInputElement>('#crop-grid-size');
const snapGridInput = getElement<HTMLInputElement>('#snap-grid');
const cropModeButton = getElement<HTMLButtonElement>('#crop-mode');
const cropHint = getElement<HTMLElement>('#crop-hint');

let template: ResolvedSpriteAnimationTemplate | null = null;
let editable = false;
let selectedParameterId = '';
let selectedClipName = '';
let selectedFrameIndex = 0;
let selectedLayerIndex = 0;
let atlasParameterId = '';
let selectedTag = '';
let previewImages = new Map<string, PreviewImageAsset[]>();
let activePreviewIds = new Map<string, string>();
let imageCache = new Map<string, HTMLImageElement>();
let cropMode = false;
let cropStart: { x: number; y: number } | null = null;
let cropEnd: { x: number; y: number } | null = null;
let selectedCrop: { x: number; y: number; width: number; height: number } | null = null;
let currentAtlasImage: HTMLImageElement | null = null;
let playing = false;
let playbackStartedAt = 0;
let animationFrameRequest = 0;
let previewElapsed = 0;
let latestLocalEditId = 0;
let acknowledgedEditId = 0;
let externalEditGeneration = 0;
let currentPlaybackFrameIndex = 0;

function getElement<T extends HTMLElement>(selector: string): T {
  const element = window.document.querySelector<T>(selector);
  if (!element) throw new Error('Missing animation template editor element: ' + selector);
  return element;
}

function selectedClip(): ResolvedSpriteAnimationTemplateClip | null {
  return template?.clips.find((clip) => clip.name === selectedClipName) ?? null;
}

function selectedFrame(): ResolvedSpriteAnimationTemplateFrame | null {
  return selectedClip()?.frames[selectedFrameIndex] ?? null;
}

function selectedLayer(): ResolvedSpriteAnimationTemplateLayer | null {
  return selectedFrame()?.layers[selectedLayerIndex] ?? null;
}

function selectedParameter(): SpriteAnimationTemplateParameter | null {
  return template?.imageParameters.find((parameter) => parameter.id === selectedParameterId) ?? null;
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
  playButton.textContent = 'Play';
  if (animationFrameRequest !== 0) cancelAnimationFrame(animationFrameRequest);
  animationFrameRequest = 0;
}

function postEdit(next: SpriteAnimationTemplate): void {
  if (!editable) return;
  const checked = validateSpriteAnimationTemplate(next);
  if (!checked.ok) {
    setDiagnostics(checked.diagnostics.map((item) => `${item.path || '/'}: ${item.message}`).join('\n'));
    return;
  }
  template = checked.value;
  const editId = ++latestLocalEditId;
  stopPlayback();
  saveStatus.textContent = 'Saving…';
  vscode.postMessage({ type: 'edit', editId, externalEditGeneration, template });
  render();
}

function postParameterUpdate(parameterId: string, update: Partial<SpriteAnimationTemplateParameter>): void {
  if (!template) return;
  const nextId = update.id ?? parameterId;
  const next = updateSpriteAnimationTemplateParameter(template, parameterId, update);
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

function updateSelectedFrame(update: Partial<SpriteAnimationTemplate['clips'][number]['frames'][number]>): void {
  if (!template || !selectedClip()) return;
  postEdit(updateSpriteAnimationTemplateFrame(template, selectedClipName, selectedFrameIndex, update));
}

function updateSelectedLayer(update: Partial<SpriteAnimationTemplateLayer>): void {
  if (!template || !selectedClip() || !selectedLayer()) return;
  postEdit(updateSpriteAnimationTemplateLayer(template, selectedClipName, selectedFrameIndex, selectedLayerIndex, update));
}

function updateSelectedTransform(key: 'offset' | 'stretch' | 'zoom' | 'rotation' | 'pivot', x: number, y?: number): void {
  const layer = selectedLayer();
  if (!layer) return;
  const transform = { ...layer.transform };
  if (key === 'zoom' || key === 'rotation') {
    (transform as unknown as Record<string, unknown>)[key] = x;
  } else {
    (transform as unknown as Record<string, unknown>)[key] = { x, y: y ?? 0 };
  }
  updateSelectedLayer({ transform });
}

function renderInputs(): void {
  const allTags = [...new Set((template?.imageParameters ?? []).flatMap((parameter) => parameter.tags ?? []))].sort();
  const previousTag = selectedTag;
  inputTagFilter.replaceChildren(new Option('All tags', ''));
  for (const tag of allTags) inputTagFilter.add(new Option(tag, tag));
  if (allTags.includes(previousTag)) inputTagFilter.value = previousTag;
  else { selectedTag = ''; inputTagFilter.value = ''; }
  const visibleParameters = (template?.imageParameters ?? []).filter((parameter) =>
    !selectedTag || parameter.tags?.includes(selectedTag));
  inputList.replaceChildren();
  for (const parameter of visibleParameters) {
    const item = window.document.createElement('li');
    item.className = `input-card${parameter.id === selectedParameterId ? ' active' : ''}`;
    const heading = window.document.createElement('div');
    heading.className = 'card-heading';
    const selectButton = window.document.createElement('button');
    selectButton.type = 'button';
    selectButton.textContent = parameter.label || parameter.id;
    selectButton.title = parameter.id;
    selectButton.addEventListener('click', () => { selectedParameterId = parameter.id; atlasParameterId = parameter.id; render(); });
    heading.append(selectButton, inputActionButton('↑', 'Move input up', parameter.id, 'move-up'),
      inputActionButton('↓', 'Move input down', parameter.id, 'move-down'),
      inputActionButton('×', 'Remove input', parameter.id, 'remove'));
    const fields = window.document.createElement('div');
    fields.className = 'input-fields';
    fields.append(
      textField('ID', parameter.id, (value) => postParameterUpdate(parameter.id, { id: value.trim() })),
      textField('Label', parameter.label ?? '', (value) => postParameterUpdate(parameter.id, { label: value.trim() || undefined })),
      checkField('Required input', parameter.required, (value) => postParameterUpdate(parameter.id, { required: value })),
      textField('Tags', (parameter.tags ?? []).join(', '), (value) => postParameterUpdate(parameter.id, {
        tags: [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))],
      }), true),
    );
    const previewButton = window.document.createElement('button');
    previewButton.type = 'button';
    previewButton.textContent = previewImages.has(parameter.id) ? 'Choose / Replace Preview Images' : 'Choose Preview Images';
    previewButton.addEventListener('click', () => vscode.postMessage({ type: 'selectPreviewImages', parameterId: parameter.id }));
    fields.append(previewButton);
    const images = previewImages.get(parameter.id) ?? [];
    if (images.length > 0) {
      const previews = window.document.createElement('div');
      previews.className = 'preview-choices';
      for (const image of images) {
        const row = window.document.createElement('label');
        row.className = 'preview-choice';
        const thumb = window.document.createElement('img');
        thumb.className = 'preview-thumb';
        thumb.alt = '';
        thumb.src = image.uri;
        const radio = window.document.createElement('input');
        radio.type = 'radio';
        radio.name = `active-preview-${parameter.id}`;
        radio.checked = activePreview(parameter.id)?.id === image.id;
        radio.addEventListener('change', () => { activePreviewIds.set(parameter.id, image.id); renderPreviewAndAtlas(); });
        const name = window.document.createElement('span');
        name.textContent = `${image.name} · ${image.size.width}×${image.size.height}`;
        row.append(radio, thumb, name);
        previews.append(row);
      }
      fields.append(previews);
    }
    item.append(heading, fields);
    inputList.append(item);
  }
  addInputButton.disabled = !editable;
}

function inputActionButton(label: string, title: string, parameterId: string, action: string): HTMLButtonElement {
  const button = window.document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('data-parameter', parameterId);
  button.setAttribute('data-action', action);
  return button;
}

function textField(label: string, value: string, changed: (value: string) => void, wide = false): HTMLLabelElement {
  const field = window.document.createElement('label');
  field.className = wide ? 'wide' : '';
  field.append(window.document.createTextNode(label));
  const input = window.document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => changed(input.value));
  field.append(input);
  return field;
}

function checkField(label: string, checked: boolean, changed: (checked: boolean) => void): HTMLLabelElement {
  const field = window.document.createElement('label');
  field.className = 'check-field';
  const input = window.document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => changed(input.checked));
  field.append(input, window.document.createTextNode(label));
  return field;
}

function renderClip(): void {
  const clips = template?.clips ?? [];
  if (!clips.some((clip) => clip.name === selectedClipName)) selectedClipName = clips[0]?.name ?? '';
  clipSelect.replaceChildren(...clips.map((clip) => new Option(clip.name, clip.name, false, clip.name === selectedClipName)));
  const clip = selectedClip();
  const enabled = editable && clip !== null;
  for (const input of [clipNameInput, clipFpsInput, canvasWidthInput, canvasHeightInput, clipLoopSelect]) input.disabled = !enabled;
  addClipButton.disabled = !editable;
  deleteClipButton.disabled = !enabled || clips.length <= 1;
  if (!clip) return;
  clipNameInput.value = clip.name;
  clipFpsInput.value = String(clip.fps);
  clipLoopSelect.value = clip.loop;
  canvasWidthInput.value = String(clip.canvasSize.width);
  canvasHeightInput.value = String(clip.canvasSize.height);
}

function renderFrames(): void {
  const clip = selectedClip();
  const frames = clip?.frames ?? [];
  selectedFrameIndex = Math.max(0, Math.min(selectedFrameIndex, frames.length - 1));
  frameList.replaceChildren();
  frames.forEach((frame, index) => {
    const item = window.document.createElement('li');
    item.dataset.frameIndex = String(index);
    item.className = `frame-card${index === selectedFrameIndex ? ' active' : ''}`;
    const row = window.document.createElement('div');
    row.className = 'frame-row';
    const select = window.document.createElement('button');
    select.type = 'button';
    select.textContent = `${String(index + 1).padStart(2, '0')} · ${frame.layers.length} layer${frame.layers.length === 1 ? '' : 's'}`;
    select.addEventListener('click', () => { selectedFrameIndex = index; selectedLayerIndex = 0; currentPlaybackFrameIndex = index; render(); });
    row.append(select);
    item.append(row);
    frameList.append(item);
  });
  if (clip && frames.length > 0) {
    const frame = frames[selectedFrameIndex]!;
    frameDurationInput.value = frame.duration === undefined ? '' : String(frame.duration);
    frameMarkersInput.value = (frame.markers ?? []).join(', ');
  } else {
    frameDurationInput.value = '';
    frameMarkersInput.value = '';
  }
  const enabled = editable && clip !== null && frames.length > 0;
  for (const input of [frameDurationInput, frameMarkersInput]) input.disabled = !enabled;
  addFrameButton.disabled = !enabled;
  deleteFrameButton.disabled = !enabled || frames.length <= 1;
  moveFrameUpButton.disabled = !enabled || selectedFrameIndex <= 0;
  moveFrameDownButton.disabled = !enabled || selectedFrameIndex >= frames.length - 1;
  frameScrubber.max = String(Math.max(0, frames.length - 1));
  frameScrubber.value = String(currentPlaybackFrameIndex);
}

function renderLayers(): void {
  const frame = selectedFrame();
  const layers = frame?.layers ?? [];
  selectedLayerIndex = Math.max(0, Math.min(selectedLayerIndex, layers.length - 1));
  layerList.replaceChildren();
  layers.forEach((layer, index) => {
    const item = window.document.createElement('li');
    item.dataset.layerIndex = String(index);
    item.className = `layer-card${index === selectedLayerIndex ? ' active' : ''}`;
    const row = window.document.createElement('div');
    row.className = 'layer-row';
    const select = window.document.createElement('button');
    select.type = 'button';
    const parameter = template?.imageParameters.find((entry) => entry.id === layer.parameter);
    select.textContent = `${String(index + 1).padStart(2, '0')} · ${parameter?.label || layer.parameter}${layer.visible === false ? ' · hidden' : ''}`;
    select.addEventListener('click', () => { selectedLayerIndex = index; render(); });
    row.append(select);
    item.append(row);
    layerList.append(item);
  });
  const layer = selectedLayer();
  const enabled = editable && layer !== null;
  const inputs: HTMLInputElement[] = [layerVisibleInput, layerSourceX, layerSourceY, layerSourceWidth, layerSourceHeight,
    layerOffsetX, layerOffsetY, layerStretchX, layerStretchY, layerZoom, layerRotation, layerPivotX, layerPivotY];
  for (const input of inputs) input.disabled = !enabled;
  layerParameterSelect.disabled = !enabled;
  parameterOptions(layerParameterSelect, layer?.parameter ?? selectedParameterId);
  addLayerButton.disabled = !editable || !frame || !template?.imageParameters.length;
  moveLayerUpButton.disabled = !enabled || selectedLayerIndex <= 0;
  moveLayerDownButton.disabled = !enabled || selectedLayerIndex >= layers.length - 1;
  deleteLayerButton.disabled = !enabled || layers.length <= 1;
  if (!layer) return;
  layerVisibleInput.checked = layer.visible !== false;
  layerSourceX.value = String(layer.source.x);
  layerSourceY.value = String(layer.source.y);
  layerSourceWidth.value = String(layer.source.width);
  layerSourceHeight.value = String(layer.source.height);
  layerOffsetX.value = String(layer.transform.offset.x);
  layerOffsetY.value = String(layer.transform.offset.y);
  layerStretchX.value = String(layer.transform.stretch.x);
  layerStretchY.value = String(layer.transform.stretch.y);
  layerZoom.value = String(layer.transform.zoom);
  layerRotation.value = String(layer.transform.rotation);
  layerPivotX.value = String(layer.transform.pivot.x);
  layerPivotY.value = String(layer.transform.pivot.y);
}

function renderAtlasSelectors(): void {
  const parameters = template?.imageParameters ?? [];
  if (!parameters.some((parameter) => parameter.id === atlasParameterId)) atlasParameterId = parameters[0]?.id ?? '';
  if (!parameters.some((parameter) => parameter.id === selectedParameterId)) selectedParameterId = parameters[0]?.id ?? '';
  parameterOptions(atlasParameterSelect, atlasParameterId);
  parameterOptions(layerParameterSelect, selectedLayer()?.parameter ?? selectedParameterId);
  const images = atlasParameterId ? previewImages.get(atlasParameterId) ?? [] : [];
  const active = activePreview(atlasParameterId);
  atlasPreviewSelect.replaceChildren(...images.map((image) => new Option(`${image.name} · ${image.size.width}×${image.size.height}`, image.id,
    false, image.id === active?.id)));
  atlasParameterSelect.disabled = parameters.length === 0;
  atlasPreviewSelect.disabled = images.length === 0;
  selectPreviewsButton.disabled = !editable || !atlasParameterId;
}

function getImage(asset: PreviewImageAsset | null): HTMLImageElement | null {
  if (!asset) return null;
  const cached = imageCache.get(asset.id);
  if (cached) return cached;
  const image = new Image();
  imageCache.set(asset.id, image);
  image.onload = () => { renderPreviewAndAtlas(); renderInputs(); };
  image.onerror = () => { imageCache.delete(asset.id); cropHint.textContent = `Could not decode ${asset.name}.`; };
  image.src = asset.uri;
  return image;
}

function imageLookup(): Record<string, { image: HTMLImageElement } | undefined> {
  const result: Record<string, { image: HTMLImageElement } | undefined> = Object.create(null);
  for (const parameter of template?.imageParameters ?? []) {
    const asset = activePreview(parameter.id);
    const image = getImage(asset);
    if (image?.complete && image.naturalWidth > 0) result[parameter.id] = { image };
  }
  return result;
}

function drawPreviewFrame(frameIndex: number): void {
  const clip = selectedClip();
  if (!clip) return;
  const context = previewCanvas.getContext('2d');
  if (!context) return;
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const rect = previewCanvas.getBoundingClientRect();
  const cssWidth = Math.max(210, rect.width || 480);
  const cssHeight = Math.max(220, rect.height || 360);
  const width = Math.round(cssWidth * pixelRatio);
  const height = Math.round(cssHeight * pixelRatio);
  if (previewCanvas.width !== width || previewCanvas.height !== height) {
    previewCanvas.width = width;
    previewCanvas.height = height;
  }
  context.clearRect(0, 0, width, height);
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
  const frame = clip.frames[frameIndex];
  if (!frame) return;
  drawSpriteAnimationTemplateFrame(context, clip, frame, imageLookup(), { x, y, scale });
}

function renderFrameThumbnails(): void {
  for (const item of frameList.querySelectorAll<HTMLLIElement>('.frame-card')) {
    const index = Number(item.dataset.frameIndex);
    const clip = selectedClip();
    const frame = clip?.frames[index];
    if (!clip || !frame) continue;
    const canvas = window.document.createElement('canvas');
    canvas.width = 44;
    canvas.height = 44;
    const context = canvas.getContext('2d');
    if (!context) continue;
    const scale = Math.min(40 / clip.canvasSize.width, 40 / clip.canvasSize.height);
    drawSpriteAnimationTemplateFrame(context, clip, frame, imageLookup(), {
      x: (44 - clip.canvasSize.width * scale) / 2,
      y: (44 - clip.canvasSize.height * scale) / 2,
      scale,
    });
    const row = item.querySelector('.frame-row');
    if (!row || row.querySelector('canvas')) continue;
    canvas.className = 'frame-thumb';
    row.prepend(canvas);
  }
}

function renderPreviewAndAtlas(): void {
  const clip = selectedClip();
  const frames = clip?.frames ?? [];
  const index = playing ? currentPlaybackFrameIndex : selectedFrameIndex;
  drawPreviewFrame(index);
  frameLabel.textContent = clip && frames[index] ? `${clip.name} · Frame ${index + 1} of ${frames.length}` : '—';
  if (!playing) frameScrubber.value = String(selectedFrameIndex);
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
    cropHint.textContent = template?.imageParameters.length ? 'Choose preview images for this input to crop layers.' : 'Add an image input first.';
    return;
  }
  currentAtlasImage = image;
  if (atlasCanvas.width !== image.naturalWidth || atlasCanvas.height !== image.naturalHeight) {
    atlasCanvas.width = image.naturalWidth;
    atlasCanvas.height = image.naturalHeight;
    atlasCanvas.style.width = `${image.naturalWidth}px`;
    atlasCanvas.style.height = `${image.naturalHeight}px`;
  }
  const context = atlasCanvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const grid = Math.max(1, Math.floor(Number(cropGridSize.value) || 16));
  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= atlasCanvas.width; x += grid) { context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, atlasCanvas.height); }
  for (let y = 0; y <= atlasCanvas.height; y += grid) { context.moveTo(0, y + 0.5); context.lineTo(atlasCanvas.width, y + 0.5); }
  context.stroke();
  const activeLayer = selectedLayer();
  if (activeLayer?.parameter === atlasParameterId) {
    context.strokeStyle = '#ffd166';
    context.lineWidth = 2;
    context.strokeRect(activeLayer.source.x + 1, activeLayer.source.y + 1, activeLayer.source.width - 2, activeLayer.source.height - 2);
  }
  if (cropStart && cropEnd) {
    const crop = cropSpriteFrameFromDrag(cropStart, cropEnd, image.naturalWidth, image.naturalHeight, grid, snapGridInput.checked);
    if (crop) {
      context.strokeStyle = '#8bd3ff';
      context.fillStyle = 'rgba(76, 169, 220, 0.18)';
      context.lineWidth = 2;
      context.fillRect(crop.x, crop.y, crop.width, crop.height);
      context.strokeRect(crop.x + 1, crop.y + 1, crop.width - 2, crop.height - 2);
    }
  }
  context.restore();
  atlasDimensions.textContent = `${image.naturalWidth}×${image.naturalHeight} · ${asset.name}`;
  cropHint.textContent = cropMode ? `Drag a crop for ${atlasParameterId}.` : 'Choose a preview and drag a rectangle to add it as a layer.';
}

function render(): void {
  if (!template) {
    setDiagnostics(diagnosticsPanel.textContent || 'Template JSON is invalid. Fix it in the text editor to continue.');
    return;
  }
  titleLabel.textContent = template.name || 'Sprite Animation Template';
  templateIdInput.value = template.id;
  templateNameInput.value = template.name;
  templateDescriptionInput.value = template.description ?? '';
  templateIdInput.disabled = !editable;
  templateNameInput.disabled = !editable;
  templateDescriptionInput.disabled = !editable;
  renderInputs();
  renderClip();
  renderAtlasSelectors();
  renderFrames();
  renderLayers();
  const clip = selectedClip();
  const frames = clip?.frames ?? [];
  frameScrubber.disabled = !editable || frames.length <= 1;
  playButton.disabled = !editable || frames.length <= 1;
  resetButton.disabled = !editable;
  atlasCanvas.classList.toggle('crop-mode', cropMode);
  renderPreviewAndAtlas();
}

function frameDurationSeconds(frame: SpriteAnimationTemplate['clips'][number]['frames'][number], fps: number): number {
  return frame.duration ?? 1 / fps;
}

function playbackTick(now: number): void {
  if (!playing) return;
  const clip = selectedClip();
  if (!clip) { stopPlayback(); return; }
  const frame = getSpriteAnimationTemplateFrameIndex(clip, previewElapsed + Math.max(0, now - playbackStartedAt) / 1000);
  currentPlaybackFrameIndex = frame.index;
  drawPreviewFrame(currentPlaybackFrameIndex);
  frameLabel.textContent = `${clip.name} · Frame ${currentPlaybackFrameIndex + 1} of ${clip.frames.length}`;
  if (frame.done) {
    previewElapsed = clip.frames.reduce((sum, item) => sum + frameDurationSeconds(item, clip.fps), 0);
    stopPlayback();
    currentPlaybackFrameIndex = clip.frames.length - 1;
    renderPreviewAndAtlas();
    return;
  }
  animationFrameRequest = requestAnimationFrame(playbackTick);
}

function togglePlayback(): void {
  const clip = selectedClip();
  if (!clip || clip.frames.length <= 1) return;
  if (playing) {
    previewElapsed += Math.max(0, performance.now() - playbackStartedAt) / 1000;
    stopPlayback();
    return;
  }
  if (previewElapsed === 0) previewElapsed = clip.frames.slice(0, selectedFrameIndex)
    .reduce((sum, frame) => sum + frameDurationSeconds(frame, clip.fps), 0);
  playbackStartedAt = performance.now();
  playing = true;
  playButton.textContent = 'Pause';
  animationFrameRequest = requestAnimationFrame(playbackTick);
}

function atlasPoint(event: PointerEvent): { x: number; y: number } | null {
  if (!currentAtlasImage) return null;
  const rect = atlasCanvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: (event.clientX - rect.left) * currentAtlasImage.naturalWidth / rect.width,
    y: (event.clientY - rect.top) * currentAtlasImage.naturalHeight / rect.height,
  };
}

function cropPointerDown(event: PointerEvent): void {
  if (!cropMode || !currentAtlasImage || !atlasParameterId) return;
  const point = atlasPoint(event);
  if (!point) return;
  atlasCanvas.setPointerCapture(event.pointerId);
  cropStart = point;
  cropEnd = point;
  drawAtlas();
}

function cropPointerMove(event: PointerEvent): void {
  if (!cropStart) return;
  const point = atlasPoint(event);
  if (!point) return;
  cropEnd = point;
  drawAtlas();
}

function cropPointerUp(event: PointerEvent): void {
  if (!cropStart || !currentAtlasImage) return;
  const point = atlasPoint(event);
  const start = cropStart;
  cropStart = null;
  cropEnd = null;
  atlasCanvas.releasePointerCapture(event.pointerId);
  if (!point || !template || !selectedClip() || !selectedFrame()) { drawAtlas(); return; }
  const crop = cropSpriteFrameFromDrag(start, point, currentAtlasImage.naturalWidth, currentAtlasImage.naturalHeight,
    Math.max(1, Math.floor(Number(cropGridSize.value) || 16)), snapGridInput.checked);
  if (!crop) { drawAtlas(); return; }
  const next = addSpriteAnimationTemplateLayer(template, selectedClipName, selectedFrameIndex, {
    parameter: atlasParameterId,
    source: crop,
    visible: true,
    transform: { offset: { x: 0, y: 0 }, stretch: { x: 1, y: 1 }, zoom: 1, rotation: 0, pivot: { x: 0.5, y: 0.5 } },
  });
  selectedLayerIndex = selectedFrame()!.layers.length;
  selectedParameterId = atlasParameterId;
  selectedCrop = crop;
  postEdit(next);
}

function numberValue(input: HTMLInputElement): number | null {
  if (input.value.trim().length === 0) return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

addInputButton.addEventListener('click', () => {
  if (!template) return;
  let suffix = template.imageParameters.length + 1;
  let id = `input-${suffix}`;
  while (template.imageParameters.some((parameter) => parameter.id === id)) id = `input-${++suffix}`;
  selectedParameterId = id;
  atlasParameterId = id;
  postEdit(addSpriteAnimationTemplateParameter(template, { id, required: true }));
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
inputList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest<HTMLButtonElement>('button[data-action]');
  if (!button || !template) return;
  const parameterId = button.dataset.parameter ?? '';
  const action = button.dataset.action;
  try {
    if (action === 'move-up') postEdit(moveSpriteAnimationTemplateParameter(template, parameterId, -1));
    if (action === 'move-down') postEdit(moveSpriteAnimationTemplateParameter(template, parameterId, 1));
    if (action === 'remove') {
      const next = removeSpriteAnimationTemplateParameter(template, parameterId);
      previewImages.delete(parameterId);
      activePreviewIds.delete(parameterId);
      postEdit(next);
    }
  } catch (error) {
    setDiagnostics(error instanceof Error ? error.message : 'The input change could not be applied.');
  }
});

clipSelect.addEventListener('change', () => {
  selectedClipName = clipSelect.value;
  selectedFrameIndex = 0;
  selectedLayerIndex = 0;
  currentPlaybackFrameIndex = 0;
  previewElapsed = 0;
  render();
});
clipNameInput.addEventListener('change', () => {
  const clip = selectedClip();
  if (!template || !clip) return;
  const name = clipNameInput.value.trim();
  if (!name) { renderClip(); return; }
  try {
    const next = updateSpriteAnimationTemplateClip(template, clip.name, { name });
    selectedClipName = name;
    postEdit(next);
  } catch (error) { setDiagnostics(error instanceof Error ? error.message : 'Clip could not be renamed.'); renderClip(); }
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
addClipButton.addEventListener('click', () => {
  if (!template) return;
  const baseName = 'clip'; let name = baseName; let suffix = 2;
  while (template.clips.some((clip) => clip.name === name)) name = `${baseName}-${suffix++}`;
  const parameter = template.imageParameters[0];
  if (!parameter) return;
  const clip = {
    name, fps: 8, loop: 'loop' as const, canvasSize: { width: 32, height: 32 },
    frames: [{ layers: [{ parameter: parameter.id, source: { x: 0, y: 0, width: 1, height: 1 } }] }],
  };
  selectedClipName = name; selectedFrameIndex = 0; selectedLayerIndex = 0; previewElapsed = 0;
  postEdit(addSpriteAnimationTemplateClip(template, clip));
});
deleteClipButton.addEventListener('click', () => {
  const clip = selectedClip(); if (!template || !clip) return;
  try {
    const next = removeSpriteAnimationTemplateClip(template, clip.name);
    selectedClipName = next.clips[0]?.name ?? '';
    selectedFrameIndex = 0; selectedLayerIndex = 0; previewElapsed = 0;
    postEdit(next);
  } catch (error) { setDiagnostics(error instanceof Error ? error.message : 'Clip could not be removed.'); }
});

addFrameButton.addEventListener('click', () => {
  const clip = selectedClip(); const frame = selectedFrame();
  if (!template || !clip || !frame) return;
  const clone = {
    ...(frame.duration === undefined ? {} : { duration: frame.duration }),
    ...(frame.markers === undefined ? {} : { markers: [...frame.markers] }),
    layers: frame.layers.map((layer) => ({ ...layer, source: { ...layer.source }, transform: { ...layer.transform } })),
  };
  selectedFrameIndex = clip.frames.length; selectedLayerIndex = 0; currentPlaybackFrameIndex = selectedFrameIndex;
  postEdit(addSpriteAnimationTemplateFrame(template, clip.name, clone));
});
deleteFrameButton.addEventListener('click', () => {
  const clip = selectedClip(); if (!template || !clip) return;
  try { const next = removeSpriteAnimationTemplateFrame(template, clip.name, selectedFrameIndex); selectedFrameIndex = Math.max(0, selectedFrameIndex - 1); selectedLayerIndex = 0; postEdit(next); }
  catch (error) { setDiagnostics(error instanceof Error ? error.message : 'Frame could not be removed.'); }
});
moveFrameUpButton.addEventListener('click', () => {
  const clip = selectedClip(); if (template && clip) { const next = moveSpriteAnimationTemplateFrame(template, clip.name, selectedFrameIndex, -1); selectedFrameIndex--; postEdit(next); }
});
moveFrameDownButton.addEventListener('click', () => {
  const clip = selectedClip(); if (template && clip) { const next = moveSpriteAnimationTemplateFrame(template, clip.name, selectedFrameIndex, 1); selectedFrameIndex++; postEdit(next); }
});
frameDurationInput.addEventListener('change', () => {
  const value = numberValue(frameDurationInput);
  updateSelectedFrame(value === null ? { duration: undefined } : { duration: value });
});
frameMarkersInput.addEventListener('change', () => {
  const markers = [...new Set(frameMarkersInput.value.split(',').map((value) => value.trim()).filter(Boolean))];
  updateSelectedFrame(markers.length === 0 ? { markers: undefined } : { markers });
});
frameList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const item = target.closest<HTMLLIElement>('.frame-card');
  if (!item) return;
  selectedFrameIndex = Number(item.dataset.frameIndex);
  selectedLayerIndex = 0;
  currentPlaybackFrameIndex = selectedFrameIndex;
  previewElapsed = 0;
  render();
});

layerParameterSelect.addEventListener('change', () => updateSelectedLayer({ parameter: layerParameterSelect.value }));
layerVisibleInput.addEventListener('change', () => updateSelectedLayer({ visible: layerVisibleInput.checked }));
const sourceInputs = [layerSourceX, layerSourceY, layerSourceWidth, layerSourceHeight];
for (const input of sourceInputs) input.addEventListener('change', () => {
  const values = sourceInputs.map(numberValue);
  if (values.some((value) => value === null)) return;
  updateSelectedLayer({ source: { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! } });
});
const transformInputs = [layerOffsetX, layerOffsetY, layerStretchX, layerStretchY, layerZoom, layerRotation, layerPivotX, layerPivotY];
for (const input of transformInputs) input.addEventListener('change', () => {
  const values = transformInputs.map(numberValue);
  if (values.some((value) => value === null)) return;
  const [offsetX, offsetY, stretchX, stretchY, zoom, rotation, pivotX, pivotY] = values as number[];
  const layer = selectedLayer(); if (!layer) return;
  updateSelectedLayer({ transform: {
    offset: { x: offsetX!, y: offsetY! }, stretch: { x: stretchX!, y: stretchY! }, zoom: zoom!, rotation: rotation!,
    pivot: { x: pivotX!, y: pivotY! },
  } });
});
addLayerButton.addEventListener('click', () => {
  const clip = selectedClip(); if (!template || !clip || !selectedFrame() || !atlasParameterId) return;
  const crop = selectedCrop ?? { x: 0, y: 0, width: 1, height: 1 };
  const currentLength = selectedFrame()!.layers.length;
  const next = addSpriteAnimationTemplateLayer(template, clip.name, selectedFrameIndex, {
    parameter: atlasParameterId, source: crop, visible: true,
    transform: { offset: { x: 0, y: 0 }, stretch: { x: 1, y: 1 }, zoom: 1, rotation: 0, pivot: { x: 0.5, y: 0.5 } },
  });
  selectedLayerIndex = currentLength;
  postEdit(next);
});
moveLayerUpButton.addEventListener('click', () => {
  const clip = selectedClip(); if (template && clip) { const next = moveSpriteAnimationTemplateLayer(template, clip.name, selectedFrameIndex, selectedLayerIndex, -1); selectedLayerIndex--; postEdit(next); }
});
moveLayerDownButton.addEventListener('click', () => {
  const clip = selectedClip(); if (template && clip) { const next = moveSpriteAnimationTemplateLayer(template, clip.name, selectedFrameIndex, selectedLayerIndex, 1); selectedLayerIndex++; postEdit(next); }
});
deleteLayerButton.addEventListener('click', () => {
  const clip = selectedClip(); if (!template || !clip) return;
  try { postEdit(removeSpriteAnimationTemplateLayer(template, clip.name, selectedFrameIndex, selectedLayerIndex)); selectedLayerIndex = Math.max(0, selectedLayerIndex - 1); }
  catch (error) { setDiagnostics(error instanceof Error ? error.message : 'Layer could not be removed.'); }
});
layerList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const item = target.closest<HTMLLIElement>('.layer-card');
  if (!item) return;
  selectedLayerIndex = Number(item.dataset.layerIndex);
  render();
});

atlasParameterSelect.addEventListener('change', () => {
  atlasParameterId = atlasParameterSelect.value;
  selectedParameterId = atlasParameterId;
  selectedCrop = null;
  renderAtlasSelectors(); renderInputs(); drawAtlas();
});
atlasPreviewSelect.addEventListener('change', () => {
  activePreviewIds.set(atlasParameterId, atlasPreviewSelect.value);
  drawAtlas(); renderPreviewAndAtlas();
});
selectPreviewsButton.addEventListener('click', () => {
  if (atlasParameterId) vscode.postMessage({ type: 'selectPreviewImages', parameterId: atlasParameterId });
});
cropModeButton.addEventListener('click', () => {
  cropMode = !cropMode;
  cropModeButton.textContent = cropMode ? 'Cancel crop' : 'Crop layer';
  atlasCanvas.classList.toggle('crop-mode', cropMode);
  drawAtlas();
});
cropGridSize.addEventListener('change', drawAtlas);
snapGridInput.addEventListener('change', drawAtlas);
atlasCanvas.addEventListener('pointerdown', cropPointerDown);
atlasCanvas.addEventListener('pointermove', cropPointerMove);
atlasCanvas.addEventListener('pointerup', cropPointerUp);
atlasCanvas.addEventListener('pointercancel', () => { cropStart = null; cropEnd = null; drawAtlas(); });
playButton.addEventListener('click', togglePlayback);
resetButton.addEventListener('click', () => {
  stopPlayback(); previewElapsed = 0; selectedFrameIndex = 0; currentPlaybackFrameIndex = 0; selectedLayerIndex = 0; render();
});
frameScrubber.addEventListener('input', () => {
  stopPlayback(); previewElapsed = 0;
  selectedFrameIndex = Number(frameScrubber.value);
  currentPlaybackFrameIndex = selectedFrameIndex;
  selectedLayerIndex = 0;
  render();
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
    if (message.acknowledgedEditId === latestLocalEditId) saveStatus.textContent = message.dirty ? 'Saved to document' : 'Saved';
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
  if (!message.dirty && latestLocalEditId === acknowledgedEditId) saveStatus.textContent = 'Ready';
  render();
});

vscode.postMessage({ type: 'ready' });
window.addEventListener('beforeunload', stopPlayback);
