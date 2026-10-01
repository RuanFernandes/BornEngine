import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEngineRoot } from '../scripts/engine-root.mjs';

const workbenchRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(workbenchRoot, '..');
const engineRoot = resolveEngineRoot(projectRoot, process.env.BORNENGINE_ENGINE_PATH);
const localEngineSource = path.join(engineRoot, 'src');

const devApiPort = process.env.BORNENGINE_SANDBOX_DEV_PORT ?? '2569';

export default defineConfig(({ command }) => {
  const serverEditorEnabled = command === 'serve' && process.env.BORNENGINE_SANDBOX_DEV === '1';
  return {
    appType: 'spa',
    resolve: {
      alias: [
        { find: '@bornengine/engine', replacement: localEngineSource },
        { find: 'perry/thread', replacement: path.resolve(workbenchRoot, 'src/preview/browser-thread.ts') },
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: serverEditorEnabled ? {
        '/__dev/server-scripts': {
          target: `http://127.0.0.1:${devApiPort}`,
          changeOrigin: false,
        },
      } : undefined,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: {
          app: path.resolve(workbenchRoot, 'index.html'),
          preview: path.resolve(workbenchRoot, 'preview/index.html'),
        },
      },
    },
  };
});
