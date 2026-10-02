// Documentation snippets only need syntax colors, not JSON validation or completion workers.
export function registerJsonLanguage(monaco) {
  monaco.languages.register({ id: 'json', extensions: ['.json'], aliases: ['JSON', 'json'] });
  monaco.languages.setMonarchTokensProvider('json', {
    tokenizer: {
      root: [
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
        [/"(?:\\.|[^"\\])*"(?=\s*:)/, 'string.key.json'],
        [/"(?:\\.|[^"\\])*"/, 'string.value.json'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number.json'],
        [/\b(?:true|false|null)\b/, 'keyword.json'],
        [/[{}\[\]]/, 'delimiter.bracket.json'],
        [/[,:]/, 'delimiter.json'],
        [/\s+/, 'white'],
      ],
      comment: [
        [/[^*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/\*/, 'comment'],
      ],
    },
  });
}
