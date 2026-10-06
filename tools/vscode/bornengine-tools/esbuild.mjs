import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const extensionRoot = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(extensionRoot, 'dist');
const engineEditorEntry = path.resolve(extensionRoot, '../../../src/world2d/editor.ts');
const engineEditorAlias = {
  name: 'bornengine-world2d-editor',
  setup(builder) {
    builder.onResolve({ filter: /^@bornengine\/engine\/world2d\/editor$/ }, () => ({ path: engineEditorEntry }));
  },
};

await mkdir(dist, { recursive: true });
await Promise.all([
  build({
    entryPoints: [path.join(extensionRoot, 'src/extension.ts')],
    outfile: path.join(dist, 'extension.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode', 'node:worker_threads'],
    plugins: [engineEditorAlias],
  }),
  build({
    entryPoints: [path.join(extensionRoot, 'src/webview/mapEditor.ts')],
    outfile: path.join(dist, 'mapEditor.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome90'],
  }),
  build({
    entryPoints: [path.join(extensionRoot, 'src/webview/animationEditor.ts')],
    outfile: path.join(dist, 'animationEditor.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome90'],
  }),
  build({
    entryPoints: [path.join(extensionRoot, 'src/webview/spriteAnimationTemplateEditor.ts')],
    outfile: path.join(dist, 'spriteAnimationTemplateEditor.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome90'],
  }),
  build({
    entryPoints: [path.join(extensionRoot, 'src/webview/blueprintTemplateEditor.ts')],
    outfile: path.join(dist, 'blueprintTemplateEditor.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome90'],
  }),
  build({
    entryPoints: [path.join(extensionRoot, 'src/webview/blueprintEditor.ts')],
    outfile: path.join(dist, 'blueprintEditor.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome90'],
  }),
  build({
    entryPoints: [path.join(extensionRoot, 'src/maps/mapCodecWorker.ts')],
    outfile: path.join(dist, 'mapCodecWorker.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['node:worker_threads'],
    plugins: [engineEditorAlias],
  }),
]);
await Promise.all([
  cp(path.join(extensionRoot, 'media/bornengine.svg'), path.join(dist, 'bornengine.svg')),
  cp(path.join(extensionRoot, 'src/maps/mapEditor.css'), path.join(dist, 'mapEditor.css')),
  cp(path.join(extensionRoot, 'src/animations/animationEditor.css'), path.join(dist, 'animationEditor.css')),
  cp(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateEditor.css'), path.join(dist, 'spriteAnimationTemplateEditor.css')),
  cp(path.join(extensionRoot, 'src/blueprints/blueprintTemplateEditor.css'), path.join(dist, 'blueprintTemplateEditor.css')),
  cp(path.join(extensionRoot, 'src/blueprints/blueprintEditor.css'), path.join(dist, 'blueprintEditor.css')),
]);
