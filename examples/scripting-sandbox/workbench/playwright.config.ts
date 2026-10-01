import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamePort = process.env.BORNENGINE_SANDBOX_E2E_GAME_PORT ?? '2578';
const apiPort = process.env.BORNENGINE_SANDBOX_E2E_API_PORT ?? '2579';
const workbenchPort = process.env.BORNENGINE_SANDBOX_E2E_WORKBENCH_PORT ?? '5180';
const editorOrigin = `http://127.0.0.1:${workbenchPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: editorOrigin,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        '--enable-unsafe-swiftshader',
        '--enable-webgpu',
        '--enable-unsafe-webgpu',
        '--use-webgpu-adapter=swiftshader',
        '--enable-dawn-features=allow_unsafe_apis',
        '--disable-dawn-features=use_dxc',
        '--enable-webgpu-developer-features',
        '--use-gpu-in-tests',
        '--enable-accelerated-2d-canvas',
      ],
    },
  },
  webServer: [
    {
      command: 'node_modules/.bin/tsx src/index.ts',
      cwd: path.join(projectRoot, 'server'),
      url: `http://127.0.0.1:${gamePort}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        HOST: '127.0.0.1',
        PORT: gamePort,
        BORNENGINE_SANDBOX_DEV: '1',
        BORNENGINE_SANDBOX_DEV_PORT: apiPort,
      },
      timeout: 30_000,
    },
    {
      command: `node_modules/.bin/vite --host 127.0.0.1 --port ${workbenchPort}`,
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      url: editorOrigin,
      reuseExistingServer: !process.env.CI,
      env: { BORNENGINE_SANDBOX_DEV: '1', BORNENGINE_SANDBOX_DEV_PORT: apiPort, VITE_SANDBOX_GAME_ENDPOINT: `ws://127.0.0.1:${gamePort}` },
      timeout: 30_000,
    },
  ],
});
