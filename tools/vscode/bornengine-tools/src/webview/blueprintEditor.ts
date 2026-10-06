import {
  applyBlueprintEdit,
  type BlueprintEditOperation,
} from '../blueprints/blueprintEdits';
import type {
  BlueprintConnection,
  BlueprintDocument,
  BlueprintExecutionPin,
  BlueprintFieldDefinition,
  BlueprintGraphNode,
  BlueprintNodeDefinition,
  BlueprintTemplate,
} from '../blueprints/blueprintSchema';

declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const OMIT_VALUE = Symbol('omit-blueprint-value');

type DocumentMessage = {
  type: 'document';
  blueprint: BlueprintDocument | null;
  template: BlueprintTemplate | null;
  editable: boolean;
  sourceText: string;
  diagnostics: string;
  dirty: boolean;
  title: string;
  revision: number;
  acknowledgedEditId?: number;
};

type EditorState = {
  blueprint: BlueprintDocument | null;
  template: BlueprintTemplate | null;
  editable: boolean;
  sourceText: string;
  diagnostics: string;
  dirty: boolean;
  title: string;
  revision: number;
  editId: number;
};

type EndpointChoice = { nodeId: string; pinId: string };

let state: EditorState = {
  blueprint: null,
  template: null,
  editable: false,
  sourceText: '',
  diagnostics: '',
  dirty: false,
  title: 'Blueprint',
  revision: 0,
  editId: 0,
};
let outgoingTimer: number | undefined;
let localError = '';
let dragState: { instanceId: string; pointerId: number; startX: number; startY: number; originX: number; originY: number } | null = null;

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone(document: BlueprintDocument): BlueprintDocument {
  return structuredClone(document);
}

function pathValue(root: unknown, keys: readonly string[]): unknown {
  let current = root;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function applyLocalEdit(edit: BlueprintEditOperation): void {
  if (!state.blueprint || !state.editable) return;
  state.blueprint = applyBlueprintEdit(state.blueprint, edit);
  localError = '';
  render();
  scheduleSend();
}

function scheduleSend(): void {
  if (!state.blueprint || !state.editable) return;
  window.clearTimeout(outgoingTimer);
  outgoingTimer = window.setTimeout(() => {
    if (!state.blueprint) return;
    state.editId++;
    vscode.postMessage({
      type: 'edit',
      editId: state.editId,
      revision: state.revision,
      blueprint: state.blueprint,
    });
  }, 90);
}

function defaultValue(field: BlueprintFieldDefinition): unknown | typeof OMIT_VALUE {
  if (field.defaultValue !== undefined) return structuredClone(field.defaultValue);
  switch (field.type) {
    case 'string': return field.required ? '' : OMIT_VALUE;
    case 'number':
    case 'integer': return field.required ? 0 : OMIT_VALUE;
    case 'boolean': return field.required ? false : OMIT_VALUE;
    case 'enum': return field.required ? field.enumValues?.[0] ?? '' : OMIT_VALUE;
    case 'array': return field.required ? [] : OMIT_VALUE;
    case 'object': {
      const result: Record<string, unknown> = {};
      for (const property of field.properties ?? []) {
        const value = defaultValue(property);
        if (value !== OMIT_VALUE) result[property.id] = value;
      }
      return result;
    }
  }
}

function displayValue(field: BlueprintFieldDefinition, value: unknown): unknown {
  if (value !== undefined) return value;
  const initial = defaultValue(field);
  return initial === OMIT_VALUE ? undefined : initial;
}

function fieldEditor(field: BlueprintFieldDefinition, value: unknown, keys: readonly string[]): string {
  const path = escapeHtml(JSON.stringify(keys));
  const label = `<label for="">${escapeHtml(field.label)}${field.required ? ' <span aria-hidden="true">*</span>' : ''}</label>`;
  const description = field.description ? `<span class="field-description">${escapeHtml(field.description)}</span>` : '';
  const clear = field.required ? '' : `<button type="button" data-clear-value="${path}" title="Remove this optional value">Clear</button>`;
  const shown = displayValue(field, value);

  if (field.type === 'object') {
    const objectValue = isRecord(shown) ? shown : {};
    const nested = (field.properties ?? []).map((child) => fieldEditor(child, objectValue[child.id], [...keys, child.id])).join('');
    return `<div class="field-row"><label>${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>${description}<div class="field-nested">${nested || '<span class="muted">No properties</span>'}</div>${clear}</div>`;
  }

  if (field.type === 'enum') {
    const options = (field.enumValues ?? []).map((choice) => `<option value="${escapeHtml(choice)}" ${shown === choice ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('');
    return `<div class="field-row">${label}${description}<div class="field-control"><select data-value-path="${path}" data-value-type="enum" ${state.editable ? '' : 'disabled'}>${options}</select>${clear}</div></div>`;
  }
  if (field.type === 'boolean') {
    return `<div class="field-row">${label}${description}<div class="field-control"><input data-value-path="${path}" data-value-type="boolean" type="checkbox" ${shown === true ? 'checked' : ''} ${state.editable ? '' : 'disabled'}>${clear}</div></div>`;
  }
  if (field.type === 'number' || field.type === 'integer') {
    const min = field.minimum === undefined ? '' : `min="${field.minimum}"`;
    const max = field.maximum === undefined ? '' : `max="${field.maximum}"`;
    const step = field.type === 'integer' ? '1' : 'any';
    const content = typeof shown === 'number' ? String(shown) : '';
    return `<div class="field-row">${label}${description}<div class="field-control"><input data-value-path="${path}" data-value-type="${field.type}" type="number" step="${step}" ${min} ${max} value="${escapeHtml(content)}" ${state.editable ? '' : 'disabled'}>${clear}</div></div>`;
  }
  if (field.type === 'array') {
    const content = Array.isArray(shown) ? JSON.stringify(shown, null, 2) : '';
    return `<div class="field-row">${label}${description}<div class="field-control column"><textarea data-value-path="${path}" data-value-type="json" rows="4" spellcheck="false" ${state.editable ? '' : 'disabled'}>${escapeHtml(content)}</textarea>${clear}</div></div>`;
  }
  return `<div class="field-row">${label}${description}<div class="field-control"><input data-value-path="${path}" data-value-type="string" type="text" value="${escapeHtml(typeof shown === 'string' ? shown : '')}" ${state.editable ? '' : 'disabled'}>${clear}</div></div>`;
}

function renderFields(): void {
  const fields = document.getElementById('fields-list');
  const blueprintName = document.getElementById('blueprint-name') as HTMLInputElement;
  const blueprintDescription = document.getElementById('blueprint-description') as HTMLTextAreaElement;
  if (!fields || !blueprintName || !blueprintDescription) return;
  if (!state.blueprint || !state.template) {
    fields.innerHTML = '<p class="muted">Fields are unavailable until the blueprint and its template are valid.</p>';
    blueprintName.value = '';
    blueprintDescription.value = '';
    blueprintName.disabled = true;
    blueprintDescription.disabled = true;
    return;
  }
  blueprintName.disabled = !state.editable;
  blueprintDescription.disabled = !state.editable;
  if (document.activeElement !== blueprintName) blueprintName.value = state.blueprint.name;
  if (document.activeElement !== blueprintDescription) blueprintDescription.value = state.blueprint.description ?? '';
  const values = state.blueprint.fields;
  fields.innerHTML = state.template.fields.length === 0
    ? '<p class="muted">This template has no editable fields.</p>'
    : state.template.fields.map((field) => fieldEditor(field, values[field.id], [field.id])).join('');
}

function nodeDefinition(node: BlueprintGraphNode): BlueprintNodeDefinition | undefined {
  return state.template?.nodes.find((definition) => definition.id === node.definitionId);
}

function eventDefinition(node: BlueprintGraphNode) {
  return state.template?.events.find((definition) => definition.id === node.definitionId);
}

function nodeTitle(node: BlueprintGraphNode): string {
  return (node.kind === 'event' ? eventDefinition(node)?.label : nodeDefinition(node)?.label) ?? node.definitionId;
}

function nodeOutputs(node: BlueprintGraphNode): BlueprintExecutionPin[] {
  if (node.kind === 'event') {
    const output = eventDefinition(node)?.outputPin;
    return output ? [output] : [];
  }
  return nodeDefinition(node)?.outputs ?? [];
}

function nodeInputs(node: BlueprintGraphNode): BlueprintExecutionPin[] {
  return node.kind === 'event' ? [] : nodeDefinition(node)?.inputs ?? [];
}

function parameterDefinitions(node: BlueprintGraphNode): BlueprintFieldDefinition[] {
  return (node.kind === 'event' ? eventDefinition(node) : nodeDefinition(node))?.parameters ?? [];
}

function renderNode(node: BlueprintGraphNode): string {
  const definition = node.kind === 'event' ? eventDefinition(node) : nodeDefinition(node);
  const category = node.kind === 'event' ? 'event' : nodeDefinition(node)?.category ?? 'action';
  const inputs = nodeInputs(node).map((pin) => `<div class="pin input" data-pin-node="${escapeHtml(node.instanceId)}" data-pin-id="${escapeHtml(pin.id)}" data-pin-direction="input"><span class="pin-dot"></span><span>${escapeHtml(pin.label)}</span></div>`).join('');
  const outputs = nodeOutputs(node).map((pin) => `<div class="pin output" data-pin-node="${escapeHtml(node.instanceId)}" data-pin-id="${escapeHtml(pin.id)}" data-pin-direction="output"><span>${escapeHtml(pin.label)}${pin.branch ? ` · ${escapeHtml(pin.branch)}` : ''}</span><span class="pin-dot"></span></div>`).join('');
  const definitions = parameterDefinitions(node);
  const parameters = definitions.map((field) => fieldEditor(field, node.parameters[field.id], [field.id])).join('');
  const x = Math.round(node.position.x);
  const y = Math.round(node.position.y);
  return `<article class="graph-node ${category}" data-node-card="${escapeHtml(node.instanceId)}" style="left:${x}px;top:${y}px">
    <header class="node-header" data-drag-handle="${escapeHtml(node.instanceId)}"><div><span class="node-kind">${escapeHtml(category)}</span><div class="node-title">${escapeHtml(nodeTitle(node))}</div><small class="node-operation">${escapeHtml(definition?.operationId ?? '')}</small></div><button type="button" data-remove-node="${escapeHtml(node.instanceId)}" aria-label="Remove ${escapeHtml(nodeTitle(node))}">×</button></header>
    <div class="node-position"><label>X <input type="number" step="1" data-node-position="x" data-position-node="${escapeHtml(node.instanceId)}" value="${x}" ${state.editable ? '' : 'disabled'}></label><label>Y <input type="number" step="1" data-node-position="y" data-position-node="${escapeHtml(node.instanceId)}" value="${y}" ${state.editable ? '' : 'disabled'}></label></div>
    <div class="node-params">${parameters}</div>
    <div class="node-pins"><div class="pin-column">${inputs}</div><div class="pin-column">${outputs}</div></div>
  </article>`;
}

function endpointOptions(kind: 'output' | 'input'): Array<{ endpoint: EndpointChoice; label: string }> {
  const result: Array<{ endpoint: EndpointChoice; label: string }> = [];
  for (const node of state.blueprint?.graph.nodes ?? []) {
    const pins = kind === 'output' ? nodeOutputs(node) : nodeInputs(node);
    for (const pin of pins) result.push({
      endpoint: { nodeId: node.instanceId, pinId: pin.id },
      label: `${nodeTitle(node)} [${node.instanceId}] · ${pin.label}${pin.branch ? ` (${pin.branch})` : ''}`,
    });
  }
  return result;
}

function renderSelectOptions(select: HTMLSelectElement, options: Array<{ endpoint: EndpointChoice; label: string }>): void {
  const previous = select.value;
  select.innerHTML = `<option value="">Select a declared execution pin…</option>${options.map((option) => `<option value="${escapeHtml(JSON.stringify(option.endpoint))}">${escapeHtml(option.label)}</option>`).join('')}`;
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  select.disabled = !state.editable || options.length === 0;
}

function renderConnections(): void {
  const list = document.getElementById('connections-list');
  const from = document.getElementById('connection-from') as HTMLSelectElement;
  const to = document.getElementById('connection-to') as HTMLSelectElement;
  const addButton = document.getElementById('add-connection') as HTMLButtonElement;
  if (!list || !from || !to || !addButton) return;
  renderSelectOptions(from, endpointOptions('output'));
  renderSelectOptions(to, endpointOptions('input'));
  addButton.disabled = !state.editable || from.options.length < 2 || to.options.length < 2;
  const connections = state.blueprint?.graph.connections ?? [];
  list.innerHTML = connections.length === 0
    ? '<p class="muted">No connections yet.</p>'
    : connections.map((connection, index) => {
      const source = state.blueprint!.graph.nodes.find((node) => node.instanceId === connection.from.nodeId);
      const target = state.blueprint!.graph.nodes.find((node) => node.instanceId === connection.to.nodeId);
      const sourcePin = source ? nodeOutputs(source).find((pin) => pin.id === connection.from.pinId) : undefined;
      const targetPin = target ? nodeInputs(target).find((pin) => pin.id === connection.to.pinId) : undefined;
      return `<div class="connection-row"><span>${escapeHtml(source ? nodeTitle(source) : connection.from.nodeId)} · ${escapeHtml(sourcePin?.label ?? connection.from.pinId)} → ${escapeHtml(target ? nodeTitle(target) : connection.to.nodeId)} · ${escapeHtml(targetPin?.label ?? connection.to.pinId)}</span><button type="button" data-remove-connection="${index}" title="Remove connection">×</button></div>`;
    }).join('');
}

function findPinElement(nodeId: string, pinId: string, direction: 'input' | 'output'): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[data-pin-node]')].find((element) =>
    element.dataset.pinNode === nodeId && element.dataset.pinId === pinId && element.dataset.pinDirection === direction);
}

function renderWires(): void {
  const canvas = document.getElementById('graph-canvas') as HTMLElement | null;
  const svg = document.getElementById('graph-wires') as SVGSVGElement | null;
  if (!canvas || !svg) return;
  const positions = state.blueprint?.graph.nodes.map((node) => node.position) ?? [];
  const width = Math.max(1200, ...positions.map((position) => position.x + 340));
  const height = Math.max(900, ...positions.map((position) => position.y + 270));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const origin = canvas.getBoundingClientRect();
  const paths: string[] = [];
  for (const connection of state.blueprint?.graph.connections ?? []) {
    const source = findPinElement(connection.from.nodeId, connection.from.pinId, 'output');
    const target = findPinElement(connection.to.nodeId, connection.to.pinId, 'input');
    if (!source || !target) continue;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const x1 = sourceRect.left + sourceRect.width / 2 - origin.left;
    const y1 = sourceRect.top + sourceRect.height / 2 - origin.top;
    const x2 = targetRect.left + targetRect.width / 2 - origin.left;
    const y2 = targetRect.top + targetRect.height / 2 - origin.top;
    const bend = Math.max(45, Math.abs(x2 - x1) * 0.45);
    paths.push(`<path class="wire" d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"/>`);
  }
  svg.innerHTML = paths.join('');
}

function renderGraph(): void {
  const events = document.getElementById('event-catalog') as HTMLSelectElement;
  const nodes = document.getElementById('node-catalog') as HTMLSelectElement;
  const eventButton = document.getElementById('add-event') as HTMLButtonElement;
  const nodeButton = document.getElementById('add-node') as HTMLButtonElement;
  const canvasNodes = document.getElementById('graph-nodes');
  if (!events || !nodes || !eventButton || !nodeButton || !canvasNodes) return;
  const eventOptions = state.template?.events ?? [];
  const nodeOptions = state.template?.nodes ?? [];
  events.innerHTML = `<option value="">Choose event…</option>${eventOptions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join('')}`;
  nodes.innerHTML = `<option value="">Choose action or condition…</option>${nodeOptions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)} · ${escapeHtml(item.category)}</option>`).join('')}`;
  events.disabled = !state.editable || eventOptions.length === 0;
  nodes.disabled = !state.editable || nodeOptions.length === 0;
  eventButton.disabled = !state.editable || eventOptions.length === 0 || !events.value;
  nodeButton.disabled = !state.editable || nodeOptions.length === 0 || !nodes.value;
  canvasNodes.innerHTML = (state.blueprint?.graph.nodes ?? []).map((node) => renderNode(node)).join('');
  renderConnections();
  requestAnimationFrame(renderWires);
}

function render(): void {
  renderFields();
  renderGraph();
  const title = document.getElementById('blueprint-title');
  if (title) title.textContent = state.title;
  const status = document.getElementById('save-status');
  if (status) status.textContent = state.dirty ? 'Unsaved changes' : 'Saved';
  const preview = document.getElementById('json-preview') as HTMLTextAreaElement | null;
  if (preview) preview.value = state.blueprint ? JSON.stringify(state.blueprint, null, 2) : state.sourceText;
  const diagnostics = document.getElementById('diagnostics');
  const diagnosticText = [state.diagnostics, localError].filter(Boolean).join('\n');
  if (diagnostics) {
    diagnostics.hidden = !diagnosticText;
    diagnostics.textContent = diagnosticText;
  }
  const warning = document.getElementById('source-warning');
  if (warning) {
    warning.hidden = state.editable;
    warning.textContent = state.editable
      ? ''
      : 'Visual editing is unavailable because the JSON format or exact template revision is invalid or missing. The original source is preserved. Use Open as Text to repair it.';
  }
  const openText = document.getElementById('open-as-text') as HTMLButtonElement | null;
  if (openText) openText.disabled = !state.sourceText;
}

function makeNode(kind: 'event' | 'node', definitionId: string): BlueprintGraphNode | undefined {
  if (!state.blueprint) return undefined;
  const definitions = kind === 'event' ? state.template?.events : state.template?.nodes;
  const definition = definitions?.find((item) => item.id === definitionId);
  if (!definition) return undefined;
  let suffix = 1;
  let instanceId = definitionId;
  while (state.blueprint.graph.nodes.some((node) => node.instanceId === instanceId)) instanceId = `${definitionId}-${suffix++}`;
  const index = state.blueprint.graph.nodes.length;
  const params: Record<string, unknown> = {};
  for (const field of definition.parameters) {
    const value = defaultValue(field);
    if (value !== OMIT_VALUE) params[field.id] = value;
  }
  return {
    instanceId,
    kind,
    definitionId,
    position: { x: 48 + (index % 3) * 300, y: 44 + Math.floor(index / 3) * 265 },
    parameters: params,
  };
}

function readInputValue(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): unknown {
  const type = input.dataset.valueType;
  if (input instanceof HTMLInputElement && type === 'boolean') return input.checked;
  if (type === 'number' || type === 'integer') {
    if (input.value.trim() === '') throw new Error('Enter a numeric value.');
    const value = Number(input.value);
    if (!Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) {
      throw new Error(type === 'integer' ? 'Enter a whole number.' : 'Enter a finite number.');
    }
    return value;
  }
  if (type === 'json') {
    try { return JSON.parse(input.value) as unknown; } catch (error) { throw new Error(error instanceof Error ? error.message : 'Enter valid JSON.'); }
  }
  return input.value;
}

function editField(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, nodeId?: string): void {
  if (!state.blueprint) return;
  let keys: string[];
  try { keys = JSON.parse(input.dataset.valuePath ?? '[]') as string[]; } catch { return; }
  if (keys.length === 0 || keys.some((key) => typeof key !== 'string')) return;
  try {
    const value = readInputValue(input);
    if (nodeId) {
      const parameterId = keys[0];
      state.blueprint = applyBlueprintEdit(state.blueprint, {
        type: 'set-node-parameter', instanceId: nodeId, parameterId, fieldPath: keys.slice(1), value,
      });
    } else {
      state.blueprint = applyBlueprintEdit(state.blueprint, {
        type: 'set-field', fieldId: keys[0], fieldPath: keys.slice(1), value,
      });
    }
    localError = '';
    render();
    scheduleSend();
  } catch (error) {
    localError = error instanceof Error ? error.message : 'The field value could not be parsed.';
    render();
  }
}

function removeValue(keys: string[], nodeId?: string): void {
  if (!state.blueprint || keys.length === 0) return;
  const next = clone(state.blueprint);
  let root: Record<string, unknown>;
  if (nodeId) {
    const node = next.graph.nodes.find((candidate) => candidate.instanceId === nodeId);
    if (!node) return;
    root = node.parameters;
  } else root = next.fields;
  let current: Record<string, unknown> = root;
  for (const segment of keys.slice(0, -1)) {
    if (!isRecord(current[segment])) return;
    current = current[segment] as Record<string, unknown>;
  }
  delete current[keys.at(-1)!];
  state.blueprint = next;
  localError = '';
  render();
  scheduleSend();
}

function parseEndpoint(value: string): EndpointChoice | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || typeof parsed.nodeId !== 'string' || typeof parsed.pinId !== 'string') return null;
    return { nodeId: parsed.nodeId, pinId: parsed.pinId };
  } catch { return null; }
}

function describeEndpoint(endpoint: EndpointChoice, direction: 'output' | 'input'): string {
  const node = state.blueprint?.graph.nodes.find((item) => item.instanceId === endpoint.nodeId);
  const pin = node ? (direction === 'output' ? nodeOutputs(node) : nodeInputs(node)).find((item) => item.id === endpoint.pinId) : undefined;
  return `${node ? nodeTitle(node) : endpoint.nodeId} · ${pin?.label ?? endpoint.pinId}`;
}

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const remove = target.closest<HTMLElement>('[data-remove-node]');
  if (remove) {
    const instanceId = remove.dataset.removeNode;
    if (instanceId) applyLocalEdit({ type: 'remove-node', instanceId });
    return;
  }
  const removeConnection = target.closest<HTMLElement>('[data-remove-connection]');
  if (removeConnection && state.blueprint) {
    const index = Number(removeConnection.dataset.removeConnection);
    const connection = state.blueprint.graph.connections[index];
    if (connection) applyLocalEdit({ type: 'disconnect', connection });
    return;
  }
  const clear = target.closest<HTMLElement>('[data-clear-value]');
  if (clear) {
    try {
      const keys = JSON.parse(clear.dataset.clearValue ?? '[]') as string[];
      const nodeId = clear.closest<HTMLElement>('[data-node-card]')?.dataset.nodeCard;
      removeValue(keys, nodeId);
    } catch { /* Ignore invalid UI metadata. */ }
    return;
  }
}

function handleChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  const fieldPath = target.dataset.valuePath;
  if (fieldPath) {
    const nodeId = target.closest<HTMLElement>('[data-node-card]')?.dataset.nodeCard;
    editField(target, nodeId);
    return;
  }
  if (target.id === 'blueprint-name' && state.blueprint) {
    const name = target.value.trim();
    if (!name) { localError = 'Blueprint name cannot be empty.'; render(); return; }
    state.blueprint = { ...state.blueprint, name };
    localError = '';
    render();
    scheduleSend();
    return;
  }
  if (target.id === 'blueprint-description' && state.blueprint) {
    state.blueprint = { ...state.blueprint, ...(target.value ? { description: target.value } : {}) };
    if (!target.value) delete state.blueprint.description;
    render();
    scheduleSend();
    return;
  }
  const positionAxis = target.dataset.nodePosition;
  if (positionAxis && (positionAxis === 'x' || positionAxis === 'y') && state.blueprint) {
    const instanceId = target.dataset.positionNode;
    const node = state.blueprint.graph.nodes.find((item) => item.instanceId === instanceId);
    const value = Number(target.value);
    if (!node || !Number.isFinite(value)) return;
    const position = { ...node.position, [positionAxis]: value };
    applyLocalEdit({ type: 'move-node', instanceId: node.instanceId, position });
  }
}

function handlePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const handle = target.closest<HTMLElement>('[data-drag-handle]');
  if (!handle || !state.blueprint || !state.editable || target.closest('button')) return;
  const instanceId = handle.dataset.dragHandle;
  const node = state.blueprint.graph.nodes.find((item) => item.instanceId === instanceId);
  if (!node) return;
  dragState = {
    instanceId: node.instanceId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: node.position.x,
    originY: node.position.y,
  };
  handle.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handlePointerMove(event: PointerEvent): void {
  if (!dragState || dragState.pointerId !== event.pointerId || !state.blueprint) return;
  const node = state.blueprint.graph.nodes.find((item) => item.instanceId === dragState!.instanceId);
  const card = document.querySelector<HTMLElement>(`[data-node-card="${CSS.escape(dragState.instanceId)}"]`);
  if (!node || !card) return;
  const x = Math.round(dragState.originX + event.clientX - dragState.startX);
  const y = Math.round(dragState.originY + event.clientY - dragState.startY);
  node.position = { x, y };
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  renderWires();
}

function handlePointerUp(event: PointerEvent): void {
  if (!dragState || dragState.pointerId !== event.pointerId || !state.blueprint) return;
  const node = state.blueprint.graph.nodes.find((item) => item.instanceId === dragState!.instanceId);
  dragState = null;
  if (!node) return;
  applyLocalEdit({ type: 'move-node', instanceId: node.instanceId, position: node.position });
}

function handleAddEvent(): void {
  const select = document.getElementById('event-catalog') as HTMLSelectElement;
  const node = makeNode('event', select.value);
  if (node) applyLocalEdit({ type: 'add-node', node });
}

function handleAddNode(): void {
  const select = document.getElementById('node-catalog') as HTMLSelectElement;
  const node = makeNode('node', select.value);
  if (node) applyLocalEdit({ type: 'add-node', node });
}

function handleAddConnection(): void {
  const from = parseEndpoint((document.getElementById('connection-from') as HTMLSelectElement).value);
  const to = parseEndpoint((document.getElementById('connection-to') as HTMLSelectElement).value);
  if (!from || !to) return;
  const connection: BlueprintConnection = { from, to };
  if (state.blueprint?.graph.connections.some((item) => JSON.stringify(item) === JSON.stringify(connection))) {
    localError = 'That execution connection already exists.';
    render();
    return;
  }
  applyLocalEdit({ type: 'connect', connection });
}

window.addEventListener('message', (event: MessageEvent<DocumentMessage | { type: 'error'; message: string }>) => {
  const message = event.data;
  if (message.type === 'error') {
    localError = message.message;
    render();
    return;
  }
  if (message.type !== 'document') return;
  state = {
    ...state,
    blueprint: message.blueprint,
    template: message.template,
    editable: message.editable,
    sourceText: message.sourceText,
    diagnostics: message.diagnostics,
    dirty: message.dirty,
    title: message.title,
    revision: message.revision,
  };
  if (message.acknowledgedEditId !== undefined && message.acknowledgedEditId >= state.editId) localError = '';
  render();
});

document.addEventListener('click', handleClick);
document.addEventListener('change', handleChange);
document.addEventListener('pointerdown', handlePointerDown);
document.addEventListener('pointermove', handlePointerMove);
document.addEventListener('pointerup', handlePointerUp);
document.getElementById('event-catalog')?.addEventListener('change', renderGraph);
document.getElementById('node-catalog')?.addEventListener('change', renderGraph);
document.getElementById('add-event')?.addEventListener('click', handleAddEvent);
document.getElementById('add-node')?.addEventListener('click', handleAddNode);
document.getElementById('add-connection')?.addEventListener('click', handleAddConnection);
document.getElementById('open-as-text')?.addEventListener('click', () => vscode.postMessage({ type: 'open-as-text' }));
document.getElementById('graph-viewport')?.addEventListener('scroll', renderWires);
window.addEventListener('resize', renderWires);

vscode.postMessage({ type: 'ready' });
