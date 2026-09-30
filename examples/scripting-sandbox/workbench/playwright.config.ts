import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const developmentToken = randomBytes(32).toString('hex');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
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
      url: 'http://127.0.0.1:2568/health',
      reuseExistingServer: !process.env.CI,
      env: {
        HOST: '127.0.0.1',
        PORT: '2568',
        BORNENGINE_SANDBOX_DEV: '1',
        BORNENGINE_SANDBOX_DEV_TOKEN: developmentToken,
      },
      timeout: 30_000,
    },
    {
      command: 'node_modules/.bin/vite --host 127.0.0.1 --port 5173',
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      env: { BORNENGINE_SANDBOX_DEV_TOKEN: developmentToken },
      timeout: 30_000,
    },
  ],
});
