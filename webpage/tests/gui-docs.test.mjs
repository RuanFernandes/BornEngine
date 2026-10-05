import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const site = new URL('../src/content/docs/', import.meta.url);
const readSite = (path) => readFile(new URL(path, site), 'utf8');
const readLocal = (path) => readFile(new URL(`../../docs/${path}`, import.meta.url), 'utf8');

test('navigation links the retained GUI reference and guide', async () => {
  const navigation = await readFile(new URL('../src/data/navigation.ts', import.meta.url), 'utf8');
  assert.match(navigation, /title: 'GUI controls', href: '\/docs\/api\/gui\//);
  assert.match(navigation, /title: 'GUI controls guide', href: '\/docs\/guides\/gui-controls\//);
});

test('the API reference covers every public retained control and core helper', async () => {
  const api = await readSite('api/gui.md');
  for (const name of [
    'GUI', 'GuiWindow', 'GuiPanel', 'GuiScroll', 'GuiBitmapBorder', 'GuiStretch', 'GuiFrameSet',
    'GuiButtonBase', 'GuiButton', 'GuiCheckBox', 'GuiRadioButton', 'GuiBitmapButton', 'GuiText',
    'GuiMLText', 'GuiTextEdit', 'GuiMLTextEdit', 'GuiTextEditSlider', 'GuiSlider', 'GuiArray',
    'GuiPopUpMenu', 'GuiPopUpEdit', 'GuiTreeView', 'GuiTextList', 'GuiTab', 'GuiMenu',
    'GuiContextMenu', 'GuiBitmap', 'GuiShowImg', 'GuiProgress', 'GuiDrawingPanel',
  ]) assert.ok(api.includes(name), `GUI API reference is missing ${name}`);
  for (const helper of ['center()', 'centerHorizontal()', 'centerVertical()', 'setX(', 'getX()', 'getParent()', 'addControl(', 'removeControl(', 'setProfile(', 'setOwnProfile(']) {
    assert.ok(api.includes(helper), `GUI API reference is missing ${helper}`);
  }
  assert.match(api, /next update|following update|next frame/i);
  assert.match(api, /game\.ui/);
});

test('the local API reference mirrors the website and both immediate UI pages link it', async () => {
  const siteApi = (await readSite('api/gui.md')).replace(/^---[\s\S]*?---\n/, '');
  const localApi = await readLocal('api/gui.md');
  assert.equal(localApi.trim(), siteApi.trim());
  assert.match(await readSite('api/ui.md'), /api\/gui|retained API|GUI API/i);
  assert.match(await readLocal('api/ui.md'), /gui\.md|GUI API|retained GUI/i);
  assert.match(await readSite('api/index.md'), /engine\/gui|Retained GUI|gui\//);
  assert.match(await readSite('api/debug-ui.md'), /api\/gui|GUI API/);
  assert.match(await readSite('guides/audio-and-ui.md'), /api\/gui|GUI controls/);
});

test('the guide mirrors the local copy and contains an end-to-end example', async () => {
  const siteGuide = (await readSite('guides/gui-controls.md')).replace(/^---[\s\S]*?---\n/, '');
  const localGuide = await readLocal('guides/gui-controls.md');
  assert.equal(localGuide.trim(), siteGuide.trim());
  assert.match(siteGuide, /extends (GUI|GuiButton|GuiScroll)/);
  assert.match(siteGuide, /new GuiScroll/);
  assert.match(siteGuide, /stopPropagation/);
  assert.match(siteGuide, /setOwnProfile/);
  assert.match(siteGuide, /this\.audio/);
});

test('watchOS limitation is clearly temporary and names the planned SwiftUI adapter', async () => {
  const pages = [
    await readSite('api/gui.md'),
    await readSite('guides/gui-controls.md'),
    await readSite('platforms/apple.md'),
    await readLocal('watchos-target.md'),
  ];
  for (const page of pages) {
    assert.match(page, /(?:GUI|retained `game\.gui`) controls do not work on watchOS in the current release/i);
    assert.match(page, /controls do not\s+render/i);
    assert.match(page, /GUI input\/events are unavailable/i);
    assert.match(page, /limitation\s+is temporary/i);
    assert.match(page, /future SwiftUI adapter/i);
  }
});
