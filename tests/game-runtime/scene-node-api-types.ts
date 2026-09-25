import { GameObject, Scene, SceneManager, SceneNodeComponent } from '@bornengine/engine/game';
import type { Model } from '@bornengine/engine/core';

declare const model: Model;

const scene = new Scene({ name: 'type-check' });
const manager = new SceneManager();
const player = scene.addNode(new GameObject({ name: 'player' }));
const created: SceneNodeComponent | null = SceneNodeComponent.create();

if (created !== null) {
  const configured: SceneNodeComponent = created
    .setVisible(true)
    .setColor(255, 255, 255, 255)
    .setPbr(0.5, 0.1)
    .setTexture(0)
    .attachModel(model, 2);
  if (player !== null) player.addComponent(configured);
}

manager.changeTo(scene);
