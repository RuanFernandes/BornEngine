import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEngineRoot } from '../scripts/engine-root.mjs';

const workbenchRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(workbenchRoot, '..');
const engineRoot = resolveEngineRoot(projectRoot, process.env.BORNENGINE_ENGINE_PATH);
const localEngineSource = path.join(engineRoot, 'src');

const developmentToken = process.env.BORNENGINE_SANDBOX_DEV_TOKEN;
const editorOrigin = 'http://127.0.0.1:5173';

export default defineConfig(({ command }) => {
  const serverEditorEnabled = command === 'serve' && typeof developmentToken === 'string';
  return {
    appType: 'spa',
    resolve: {
      alias: [
        { find: '@bornengine/engine', replacement: localEngineSource },
        { find: 'perry/thread', replacement: path.resolve(workbenchRoot, 'src/preview/browser-thread.ts') },
      ],
    },
    plugins: [{
      name: 'sandbox-server-editor-dev-only',
      transformIndexHtml(html: string) {
        if (serverEditorEnabled) return html;
        return html
          .replace(/<!-- server-script-editor:start -->[\s\S]*?<!-- server-script-editor:end -->/g, '')
          .replace(/<!-- server-script-controls:start -->[\s\S]*?<!-- server-script-controls:end -->/g, '');
      },
    }],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: serverEditorEnabled ? {
        '/__dev/server-scripts': {
          target: 'http://127.0.0.1:2569',
          changeOrigin: false,
          configure(proxy) {
            proxy.on('proxyReq', (request, incoming) => {
              request.setHeader('x-bornengine-dev-token', developmentToken);
              if (incoming.headers.origin === undefined) {
                try {
                  const referer = new URL(incoming.headers.referer ?? '');
                  if (referer.origin === editorOrigin) request.setHeader('origin', editorOrigin);
                } catch (_error) {
                  // The server API rejects requests without an exact allowed origin.
                }
              }
            });
          },
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
