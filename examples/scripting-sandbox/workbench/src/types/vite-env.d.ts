/// <reference types="vite/client" />

declare module 'monaco-editor/editor/editor.worker?worker' {
  const EditorWorker: new () => Worker;
  export default EditorWorker;
}

declare module 'monaco-editor/language/typescript/ts.worker?worker' {
  const TypeScriptWorker: new () => Worker;
  export default TypeScriptWorker;
}
