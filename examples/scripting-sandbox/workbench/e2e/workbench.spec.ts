import { expect, test } from '@playwright/test';

test('monacoFillsEditorPane', async ({ page }) => {
  await page.goto('/');
  const host = page.getByTestId('editor-host');
  const monaco = page.locator('.monaco-editor').first();
  await expect(monaco).toBeVisible();

  const hostBox = await host.boundingBox();
  const editorBox = await monaco.boundingBox();
  expect(hostBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(editorBox!.width).toBeGreaterThan(200);
  expect(editorBox!.height).toBeGreaterThan(250);
  expect(Math.abs(editorBox!.width - hostBox!.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(editorBox!.height - hostBox!.height)).toBeLessThanOrEqual(2);
});

test('clientModelShowsTypeDiagnostics', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('diagnostics')).toHaveText('No TypeScript errors', { timeout: 15_000 });
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(`export default {
  update(ctx: BornEngineScriptContext) {
    const answer: string = 42;
    ctx.log?.(answer);
  },
};`);
  await expect(page.getByTestId('diagnostics')).toContainText('TypeScript error', { timeout: 10_000 });
  await expect(page.locator('#apply-script')).toBeDisabled();
});

test('clientModelRejectsCapabilitiesNotGrantedByThePreview', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('diagnostics')).toHaveText('No TypeScript errors', { timeout: 15_000 });
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(`export default {
  update(ctx: BornEngineScriptContext) {
    ctx.self.setPosition?.(10, 20, 0);
  },
};`);
  await expect(page.getByTestId('diagnostics')).toContainText('TypeScript error', { timeout: 10_000 });
  await expect(page.locator('#apply-script')).toBeDisabled();
});

test('previewBridgeRejectsForeignWindow', async ({ page }) => {
  await page.goto('/');
  const roomStatus = page.getByTestId('room-status');
  await expect(roomStatus).toHaveText('Room disconnected');
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      source: window,
      data: { type: 'preview:status', status: 'connected', message: 'spoofed' },
    }));
  });
  await expect(roomStatus).toHaveText('Room disconnected');
});

test('BornEngine WebAssembly preview starts its JavaScript game loop', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview-status')).toHaveText('Preview ready', { timeout: 30_000 });
  await expect(page.frameLocator('#game-preview').locator('#loading')).toHaveCount(0, { timeout: 10_000 });
});

test('serverRulesAutosaveAndHotReload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Server rules' }).click();
  await expect(page.locator('#server-script-select')).toHaveValue('rules.ts');
  const original = await page.evaluate(async () => {
    const response = await fetch('/__dev/server-scripts/rules.ts');
    return await response.json() as { source: string };
  });

  try {
    const marker = `// live-reload-e2e-${Date.now()}`;
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(`\n${marker}\n`);

    await expect(page.locator('#save-status')).toContainText('Applied · revision', { timeout: 15_000 });
    const saved = await page.evaluate(async () => {
      const response = await fetch('/__dev/server-scripts/rules.ts');
      return await response.json() as { source: string };
    });
    expect(saved.source).toContain(marker);
  } finally {
    await page.evaluate(async (source) => {
      await fetch('/__dev/server-scripts/rules.ts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source }),
      });
    }, original.source);
  }
});
