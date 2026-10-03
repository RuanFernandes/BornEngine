import assert from 'node:assert/strict';
import test from 'node:test';
import { registerJsonLanguage } from '../src/scripts/json-language.mjs';
import {
  createMonacoEditorOptions,
  monacoLanguage,
  monacoTheme,
  resolveMonacoBlockLanguage,
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

test('prefers the static fallback language when the block marker is plaintext', () => {
  assert.equal(resolveMonacoBlockLanguage({ blockLanguage: 'plaintext', fallbackLanguage: 'ts' }), 'typescript');
  assert.equal(resolveMonacoBlockLanguage({ blockLanguage: 'typescript', fallbackLanguage: 'ts' }), 'typescript');
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

test('JSON snippets keep syntax colors without loading a language service', () => {
  let registered;
  let provider;
  registerJsonLanguage({
    languages: {
      register(language) { registered = language; },
      setMonarchTokensProvider(id, tokens) {
        assert.equal(id, 'json');
        provider = tokens;
      },
    },
  });

  assert.equal(registered.id, 'json');
  const rules = provider.tokenizer.root;
  const tokenFor = (source) => rules.find(([pattern]) => pattern.test(source))?.[1];
  assert.equal(tokenFor('"name":'), 'string.key.json');
  assert.equal(tokenFor('"hello"'), 'string.value.json');
  assert.equal(tokenFor('-12.5e+2'), 'number.json');
  assert.equal(tokenFor('true'), 'keyword.json');
  assert.equal(tokenFor('{'), 'delimiter.bracket.json');
});
