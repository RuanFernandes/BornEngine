import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { GameComponent } from '../../src/game/game-component';
import { GameScene } from '../../src/game/game-scene';
import { GUIProfiles, GuiProfile } from '../../src/gui/profile';
import { validColumnValue } from '../../src/storage/schema';
import { World2DComponentRegistry, World2DLoader } from '../../src/world2d';

// Perry 0.5.1520 segfaults when `value instanceof UserClass` receives an inline short string
// (1-5 characters created at runtime, e.g. by JSON.parse). Each check below sends such values
// through a guarded `instanceof` site and expects the ordinary non-instance result.

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

const parsed = JSON.parse(
  '{"short":"grass","one":"g","five":"abcde","six":"abcdef","empty":"","count":7,"flag":true,"none":null,"plain":{"a":1},"list":[1]}',
) as { [key: string]: unknown };
const keys = Object.keys(parsed);
expect(keys.length === 10, 'fixture exposes every parsed value kind');

const profileMessage = 'GUIProfiles.register expects a GuiProfile.';
for (let index = 0; index < keys.length; index++) {
  const key = keys[index];
  let message = '';
  try {
    GUIProfiles.register('probe-' + key, parsed[key] as GuiProfile);
  } catch (error) {
    message = (error as { message: string }).message;
  }
  expect(message === profileMessage, 'GUIProfiles.register rejects parsed ' + key + ' without crashing');
}
const profile = new GuiProfile();
GUIProfiles.register('probe-profile', profile);
expect(GUIProfiles.get('probe-profile') === profile, 'GUIProfiles.register still accepts a GuiProfile');

const owner: object = {};
const context = GameContext.create();
expect(context !== null, 'test creates an isolated GameContext');
if (context === null) process.exit(1);
bindGameContext(owner, context);

function worldWithComponent(kind: string): string {
  return JSON.stringify({
    format: 'bornengine.world2d',
    version: 1,
    id: 'probe',
    name: 'probe',
    assets: [],
    tilesets: [],
    layers: [
      {
        id: 'actors',
        type: 'objects',
        name: 'Actors',
        visible: true,
        opacity: 1,
        offset: { x: 0, y: 0 },
        parallax: { x: 1, y: 1 },
        properties: {},
        objects: [
          {
            id: 'probe-001',
            name: 'Probe',
            type: 'probe',
            position: { x: 0, y: 0 },
            rotation: 0,
            size: { x: 1, y: 1 },
            origin: { x: 0, y: 0 },
            visible: true,
            tags: [],
            properties: {},
            components: [{ kind, data: {} }],
          },
        ],
      },
    ],
    metadata: {},
  });
}

for (let index = 0; index < keys.length; index++) {
  const key = keys[index];
  const registry = new World2DComponentRegistry();
  const registered = registry.registerComponentFactory('probe.factory', () => parsed[key] as GameComponent);
  const scene = new GameScene(owner as Game);
  const loaded = new World2DLoader(registry).loadJSON(worldWithComponent('probe.factory'), scene);
  let rejected = false;
  for (let diagnosticIndex = 0; diagnosticIndex < loaded.diagnostics.length; diagnosticIndex++) {
    if (loaded.diagnostics[diagnosticIndex].code === 'invalid_factory_result') rejected = true;
  }
  expect(registered && !loaded.ok && rejected, 'World2DLoader rejects parsed ' + key + ' returned by a factory');
  scene.destroy();
}

const componentRegistry = new World2DComponentRegistry();
componentRegistry.registerComponentFactory('probe.component', () => new GameComponent());
const componentScene = new GameScene(owner as Game);
const componentLoad = new World2DLoader(componentRegistry).loadJSON(
  worldWithComponent('probe.component'),
  componentScene,
);
expect(componentLoad.ok && componentScene.objects.length === 1, 'World2DLoader still accepts a GameComponent');
componentScene.destroy();

for (let index = 0; index < keys.length; index++) {
  expect(!validColumnValue('blob', parsed[keys[index]]), 'blob column rejects parsed ' + keys[index]);
}
expect(validColumnValue('blob', new Uint8Array(3)), 'blob column still accepts a Uint8Array');

context.dispose();
console.log('PASS');
