import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/language/typescript/monaco.contribution';
import { ModuleKind, ScriptTarget, typescriptDefaults } from 'monaco-editor/languages/features/typescript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import clientScriptApi from './types/client-script-api.d.ts?raw';
import serverRuleApi from './types/server-rule-api.d.ts?raw';
import './styles.css';

type MonacoEnvironment = typeof globalThis & {
  MonacoEnvironment: { getWorker(workerId: string, label: string): Worker };
};

(globalThis as MonacoEnvironment).MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker();
    return new EditorWorker();
  },
};

typescriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  allowImportingTsExtensions: true,
  module: ModuleKind.ESNext,
  noEmit: false,
  target: ScriptTarget.ES2020,
  strict: true,
});
typescriptDefaults.addExtraLib(clientScriptApi, 'file:///bornengine/types/client-script-api.d.ts');
typescriptDefaults.addExtraLib(serverRuleApi, 'file:///bornengine/types/server-rule-api.d.ts');

const root = document.getElementById('app');
if (root === null) throw new Error('The scripting manager root is missing.');

createRoot(root).render(<App />);
