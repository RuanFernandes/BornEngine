import path from 'node:path';
import type * as vscode from 'vscode';
import {
  BLUEPRINT_FORMAT,
  BLUEPRINT_TEMPLATE_FORMAT,
  BLUEPRINT_TEMPLATE_VERSION,
  BLUEPRINT_VERSION,
  type BlueprintDocument,
  type BlueprintFieldDefinition,
  type BlueprintTemplate,
} from './blueprintSchema';
import { readBlueprintTemplate } from './blueprintJson';
import { CREATE_BLUEPRINT_COMMAND, BLUEPRINT_EDITOR_VIEW_TYPE } from '../shared/extensionIds';
import { isBornEngineProjectManifest } from '../views/bornEngineProject';
import { discoverBornEngineServers, pickBornEngineServer } from '../views/bornEngineServers';
import { workspaceFolderForDocument } from '../shared/workspaceAssets';

const TEMPLATE_GLOB = '**/.bornengine/blueprint-templates/**/*.blueprint-template.json';
const EXCLUDED_DIRECTORIES = '**/{.git,node_modules,dist,build,out}/**';
const BLUEPRINT_SUFFIX = '.blueprint.json';
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
type VsCodeApi = typeof vscode;

export type BlueprintTemplateResolution = {
  template: BlueprintTemplate | null;
  diagnostics: Array<{ path: string; code: string; message: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.scheme === right.scheme && left.authority === right.authority && left.path === right.path;
}

function isPathWithin(rootPath: string, targetPath: string): boolean {
  const relative = path.posix.relative(path.posix.resolve(rootPath), path.posix.resolve(targetPath));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.posix.sep}`)
    && !path.posix.isAbsolute(relative);
}

function relativePathSegments(rootPath: string, targetPath: string): string[] | null {
  if (!isPathWithin(rootPath, targetPath)) return null;
  return path.posix.relative(rootPath, targetPath).split('/').filter(Boolean);
}

async function isFreeOfSymbolicLinks(root: vscode.Uri, target: vscode.Uri, api: VsCodeApi): Promise<boolean> {
  const segments = relativePathSegments(root.path, target.path);
  if (!segments) return false;
  let current = root.path;
  for (const segment of segments) {
    current = path.posix.join(current, segment);
    try {
      const stat = await api.workspace.fs.stat(root.with({ path: current }));
      if ((stat.type & api.FileType.SymbolicLink) !== 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function readProjectManifest(folder: vscode.WorkspaceFolder, api: VsCodeApi): Promise<unknown | null> {
  try {
    const bytes = await api.workspace.fs.readFile(api.Uri.joinPath(folder.uri, 'package.json'));
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** Selects the outermost open BornEngine project containing the document. */
export async function findBornEngineProjectRoot(
  api: VsCodeApi,
  documentUri?: vscode.Uri,
  requestedFolderUri?: vscode.Uri,
): Promise<vscode.WorkspaceFolder | null> {
  const folders = api.workspace.workspaceFolders ?? [];
  const requested = requestedFolderUri
    ? folders.find((folder) => sameUri(folder.uri, requestedFolderUri))
    : undefined;
  if (requestedFolderUri && !requested) return null;
  const candidates = (requested ? [requested] : [...folders])
    .filter((folder) => !documentUri || (
      folder.uri.scheme === documentUri.scheme
      && folder.uri.authority === documentUri.authority
      && (folder.uri.path === '/' || documentUri.path === folder.uri.path || documentUri.path.startsWith(`${folder.uri.path.replace(/\/+$/, '')}/`))
    ))
    .sort((left, right) => left.uri.path.length - right.uri.path.length);
  for (const folder of candidates) {
    if (isBornEngineProjectManifest(await readProjectManifest(folder, api))) return folder;
  }
  return null;
}

function initialValue(definition: BlueprintFieldDefinition): unknown | typeof OMIT_VALUE {
  if (definition.defaultValue !== undefined) return structuredClone(definition.defaultValue);
  switch (definition.type) {
    case 'string': return definition.required ? '' : OMIT_VALUE;
    case 'number': return definition.required ? definition.minimum ?? 0 : OMIT_VALUE;
    case 'integer': return definition.required ? definition.minimum ?? 0 : OMIT_VALUE;
    case 'boolean': return definition.required ? false : OMIT_VALUE;
    case 'enum': return definition.required ? definition.enumValues?.[0] ?? '' : OMIT_VALUE;
    case 'object': {
      const object: Record<string, unknown> = {};
      for (const property of definition.properties ?? []) {
        const value = initialValue(property);
        if (value !== OMIT_VALUE) object[property.id] = value;
      }
      return object;
    }
    case 'array': return definition.required ? [] : OMIT_VALUE;
  }
}

const OMIT_VALUE = Symbol('omit-blueprint-value');

function initialValues(definitions: readonly BlueprintFieldDefinition[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const definition of definitions) {
    const value = initialValue(definition);
    if (value !== OMIT_VALUE) result[definition.id] = value;
  }
  return result;
}

function safeSlug(value: string): string {
  const result = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return result || 'blueprint';
}

async function listBlueprintTemplates(
  folder: vscode.WorkspaceFolder,
  api: VsCodeApi,
): Promise<Array<{ uri: vscode.Uri; template: BlueprintTemplate }>> {
  const uris = await api.workspace.findFiles(new api.RelativePattern(folder, TEMPLATE_GLOB), EXCLUDED_DIRECTORIES);
  const results: Array<{ uri: vscode.Uri; template: BlueprintTemplate }> = [];
  for (const uri of uris) {
    if (uri.scheme !== folder.uri.scheme || uri.authority !== folder.uri.authority) continue;
    const relative = path.posix.relative(folder.uri.path, uri.path);
    if (!relative.startsWith('.bornengine/blueprint-templates/') || !relative.endsWith('.blueprint-template.json')) continue;
    if (!(await isFreeOfSymbolicLinks(folder.uri, uri, api))) continue;
    try {
      const result = readBlueprintTemplate(new TextDecoder().decode(await api.workspace.fs.readFile(uri)));
      if (result.diagnostics.length !== 0 || !isRecord(result.value)
          || result.value.format !== BLUEPRINT_TEMPLATE_FORMAT
          || result.value.version !== BLUEPRINT_TEMPLATE_VERSION) continue;
      const template = result.value as unknown as BlueprintTemplate;
      results.push({ uri, template });
    } catch {
      // Invalid files remain untouched and are simply not offered for new documents.
    }
  }
  return results.sort((left, right) => left.template.name.localeCompare(right.template.name));
}

function valuesForBlueprint(template: BlueprintTemplate): Record<string, unknown> {
  return initialValues(template.fields ?? []);
}

function createEmptyBlueprint(template: BlueprintTemplate, id: string, name: string): BlueprintDocument {
  return {
    format: BLUEPRINT_FORMAT,
    version: BLUEPRINT_VERSION,
    id,
    name,
    template: { id: template.id, revision: template.revision },
    fields: valuesForBlueprint(template),
    graph: { nodes: [], connections: [] },
  };
}

function requestedWorkspaceFolder(
  api: VsCodeApi,
  requestedFolderUri?: vscode.Uri,
): vscode.WorkspaceFolder | undefined {
  return requestedFolderUri
    ? api.workspace.workspaceFolders?.find((folder) => sameUri(folder.uri, requestedFolderUri))
    : undefined;
}

/** Creates and opens a blueprint JSON document in the client assets or a marked server. */
export async function createBlueprint(api: VsCodeApi, workspaceFolderUri?: vscode.Uri): Promise<void> {
  if (workspaceFolderUri && !requestedWorkspaceFolder(api, workspaceFolderUri)) {
    await api.window.showErrorMessage('The selected workspace folder is no longer open.');
    return;
  }
  const activeUri = api.window.activeTextEditor?.document.uri;
  const root = await findBornEngineProjectRoot(
    api,
    activeUri,
    workspaceFolderUri ?? (activeUri ? api.workspace.getWorkspaceFolder(activeUri)?.uri : undefined),
  ) ?? await findBornEngineProjectRoot(api, undefined, workspaceFolderUri);
  if (!root) {
    await api.window.showErrorMessage('Open a BornEngine project before creating a blueprint.');
    return;
  }

  const templates = await listBlueprintTemplates(root, api);
  if (templates.length === 0) {
    await api.window.showInformationMessage('Create a blueprint template first in BornEngine Tools.');
    return;
  }
  const selectedTemplate = await api.window.showQuickPick(templates.map(({ uri, template }) => ({
    label: template.name,
    description: `${template.id} · revision ${template.revision}`,
    detail: uri.path,
    template,
  })), { placeHolder: 'Choose a blueprint template' });
  if (!selectedTemplate) return;
  const template = selectedTemplate.template;

  const nameInput = await api.window.showInputBox({
    prompt: 'Blueprint name',
    placeHolder: template.name,
    validateInput: (value) => value.trim() ? undefined : 'Enter a name for this blueprint.',
  });
  const name = nameInput?.trim();
  if (!name) return;
  const defaultId = safeSlug(name);
  const idInput = await api.window.showInputBox({
    prompt: 'Blueprint ID',
    value: defaultId,
    validateInput: (value) => IDENTIFIER_PATTERN.test(value)
      ? undefined
      : 'Use letters, numbers, dots, underscores, colons, or hyphens; start with a letter or number.',
  });
  const id = idInput?.trim();
  if (!id) return;
  if (!IDENTIFIER_PATTERN.test(id)) {
    await api.window.showErrorMessage('The blueprint ID is invalid.');
    return;
  }

  const clientDirectory = api.Uri.joinPath(root.uri, 'assets', 'blueprints');
  const servers = await discoverBornEngineServers(root, api, api.workspace.workspaceFolders ?? [root]);
  const destinations: Array<{ label: string; description: string; value: 'client' | 'server'; uri: vscode.Uri }> = [
    { label: 'Client assets', description: clientDirectory.path, value: 'client', uri: clientDirectory },
  ];
  for (const server of servers) {
    destinations.push({
      label: `Server: ${server.name}`,
      description: api.Uri.joinPath(server.serverUri, 'blueprints').path,
      value: 'server',
      uri: server.serverUri,
    });
  }
  const destination = await api.window.showQuickPick(destinations, {
    placeHolder: 'Choose where to save this blueprint. The destination path is shown for each option.',
    matchOnDescription: true,
  });
  if (!destination) return;

  let destinationDirectory = clientDirectory;
  if (destination.value === 'server') {
    const chosenServer = servers.find((server) => sameUri(server.serverUri, destination.uri));
    if (!chosenServer) {
      await api.window.showErrorMessage('The selected server is no longer available.');
      return;
    }
    const refreshedServers = await discoverBornEngineServers(root, api, api.workspace.workspaceFolders ?? [root]);
    if (!refreshedServers.some((server) => sameUri(server.serverUri, chosenServer.serverUri))) {
      await api.window.showErrorMessage('The server marker changed. Refresh BornEngine Tools and choose a destination again.');
      return;
    }
    const server = await pickBornEngineServer(api, [chosenServer]);
    if (!server) return;
    destinationDirectory = api.Uri.joinPath(server.serverUri, 'blueprints');
  }

  const defaultUri = api.Uri.joinPath(destinationDirectory, `${id}${BLUEPRINT_SUFFIX}`);
  const targetSelection = await api.window.showSaveDialog({
    defaultUri,
    saveLabel: 'Create Blueprint',
    filters: { 'BornEngine Blueprint': ['blueprint.json'] },
  });
  if (!targetSelection) return;
  if (targetSelection.scheme !== destinationDirectory.scheme
      || targetSelection.authority !== destinationDirectory.authority
      || !isPathWithin(destinationDirectory.path, targetSelection.path)) {
    await api.window.showErrorMessage(`Save this blueprint under ${destinationDirectory.path}.`);
    return;
  }
  const targetUri = targetSelection.path.endsWith(BLUEPRINT_SUFFIX)
    ? targetSelection
    : targetSelection.with({ path: `${targetSelection.path}${BLUEPRINT_SUFFIX}` });
  try {
    await api.workspace.fs.stat(targetUri);
    await api.window.showErrorMessage('A file already exists at the selected blueprint path.');
    return;
  } catch {
    // A missing target is expected; write errors are handled below.
  }

  const document = createEmptyBlueprint(template, id, name);
  try {
    await api.workspace.fs.createDirectory(targetUri.with({ path: path.posix.dirname(targetUri.path) }));
    await api.workspace.fs.writeFile(targetUri, new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`));
  } catch (error) {
    await api.window.showErrorMessage(error instanceof Error ? error.message : 'The blueprint could not be created.');
    return;
  }
  await api.commands.executeCommand('vscode.openWith', targetUri, BLUEPRINT_EDITOR_VIEW_TYPE);
}

/** Resolves the exact template ID and revision referenced by a blueprint document. */
export async function resolveBlueprintTemplate(
  documentText: string,
  documentUri: vscode.Uri,
  api: VsCodeApi,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): Promise<BlueprintTemplateResolution> {
  let document: unknown;
  try {
    document = JSON.parse(documentText) as unknown;
  } catch (error) {
    return {
      template: null,
      diagnostics: [{
        path: '$',
        code: 'json.parse',
        message: error instanceof Error ? error.message : 'Invalid JSON.',
      }],
    };
  }
  if (!isRecord(document) || document.format !== BLUEPRINT_FORMAT || document.version !== BLUEPRINT_VERSION) {
    return { template: null, diagnostics: [{
      path: '$.format',
      code: 'document.version',
      message: 'This blueprint format or schema version is not supported.',
    }] };
  }
  if (!isRecord(document.template) || typeof document.template.id !== 'string'
      || !Number.isInteger(document.template.revision)) {
    return { template: null, diagnostics: [{
      path: '$.template',
      code: 'template.reference',
      message: 'The blueprint must reference a template ID and exact revision.',
    }] };
  }
  const root = await findBornEngineProjectRoot(api, documentUri);
  if (!root) return { template: null, diagnostics: [{
    path: '$.template',
    code: 'project.missing',
    message: 'The blueprint is not inside an open BornEngine project.',
  }] };
  const templates = await listBlueprintTemplates(root, api);
  const templateReference = document.template;
  const matches = templates.filter(({ template }) => template.id === templateReference.id
    && template.revision === templateReference.revision);
  if (matches.length !== 1) return { template: null, diagnostics: [{
    path: '$.template',
    code: matches.length === 0 ? 'template.missing' : 'template.ambiguous',
    message: matches.length === 0
      ? `Blueprint template '${String(document.template.id)}' revision ${String(document.template.revision)} is missing.`
      : `More than one file provides template '${String(document.template.id)}' revision ${String(document.template.revision)}.`,
  }] };
  return { template: matches[0].template, diagnostics: [] };
}
