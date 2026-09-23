import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMonacoEditorOptions,
  monacoLanguage,
  monacoTheme,
} from '../src/scripts/monaco-code.mjs';

test('normalizes supported code block languages for Monaco', () => {
  assert.equal(monacoLanguage('typescript'), 'typescript');
  assert.equal(monacoLanguage('ts'), 'typescript');
  assert.equal(monacoLanguage('bash'), 'shell');
  assert.equal(monacoLanguage('text'), 'plaintext');
  assert.equal(monacoLanguage('unknown-language'), 'plaintext');
});

test('selects a Monaco theme from the page theme', () => {
  assert.equal(monacoTheme('ink'), 'vs-dark');
  assert.equal(monacoTheme('paper'), 'vs');
});

test('creates a restrained read-only editor configuration', () => {
  const options = createMonacoEditorOptions({
    code: 'const answer = 42;',
    language: 'typescript',
    theme: 'ink',
  });

  assert.equal(options.value, 'const answer = 42;');
  assert.equal(options.language, 'typescript');
  assert.equal(options.theme, 'vs-dark');
  assert.equal(options.readOnly, true);
  assert.equal(options.minimap.enabled, false);
  assert.equal(options.automaticLayout, true);
  assert.equal(options.scrollBeyondLastLine, false);
});
