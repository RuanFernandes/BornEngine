import type * as vscode from 'vscode';

export const DEFAULT_ENTRY_FILE = 'main.ts';
const BUILD_TARGETS = ['host', 'linux', 'windows', 'macos'] as const;

/** Values a shortcut may need before it can build its CLI arguments. */
export interface BornEngineCliInputs {
  readonly entry: string;
  readonly pickBuildTarget: () => PromiseLike<string | undefined>;
  readonly askEngineVersion: () => PromiseLike<string | undefined>;
  readonly askAiDocsName: () => PromiseLike<string | undefined>;
}

export interface BornEngineCliShortcut {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  /** Returns CLI arguments, or undefined when the user cancelled a prompt. */
  readonly args: (inputs: BornEngineCliInputs) => Promise<readonly string[] | undefined> | readonly string[];
}

export const BORNENGINE_CLI_SHORTCUTS: readonly BornEngineCliShortcut[] = [
  { id: 'dev', label: 'Dev (watch)', description: 'bornengine dev --watch', icon: 'debug-start', args: ({ entry }) => ['dev', entry, '--watch'] },
  { id: 'run', label: 'Run', description: 'bornengine run', icon: 'play', args: ({ entry }) => ['run', entry] },
  {
    id: 'build', label: 'Build…', description: 'bornengine build --os', icon: 'package',
    args: async ({ entry, pickBuildTarget }) => {
      const target = await pickBuildTarget();
      if (target === undefined) return undefined;
      return target === 'host' ? ['build', entry] : ['build', entry, '--os', target];
    },
  },
  { id: 'check', label: 'Check Perry compatibility', description: 'bornengine check', icon: 'checklist', args: ({ entry }) => ['check', entry] },
  { id: 'assets', label: 'Validate assets', description: 'bornengine assets validate', icon: 'file-media', args: () => ['assets', 'validate'] },
  {
    id: 'upgrade', label: 'Upgrade engine…', description: 'bornengine upgrade', icon: 'arrow-circle-up',
    args: async ({ askEngineVersion }) => {
      const version = await askEngineVersion();
      if (version === undefined) return undefined;
      return version === '' ? ['upgrade', '--latest'] : ['upgrade', version];
    },
  },
  { id: 'engine-current', label: 'Engine version', description: 'bornengine engine current', icon: 'versions', args: () => ['engine', 'current'] },
  { id: 'create-server', label: 'Create server', description: 'bornengine create server', icon: 'server', args: () => ['create', 'server'] },
  {
    id: 'ai-docs', label: 'Add AI docs…', description: 'bornengine --add-ai-docs', icon: 'book',
    args: async ({ askAiDocsName }) => {
      const name = await askAiDocsName();
      return name === undefined ? undefined : ['--add-ai-docs', name];
    },
  },
  { id: 'clean', label: 'Clean build files', description: 'bornengine clean', icon: 'trash', args: () => ['clean'] },
  { id: 'doctor', label: 'Doctor', description: 'bornengine doctor', icon: 'pulse', args: () => ['doctor'] },
  { id: 'info', label: 'Project info', description: 'bornengine info', icon: 'info', args: () => ['info'] },
];

export function findBornEngineCliShortcut(id: string): BornEngineCliShortcut | undefined {
  return BORNENGINE_CLI_SHORTCUTS.find((shortcut) => shortcut.id === id);
}

/** Reads `[project] entry` from perry.toml, falling back to the CLI's default entry file. */
export function parsePerryEntry(toml: string): string {
  let section = '';
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1]!.trim();
      continue;
    }
    if (section !== 'project') continue;
    const entry = /^entry\s*=\s*"([^"]+)"$/.exec(line) ?? /^entry\s*=\s*'([^']+)'$/.exec(line);
    if (entry) return entry[1]!;
  }
  return DEFAULT_ENTRY_FILE;
}

/** Quotes an argument for POSIX shells, PowerShell, and cmd when it contains anything beyond safe characters. */
export function quoteCliArg(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
}

export function formatBornEngineCliCommand(executable: string, args: readonly string[]): string {
  return [quoteCliArg(executable), ...args.map(quoteCliArg)].join(' ');
}

async function readEntry(api: typeof vscode, folderUri: vscode.Uri): Promise<string> {
  try {
    const bytes = await api.workspace.fs.readFile(api.Uri.joinPath(folderUri, 'perry.toml'));
    return parsePerryEntry(new TextDecoder().decode(bytes));
  } catch {
    return DEFAULT_ENTRY_FILE;
  }
}

async function chooseFolder(api: typeof vscode, folderUri?: vscode.Uri): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = api.workspace.workspaceFolders ?? [];
  if (folderUri) return folders.find((folder) => folder.uri.toString() === folderUri.toString());
  if (folders.length <= 1) return folders[0];
  return api.window.showWorkspaceFolderPick({ placeHolder: 'Run the BornEngine CLI in which project?' });
}

async function chooseShortcut(api: typeof vscode): Promise<BornEngineCliShortcut | undefined> {
  const picked = await api.window.showQuickPick(
    BORNENGINE_CLI_SHORTCUTS.map((shortcut) => ({
      label: `$(${shortcut.icon}) ${shortcut.label}`,
      description: shortcut.description,
      shortcut,
    })),
    { placeHolder: 'BornEngine CLI command', matchOnDescription: true },
  );
  return picked?.shortcut;
}

/** Runs a CLI shortcut in a reusable integrated terminal rooted at the project folder. */
export async function runBornEngineCli(api: typeof vscode, folderUri?: vscode.Uri, shortcutId?: string): Promise<void> {
  const folder = await chooseFolder(api, folderUri);
  if (!folder) {
    await api.window.showErrorMessage('Open a BornEngine project folder to run the BornEngine CLI.');
    return;
  }
  const shortcut = shortcutId ? findBornEngineCliShortcut(shortcutId) : await chooseShortcut(api);
  if (!shortcut) return;

  const entry = await readEntry(api, folder.uri);
  const args = await shortcut.args({
    entry,
    pickBuildTarget: async () => (await api.window.showQuickPick(
      BUILD_TARGETS.map((target) => ({ label: target === 'host' ? 'This computer' : target, target })),
      { placeHolder: 'Build for which OS?' },
    ))?.target,
    askEngineVersion: () => api.window.showInputBox({
      prompt: 'Engine version to install (leave empty for the latest release)',
      placeHolder: 'latest',
    }).then((value) => value?.trim()),
    askAiDocsName: () => api.window.showInputBox({
      prompt: 'File name for the BornEngine AI guide (.md is added)',
      value: 'ai_docs',
      validateInput: (value) => value.trim() === '' ? 'Enter a file name.' : undefined,
    }).then((value) => value?.trim()),
  });
  if (!args) return;

  const executable = api.workspace.getConfiguration('bornengineTools', folder.uri).get<string>('cliPath') || 'bornengine';
  const name = `BornEngine CLI · ${folder.name}`;
  const terminal = api.window.terminals.find((candidate) => candidate.name === name && candidate.exitStatus === undefined)
    ?? api.window.createTerminal({ name, cwd: folder.uri });
  terminal.show();
  terminal.sendText(formatBornEngineCliCommand(executable, args));
}
