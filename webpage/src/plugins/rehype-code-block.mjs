const LANGUAGE_ALIASES = Object.freeze({
  bash: 'shell',
  js: 'javascript',
  jsx: 'javascript',
  md: 'plaintext',
  sh: 'shell',
  shell: 'shell',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'typescript',
});

function normalizeLanguage(className, dataLanguage) {
  const classes = Array.isArray(className) ? className : [className];
  const languageClass = classes.find((value) => String(value).startsWith('language-'));
  const language = languageClass
    ? String(languageClass).slice('language-'.length).toLowerCase()
    : String(dataLanguage ?? 'plaintext').toLowerCase();
  return LANGUAGE_ALIASES[language] ?? language;
}

function firstElementChild(node) {
  return (node.children ?? []).find((child) => child.type === 'element');
}

function text(value) {
  return { type: 'text', value };
}

function element(tagName, properties = {}, children = []) {
  return { type: 'element', tagName, properties, children };
}

function wrapCodeBlock(pre, code) {
  const dataLanguage = pre.properties?.dataLanguage
    ?? pre.properties?.['data-language']
    ?? code.properties?.dataLanguage
    ?? code.properties?.['data-language'];
  const language = normalizeLanguage(code.properties?.className, dataLanguage);
  const fallback = {
    ...pre,
    properties: {
      ...(pre.properties ?? {}),
      dataMonacoFallback: true,
    },
  };

  return element(
    'figure',
    {
      className: ['code-block', 'code-block--docs'],
      dataCodeBlock: true,
      dataMonacoCode: true,
      dataMonacoLanguage: language,
    },
    [
      element('figcaption', {}, [
        element('span', { className: ['code-block__language'] }, [text(language)]),
        element('button', { type: 'button', dataCopyCode: true }, [text('Copy')]),
        element('span', { className: ['code-block__status'], ariaLive: 'polite' }),
      ]),
      element('div', {
        className: ['code-block__monaco'],
        dataMonacoEditor: true,
        ariaHidden: 'true',
        ariaLabel: `${language} code example`,
      }),
      fallback,
    ],
  );
}

function transformChildren(node) {
  if (!Array.isArray(node.children)) return;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child.type !== 'element') continue;

    if (child.tagName === 'pre') {
      const code = firstElementChild(child);
      if (code?.tagName === 'code') {
        node.children[index] = wrapCodeBlock(child, code);
        continue;
      }
    }

    transformChildren(child);
  }
}

export default function rehypeCodeBlock() {
  return (tree) => {
    transformChildren(tree);
  };
}
