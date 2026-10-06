import type {
  BlueprintEventDefinition,
  BlueprintExecutionPin,
  BlueprintFieldDefinition,
  BlueprintFieldType,
  BlueprintNodeDefinition,
  BlueprintTemplate,
} from '../blueprints/blueprintSchema';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type PathPart = string | number;
type EditorMessage = {
  type: string;
  template?: BlueprintTemplate | null;
  diagnostics?: string;
  dirty?: boolean;
  editable?: boolean;
  revision?: number;
  editId?: number;
  message?: string;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById('template-editor')!;
const fieldTypes: BlueprintFieldType[] = ['string', 'number', 'integer', 'boolean', 'enum', 'object', 'array'];
let template: BlueprintTemplate | null = null;
let documentEditable = false;
let externalRevision = 0;
let nextEditId = 1;
let currentDiagnostics = '';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function encodedPath(value: PathPart[]): string {
  return escapeHtml(JSON.stringify(value));
}

function readPath(value: unknown, path: PathPart[]): unknown {
  let current = value as Record<string, unknown> | unknown[];
  for (const part of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[String(part)] as Record<string, unknown> | unknown[];
  }
  return current;
}

function writePath(value: Record<string, unknown>, path: PathPart[], next: unknown): void {
  if (path.length === 0) return;
  const key = path.pop()!;
  let current: Record<string, unknown> | unknown[] = value;
  for (const part of path) {
    const child = (current as Record<string, unknown>)[String(part)];
    if (child === null || typeof child !== 'object') return;
    current = child as Record<string, unknown> | unknown[];
  }
  if (next === undefined) delete (current as Record<string, unknown>)[String(key)];
  else (current as Record<string, unknown>)[String(key)] = next;
}

function uniqueId(prefix: string, items: Array<{ id?: string }>): string {
  const used = new Set(items.map((item) => item.id));
  for (let suffix = 1; ; suffix++) {
    const candidate = `${prefix}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

function fieldDefault(type: BlueprintFieldType): unknown {
  if (type === 'string') return '';
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'boolean') return false;
  if (type === 'enum') return 'option';
  if (type === 'object') return {};
  return [];
}

function button(label: string, action: string, attributes = ''): string {
  return `<button type="button" data-action="${escapeHtml(action)}" ${attributes}>${escapeHtml(label)}</button>`;
}

function smallItemActions(path: PathPart[], index: number): string {
  const list = encodedPath(path);
  return `<span class="summary-actions">${button('↑', 'move-item', `data-list="${list}" data-index="${index}" data-delta="-1" title="Move up"`)}${button('↓', 'move-item', `data-list="${list}" data-index="${index}" data-delta="1" title="Move down"`)}${button('×', 'remove-item', `data-list="${list}" data-index="${index}" title="Remove"`)}</span>`;
}

function fieldInput(label: string, path: PathPart[], value: unknown, inputType = 'text', extra = '', uniqueList?: PathPart[]): string {
  const className = path.at(-1) === 'id' ? ' class="id-input"' : '';
  const uniqueness = uniqueList ? ` data-unique-list="${encodedPath(uniqueList)}"` : '';
  const feedback = uniqueList ? '<span class="id-feedback" aria-live="polite"></span>' : '';
  return `<label>${escapeHtml(label)}<input${className} type="${escapeHtml(inputType)}" data-path="${encodedPath(path)}" value="${escapeHtml(value)}"${uniqueness} ${extra}>${feedback}</label>`;
}

function fieldSelect(label: string, path: PathPart[], selected: string, options: string[]): string {
  return `<label>${escapeHtml(label)}<select data-path="${encodedPath(path)}">${options.map((option) => `<option value="${escapeHtml(option)}"${option === selected ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function renderDefaultEditor(field: BlueprintFieldDefinition, path: PathPart[]): string {
  const defaultPath = [...path, 'defaultValue'];
  const value = field.defaultValue;
  if (field.type === 'boolean') {
    return `<label class="check-label"><input type="checkbox" data-path="${encodedPath(defaultPath)}" data-value-kind="boolean"${value === true ? ' checked' : ''}>Default value: ${value === true ? 'true' : 'false'}</label>`;
  }
  if (field.type === 'enum') {
    const choices = field.enumValues ?? [];
    const values = [...choices];
    if (typeof value === 'string' && !values.includes(value)) values.push(value);
    return fieldSelect('Default value', defaultPath, typeof value === 'string' ? value : '', values);
  }
  if (field.type === 'object' || field.type === 'array') {
    return `<label>Default value (JSON)<textarea data-path="${encodedPath(defaultPath)}" data-value-kind="json">${escapeHtml(JSON.stringify(value, null, 2))}</textarea></label>`;
  }
  const inputType = field.type === 'number' || field.type === 'integer' ? 'number' : 'text';
  const step = field.type === 'integer' ? '1' : 'any';
  return fieldInput('Default value', defaultPath, value, inputType, inputType === 'number' ? `step="${step}"` : '');
}

function renderFieldList(fields: BlueprintFieldDefinition[], path: PathPart[], title: string): string {
  const items = Array.isArray(fields) ? fields : [];
  const children = items.map((field, index) => renderField(field, [...path, index], path, index)).join('');
  const listAttribute = encodedPath(path);
  return `<div class="field-list"><div class="field-list-heading"><h3>${escapeHtml(title)}</h3>${button('+ Add Field', 'add-field', `data-list="${listAttribute}"`)}</div><div class="field-list-items">${children || '<p class="empty-list">No fields yet.</p>'}</div></div>`;
}

function renderField(field: BlueprintFieldDefinition, path: PathPart[], listPath: PathPart[], index: number): string {
  const type = fieldTypes.includes(field.type) ? field.type : 'string';
  const id = typeof field.id === 'string' ? field.id : '';
  const label = typeof field.label === 'string' ? field.label : '';
  const typeOptions = fieldTypes.map((item) => `<option value="${item}"${item === type ? ' selected' : ''}>${item}</option>`).join('');
  const enumChoices = (field.enumValues ?? []).join(', ');
  const defaultEnabled = Object.hasOwn(field, 'defaultValue');
  let specific = '';
  if (type === 'enum') specific += fieldInput('Choices (comma separated)', [...path, 'enumValues'], enumChoices, 'text', 'data-value-kind="choices"');
  if (type === 'number' || type === 'integer') {
    specific += `<div class="control-grid">${fieldInput('Minimum', [...path, 'minimum'], field.minimum ?? '', 'number', 'step="any" data-value-kind="optional-number"')}${fieldInput('Maximum', [...path, 'maximum'], field.maximum ?? '', 'number', 'step="any" data-value-kind="optional-number"')}</div>`;
  }
  if (type === 'object') specific += renderFieldList(field.properties ?? [], [...path, 'properties'], 'Nested object properties');
  if (type === 'array') specific += renderItemSchema(field.items ?? { type: 'string' }, [...path, 'items']);
  return `<details class="field-card" open><summary><strong>${escapeHtml(label || id || 'New field')}</strong><span>${escapeHtml(type)}</span>${smallItemActions(listPath, index)}</summary><div class="field-body">
    <div class="control-grid">${fieldInput('Field ID', [...path, 'id'], id, 'text', '', listPath)}${fieldInput('Label', [...path, 'label'], label)}<label>Type<select data-path="${encodedPath([...path, 'type'])}" data-schema-path="${encodedPath(path)}">${typeOptions}</select></label></div>
    <div class="control-grid"><label class="check-label"><input type="checkbox" data-path="${encodedPath([...path, 'required'])}" data-value-kind="boolean"${field.required ? ' checked' : ''}>Required</label>${fieldInput('Description', [...path, 'description'], field.description ?? '')}</div>
    <label class="check-label"><input type="checkbox" data-action="toggle-default" data-schema-path="${encodedPath(path)}"${defaultEnabled ? ' checked' : ''}>Use a default value</label>
    ${defaultEnabled ? renderDefaultEditor(field, path) : ''}${specific}
  </div></details>`;
}

function renderItemSchema(schema: BlueprintFieldDefinition['items'], path: PathPart[]): string {
  const item = schema ?? { type: 'string' as BlueprintFieldType };
  const type = fieldTypes.includes(item.type) ? item.type : 'string';
  const defaultEnabled = Object.hasOwn(item, 'defaultValue');
  let specific = '';
  if (type === 'enum') specific += fieldInput('Choices (comma separated)', [...path, 'enumValues'], (item.enumValues ?? []).join(', '), 'text', 'data-value-kind="choices"');
  if (type === 'number' || type === 'integer') {
    specific += `<div class="control-grid">${fieldInput('Minimum', [...path, 'minimum'], item.minimum ?? '', 'number', 'step="any" data-value-kind="optional-number"')}${fieldInput('Maximum', [...path, 'maximum'], item.maximum ?? '', 'number', 'step="any" data-value-kind="optional-number"')}</div>`;
  }
  if (type === 'object') specific += renderFieldList(item.properties ?? [], [...path, 'properties'], 'Nested object properties');
  if (type === 'array') specific += renderItemSchema(item.items ?? { type: 'string' }, [...path, 'items']);
  return `<div class="field-list"><div class="field-list-heading"><h3>Array item</h3></div><div class="field-body">
    ${fieldSelect('Item type', [...path, 'type'], type, fieldTypes)}
    <label class="check-label"><input type="checkbox" data-action="toggle-default" data-schema-path="${encodedPath(path)}"${defaultEnabled ? ' checked' : ''}>Use an item default</label>
    ${defaultEnabled ? renderDefaultEditor(item as BlueprintFieldDefinition, path) : ''}${specific}
  </div></div>`;
}

function renderEvent(event: BlueprintEventDefinition, index: number): string {
  const path: PathPart[] = ['events', index];
  const id = event.id ?? '';
  const output = event.outputPin ?? { id: 'then', label: 'Then' };
  return `<details class="definition-card" open><summary><span class="summary-title">${escapeHtml(event.label || id || 'New event')}</span><span>Event</span>${smallItemActions(['events'], index)}</summary><div class="card-body">
    <div class="control-grid">${fieldInput('Event ID', [...path, 'id'], id, 'text', '', ['events'])}${fieldInput('Label', [...path, 'label'], event.label ?? '')}${fieldInput('Operation ID', [...path, 'operationId'], event.operationId ?? '')}</div>
    ${fieldInput('Description', [...path, 'description'], event.description ?? '')}
    <div class="pin-list"><p class="direction-label">Event execution output</p><div class="pin-row">${fieldInput('Output pin ID', [...path, 'outputPin', 'id'], output.id)}${fieldInput('Label', [...path, 'outputPin', 'label'], output.label)}</div></div>
    ${renderFieldList(event.parameters ?? [], [...path, 'parameters'], 'Event parameters')}
  </div></details>`;
}

function renderPinList(pins: BlueprintExecutionPin[], path: PathPart[], direction: 'inputs' | 'outputs', category: 'action' | 'condition', nodePath: PathPart[]): string {
  const pinList = Array.isArray(pins) ? pins : [];
  const rows = pinList.map((pin, index) => {
    const pinPath = [...path, index];
    const branchControl = direction === 'outputs' && category === 'condition'
      ? fieldSelect('Branch', [...pinPath, 'branch'], pin.branch ?? (index === 0 ? 'true' : 'false'), ['true', 'false'])
      : '';
    return `<div class="pin-row">${fieldInput('Pin ID', [...pinPath, 'id'], pin.id, 'text', '', path)}${fieldInput('Label', [...pinPath, 'label'], pin.label)}${branchControl}${smallItemActions(path, index)}</div>`;
  }).join('');
  const label = direction === 'inputs' ? 'Execution inputs (incoming)' : 'Execution outputs (outgoing)';
  const allowAdd = !(direction === 'outputs' && category === 'condition' && pinList.length >= 2);
  return `<div class="pin-list"><div class="subsection-heading"><p class="direction-label">${label}</p>${allowAdd ? button('+ Add Pin', 'add-pin', `data-list="${encodedPath(path)}" data-node="${encodedPath(nodePath)}" data-direction="${direction}"`) : ''}</div>${rows || '<p class="empty-list">No pins.</p>'}</div>`;
}

function renderNode(node: BlueprintNodeDefinition, index: number): string {
  const path: PathPart[] = ['nodes', index];
  const category = node.category === 'condition' ? 'condition' : 'action';
  return `<details class="definition-card" open><summary><span class="summary-title">${escapeHtml(node.label || node.id || 'New node')}</span><span>${category}</span>${smallItemActions(['nodes'], index)}</summary><div class="card-body">
    <div class="control-grid">${fieldInput('Node ID', [...path, 'id'], node.id ?? '', 'text', '', ['nodes'])}${fieldInput('Label', [...path, 'label'], node.label ?? '')}<label>Category<select data-path="${encodedPath([...path, 'category'])}" data-node-category="${encodedPath(path)}"><option value="action"${category === 'action' ? ' selected' : ''}>Action</option><option value="condition"${category === 'condition' ? ' selected' : ''}>Condition</option></select></label>${fieldInput('Operation ID', [...path, 'operationId'], node.operationId ?? '')}</div>
    ${fieldInput('Description', [...path, 'description'], node.description ?? '')}
    ${renderFieldList(node.parameters ?? [], [...path, 'parameters'], 'Node parameters')}
    <div class="control-grid">${renderPinList(node.inputs ?? [], [...path, 'inputs'], 'inputs', category, path)}${renderPinList(node.outputs ?? [], [...path, 'outputs'], 'outputs', category, path)}</div>
  </div></details>`;
}

function refreshUniqueIds(): void {
  const elements = [...root.querySelectorAll<HTMLInputElement>('.id-input[data-unique-list]')];
  const groups = new Map<string, HTMLInputElement[]>();
  for (const input of elements) {
    const group = input.dataset.uniqueList ?? '';
    groups.set(group, [...(groups.get(group) ?? []), input]);
  }
  for (const group of groups.values()) {
    const counts = new Map<string, number>();
    for (const input of group) counts.set(input.value, (counts.get(input.value) ?? 0) + 1);
    for (const input of group) {
      const duplicate = input.value.length > 0 && (counts.get(input.value) ?? 0) > 1;
      input.setAttribute('aria-invalid', String(duplicate));
      const feedback = input.closest('label')?.querySelector<HTMLElement>('.id-feedback');
      if (feedback) feedback.textContent = duplicate ? 'This ID must be unique in its list.' : '';
    }
  }
}

function render(): void {
  const warning = document.getElementById('source-warning')!;
  const diagnosticsElement = document.getElementById('diagnostics')!;
  const diagnosticsText = currentDiagnostics;
  const editable = template !== null && documentEditable;
  warning.hidden = editable;
  warning.textContent = editable ? '' : 'This JSON is malformed or uses an unsupported schema version. Its source has been preserved. Fix it in the text editor to continue.';
  diagnosticsElement.hidden = diagnosticsText.length === 0;
  diagnosticsElement.textContent = diagnosticsText;

  const identityInputs: Array<[string, unknown]> = [
    ['template-id', template?.id],
    ['template-name', template?.name],
    ['template-revision', template?.revision],
    ['template-description', template?.description],
  ];
  for (const [id, value] of identityInputs) {
    const input = document.getElementById(id) as HTMLInputElement;
    input.value = String(value ?? '');
    input.disabled = !editable;
  }
  root.querySelectorAll<HTMLButtonElement>('button[data-action], input, select, textarea').forEach((control) => {
    control.disabled = !editable;
  });
  for (const id of ['fields-list', 'events-list', 'nodes-list']) {
    const container = document.getElementById(id)!;
    container.innerHTML = '';
    container.setAttribute('aria-disabled', String(!editable));
  }
  if (!editable || !template) return;

  const fields = Array.isArray(template.fields) ? template.fields.filter((field) => field && typeof field === 'object') : [];
  const events = Array.isArray(template.events) ? template.events.filter((event) => event && typeof event === 'object') : [];
  const nodes = Array.isArray(template.nodes) ? template.nodes.filter((node) => node && typeof node === 'object') : [];
  document.getElementById('template-title')!.textContent = template.name || 'Untitled Template';
  document.getElementById('fields-list')!.innerHTML = fields.map((field, index) => renderField(field, ['fields', index], ['fields'], index)).join('')
    || '<p class="empty-list">No fields yet.</p>';
  document.getElementById('events-list')!.innerHTML = events.map((event, index) => renderEvent(event, index)).join('')
    || '<p class="empty-list">No events yet.</p>';
  document.getElementById('nodes-list')!.innerHTML = nodes.map((node, index) => renderNode(node, index)).join('')
    || '<p class="empty-list">No actions or conditions yet.</p>';
  refreshUniqueIds();
}

function setSchemaType(schema: Record<string, unknown>, type: BlueprintFieldType): void {
  schema.type = type;
  delete schema.defaultValue;
  delete schema.enumValues;
  delete schema.minimum;
  delete schema.maximum;
  delete schema.properties;
  delete schema.items;
  if (type === 'enum') schema.enumValues = ['option'];
  if (type === 'object') schema.properties = [];
  if (type === 'array') schema.items = { type: 'string' };
}

function postEdit(): void {
  if (!template || !documentEditable) return;
  vscode.postMessage({ type: 'edit', editId: nextEditId++, revision: externalRevision, template });
}

function updateFromControl(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  if (!template || !documentEditable || !control.dataset.path) return;
  const path = JSON.parse(control.dataset.path) as PathPart[];
  if (path.at(-1) === 'type') {
    const schemaPath = control.dataset.schemaPath ? JSON.parse(control.dataset.schemaPath) as PathPart[] : path.slice(0, -1);
    const schema = readPath(template, schemaPath);
    if (schema && typeof schema === 'object') setSchemaType(schema as Record<string, unknown>, control.value as BlueprintFieldType);
  } else {
    const kind = control.dataset.valueKind;
    let value: unknown = control.value;
    if (control instanceof HTMLInputElement && control.type === 'checkbox') value = control.checked;
    else if (kind === 'optional-number' && control.value.trim() === '') value = undefined;
    else if (control instanceof HTMLInputElement && control.type === 'number') {
      value = control.value.trim() === '' ? undefined : Number(control.value);
    } else if (kind === 'choices') {
      value = control.value.split(',').map((choice) => choice.trim()).filter(Boolean);
    } else if (kind === 'json') {
      try { value = JSON.parse(control.value) as unknown; }
      catch { setStatus('Enter a valid JSON default value.'); return; }
    }
    writePath(template as unknown as Record<string, unknown>, path, value);
  }
  if (control.dataset.nodeCategory) {
    const nodePath = JSON.parse(control.dataset.nodeCategory) as PathPart[];
    const node = readPath(template, nodePath) as BlueprintNodeDefinition;
    if (control.value === 'condition') {
      const outputs = node.outputs ?? [];
      if (outputs.length === 0) node.outputs = [
        { id: 'true', label: 'True', branch: 'true' },
        { id: 'false', label: 'False', branch: 'false' },
      ];
      else {
        const branches: BlueprintExecutionPin[] = [
          { id: 'true', label: 'True', branch: 'true' },
          { id: 'false', label: 'False', branch: 'false' },
        ];
        node.outputs = [...branches, ...outputs.slice(2)].slice(0, 2);
      }
    } else {
      node.outputs = (node.outputs ?? []).map(({ id, label }) => ({ id, label }));
    }
  }
  render();
  postEdit();
}

function setStatus(message: string): void {
  document.getElementById('save-status')!.textContent = message;
}

function addField(path: PathPart[]): void {
  let list = readPath(template, path) as BlueprintFieldDefinition[] | undefined;
  if (!Array.isArray(list)) {
    writePath(template as unknown as Record<string, unknown>, path, []);
    list = readPath(template, path) as BlueprintFieldDefinition[];
  }
  list.push({ id: uniqueId('field', list), label: 'New Field', type: 'string', required: false });
}

function addEvent(): void {
  if (!template) return;
  if (!Array.isArray(template.events)) template.events = [];
  const event: BlueprintEventDefinition = {
    id: uniqueId('event', template.events),
    label: 'New Event',
    operationId: 'game.event',
    parameters: [],
    outputPin: { id: 'then', label: 'Then' },
  };
  template.events.push(event);
}

function addNode(category: 'action' | 'condition'): void {
  if (!template) return;
  if (!Array.isArray(template.nodes)) template.nodes = [];
  const node: BlueprintNodeDefinition = {
    id: uniqueId(category, template.nodes),
    label: category === 'condition' ? 'New Condition' : 'New Action',
    category,
    operationId: `game.${category}`,
    parameters: [],
    inputs: [{ id: 'in', label: 'In' }],
    outputs: category === 'condition'
      ? [{ id: 'true', label: 'True', branch: 'true' }, { id: 'false', label: 'False', branch: 'false' }]
      : [{ id: 'out', label: 'Out' }],
  };
  template.nodes.push(node);
}

function addPin(listPath: PathPart[], direction: 'inputs' | 'outputs', nodePath: PathPart[]): void {
  let list = readPath(template, listPath) as BlueprintExecutionPin[] | undefined;
  if (!Array.isArray(list)) {
    writePath(template as unknown as Record<string, unknown>, listPath, []);
    list = readPath(template, listPath) as BlueprintExecutionPin[];
  }
  const node = readPath(template, nodePath) as BlueprintNodeDefinition;
  let pin: BlueprintExecutionPin = { id: uniqueId(direction === 'inputs' ? 'in' : 'out', list), label: direction === 'inputs' ? 'In' : 'Out' };
  if (node.category === 'condition' && direction === 'outputs') {
    if (list.length >= 2) return;
    const branch: 'true' | 'false' = list.some((item) => item.branch === 'true') ? 'false' : 'true';
    pin = { id: branch, label: branch === 'true' ? 'True' : 'False', branch };
  }
  list.push(pin);
}

function applyButtonAction(buttonElement: HTMLButtonElement): void {
  if (!template || !documentEditable) return;
  const action = buttonElement.dataset.action;
  if (action === 'add-field') {
    addField(JSON.parse(buttonElement.dataset.list ?? '[]') as PathPart[]);
  } else if (action === 'add-event') {
    addEvent();
  } else if (action === 'add-node') {
    addNode(buttonElement.dataset.category === 'condition' ? 'condition' : 'action');
  } else if (action === 'add-pin') {
    addPin(
      JSON.parse(buttonElement.dataset.list ?? '[]') as PathPart[],
      buttonElement.dataset.direction === 'outputs' ? 'outputs' : 'inputs',
      JSON.parse(buttonElement.dataset.node ?? '[]') as PathPart[],
    );
  } else if (action === 'remove-item' || action === 'move-item') {
    const listPath = JSON.parse(buttonElement.dataset.list ?? '[]') as PathPart[];
    const list = readPath(template, listPath) as unknown[];
    const index = Number(buttonElement.dataset.index);
    if (action === 'remove-item') list.splice(index, 1);
    else {
      const nextIndex = index + Number(buttonElement.dataset.delta);
      if (nextIndex < 0 || nextIndex >= list.length) return;
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
    }
  }
  render();
  postEdit();
}

root.addEventListener('change', (event) => {
  const control = event.target;
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
    if (control instanceof HTMLInputElement && control.dataset.action === 'toggle-default' && template && documentEditable) {
      const path = JSON.parse(control.dataset.schemaPath ?? '[]') as PathPart[];
      const schema = readPath(template, path);
      if (schema && typeof schema === 'object') {
        const fieldSchema = schema as Record<string, unknown>;
        if (control.checked) fieldSchema.defaultValue = fieldDefault(fieldSchema.type as BlueprintFieldType);
        else delete fieldSchema.defaultValue;
        render();
        postEdit();
      }
      return;
    }
    updateFromControl(control);
  }
});

root.addEventListener('input', (event) => {
  const control = event.target;
  if (control instanceof HTMLInputElement && control.classList.contains('id-input')) refreshUniqueIds();
});

root.addEventListener('click', (event) => {
  const buttonElement = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (buttonElement) applyButtonAction(buttonElement);
});

window.addEventListener('message', (event: MessageEvent<EditorMessage>) => {
  const message = event.data;
  if (message.type === 'document') {
    template = message.template ?? null;
    documentEditable = message.editable === true;
    externalRevision = message.revision ?? externalRevision;
    currentDiagnostics = message.diagnostics ?? '';
    document.getElementById('template-title')!.textContent = template?.name || 'Blueprint Template';
    setStatus(message.dirty ? 'Unsaved changes' : 'Saved');
    render();
  } else if (message.type === 'error') {
    setStatus(message.message ?? 'The template edit could not be applied.');
  }
});

vscode.postMessage({ type: 'ready' });
