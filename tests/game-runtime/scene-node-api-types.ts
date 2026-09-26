import type { Game, Model } from '@bornengine/engine';
import { GameObject, Scene, SceneNodeComponent } from '@bornengine/engine/game';

declare const game: Game;
declare const model: Model;

const scene = new Scene(game, { name: 'type-check' });
const manager = game.scenes;
const player = scene.addNode(new GameObject({ name: 'player' }));
const node = game.sceneGraph.createNode();
const created: SceneNodeComponent | null = node.isLoaded
  ? new SceneNodeComponent(node, { ownership: 'owned' })
  : null;

if (created !== null) {
  const configured: SceneNodeComponent = created
    .setVisible(true)
    .setColor({ r: 255, g: 255, b: 255, a: 255 })
    .setPbr(0.5, 0.1)
    .setTextureSlot(0)
    .attachModel(model, 2);
  if (player !== null) player.addComponent(configured);
}

manager.changeTo(scene);
