import assert from 'node:assert/strict';
import test from 'node:test';
import rehypeCodeBlock from '../src/plugins/rehype-code-block.mjs';

test('wraps a TypeScript fence in the shared code block contract', () => {
  const tree = {
    type: 'root',
    children: [{
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [{
        type: 'element',
        tagName: 'code',
        properties: { className: ['language-ts'] },
        children: [{ type: 'text', value: 'const answer: number = 42;' }],
      }],
    }],
  };

  rehypeCodeBlock()(tree);
  const figure = tree.children[0];
  assert.equal(figure.tagName, 'figure');
  assert.ok(figure.properties.dataCodeBlock);
  assert.ok(figure.properties.dataMonacoCode);
  assert.equal(figure.properties.dataMonacoLanguage, 'typescript');
  assert.equal(figure.children[1].properties.dataMonacoEditor, true);
  assert.equal(figure.children[2].properties.dataMonacoFallback, true);
});

test('uses the highlighter language when the code class has been consumed', () => {
  const tree = {
    type: 'root',
    children: [{
      type: 'element',
      tagName: 'pre',
      properties: { 'data-language': 'ts' },
      children: [{
        type: 'element',
        tagName: 'code',
        properties: {},
        children: [{ type: 'text', value: 'const answer: number = 42;' }],
      }],
    }],
  };

  rehypeCodeBlock()(tree);
  assert.equal(Reflect.get(tree.children[0].properties, 'dataMonacoLanguage'), 'typescript');
});

test('accepts a language marker attached to the code node', () => {
  const tree = {
    type: 'root',
    children: [{
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [{
        type: 'element',
        tagName: 'code',
        properties: { 'data-language': 'ts' },
        children: [{ type: 'text', value: 'const answer: number = 42;' }],
      }],
    }],
  };

  rehypeCodeBlock()(tree);
  assert.equal(Reflect.get(tree.children[0].properties, 'dataMonacoLanguage'), 'typescript');
});
