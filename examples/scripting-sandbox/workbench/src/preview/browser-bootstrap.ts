import { installBrowserFfi } from './browser-host.js';

interface WebPreviewWindow extends Window {
  __bloomReady?: Promise<void>;
  __ffiImports?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const loading = document.getElementById('loading');
  if (loading !== null) loading.textContent = `Preview failed: ${message}`;
  window.parent.postMessage({ type: 'preview:status', status: 'error', message }, window.location.origin);
  console.error('[BornEngine preview]', error);
}

async function startPreview(): Promise<void> {
  const previewWindow = window as WebPreviewWindow;
  if (previewWindow.__bloomReady === undefined) {
    throw new Error('The WebAssembly preview page is missing its startup signal.');
  }

  const engineBootstrap = new URL('./native/bloom_glue.js', window.location.href);
  await import(/* @vite-ignore */ engineBootstrap.href);
  await previewWindow.__bloomReady;

  if (!isRecord(previewWindow.__ffiImports)) {
    throw new Error('BornEngine initialized without exposing its browser FFI.');
  }
  installBrowserFfi(globalThis as unknown as Record<string, unknown>, previewWindow.__ffiImports);
  await import('./entry.js');
}

void startPreview().catch(reportStartupFailure);
