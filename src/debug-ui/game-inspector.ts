import type { Game, GameDebugOptions } from '../core/game';
import { getFPS } from '../core/internal';
import { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';

const WINDOW_METRICS = 4000000000;
const WINDOW_SCENE = 4000000001;
const WINDOW_ASSETS = 4000000002;
const OBJECT_ID_OFFSET = 4000010000;
const MAX_VISIBLE_OBJECTS = 256;
const MAX_HIERARCHY_DEPTH = 64;

/**
 * Engine-owned diagnostics drawn after the game's render hook. All widgets
 * use the Game's optional Dear ImGui surface and disappear on unsupported
 * targets or builds without the `debug-ui` feature.
 * @internal
 */
export class GameInspector {
  private disposed = false;
  private readonly enabled: boolean;
  private readonly showMetrics: boolean;
  private readonly showSceneHierarchy: boolean;
  private readonly showAssets: boolean;

  constructor(private readonly game: Game, options?: boolean | GameDebugOptions) {
    const config = typeof options === 'object' && options !== null ? options : null;
    this.enabled = options === true || (config !== null && config.enabled === true);
    this.showMetrics = config === null || config.metrics !== false;
    this.showSceneHierarchy = config === null || config.sceneHierarchy !== false;
    this.showAssets = config === null || config.assets !== false;
  }

  render(deltaTime: number): void {
    if (this.disposed || !this.enabled || !this.game.isReady ||
        !this.game.debugUi.isAvailable()) return;

    if (this.showMetrics) this.renderMetrics(deltaTime);
    if (this.showSceneHierarchy) this.renderSceneHierarchy();
    if (this.showAssets) this.renderAssets();
  }

  dispose(): void {
    this.disposed = true;
  }

  private renderMetrics(deltaTime: number): void {
    const ui = this.game.debugUi;
    ui.beginWindow(WINDOW_METRICS, 'BornEngine | Performance', 16, 16, 300, 176);
    const renderer: any = this.game.renderer as any;
    const stats: any = renderer.stats === undefined || renderer.stats === null ? null : renderer.stats;
    const fps = stats !== null && stats.fps !== undefined ? stats.fps : getFPS();
    const frameTime = stats !== null && stats.frameIntervalMs !== undefined
      ? stats.frameIntervalMs
      : deltaTime * 1000;
    ui.label(WINDOW_METRICS + 1, 'FPS: ' + formatNumber(fps, 1));
    ui.label(WINDOW_METRICS + 2, 'Frame: ' + formatNumber(frameTime, 2) + ' ms');

    if (stats !== null && stats.drawCalls2D !== undefined) {
      ui.label(WINDOW_METRICS + 3, '2D draw calls: ' + stats.drawCalls2D);
    }
    if (stats !== null && stats.spritesDrawn !== undefined) {
      ui.label(WINDOW_METRICS + 4, 'Sprites: ' + stats.spritesDrawn);
    }
    if (stats !== null && stats.spritesCulled !== undefined) {
      ui.label(WINDOW_METRICS + 5, 'Culled sprites: ' + stats.spritesCulled);
    }
    ui.endWindow(WINDOW_METRICS);
  }

  private renderSceneHierarchy(): void {
    const ui = this.game.debugUi;
    ui.beginWindow(WINDOW_SCENE, 'BornEngine | Scene', 328, 16, 340, 420);
    const scene = this.game.scenes.currentScene;
    if (scene === null) {
      ui.label(WINDOW_SCENE + 1, 'No active scene');
      ui.endWindow(WINDOW_SCENE);
      return;
    }

    const sceneName = scene.name === '' ? 'Scene' : scene.name;
    ui.label(WINDOW_SCENE + 1, sceneName + ' · ' + scene.state);
    const objects = scene.objects;
    ui.label(WINDOW_SCENE + 2, 'Objects: ' + objects.length);
    const remaining = [MAX_VISIBLE_OBJECTS];
    let rootCount = 0;

    for (let index = 0; index < objects.length; index++) {
      const object = objects[index];
      if (object.parent !== null) continue;
      rootCount++;
      if (remaining[0] <= 0) break;
      this.renderObject(object, 0, remaining);
    }

    if (rootCount === 0) ui.label(WINDOW_SCENE + 3, 'No GameObjects');
    if (objects.length > MAX_VISIBLE_OBJECTS) {
      ui.label(WINDOW_SCENE + 4, 'Showing the first ' + MAX_VISIBLE_OBJECTS + ' objects');
    }
    ui.endWindow(WINDOW_SCENE);
  }

  private renderObject(object: GameObject, depth: number, remaining: number[]): void {
    if (remaining[0] <= 0) return;
    remaining[0]--;

    const ui = this.game.debugUi;
    const label = object.name === '' ? 'GameObject #' + object.id : object.name + ' #' + object.id;
    const treeId = OBJECT_ID_OFFSET + object.id * 8;
    if (!ui.beginTreeNode(treeId, label)) return;

    const state = object.activeInHierarchy ? 'Active' : 'Inactive';
    ui.label(treeId + 1, state + ' · ' + object.getComponents(GameComponent).length + ' components');
    const position = object.transform.worldPosition;
    const scale = object.transform.worldScale;
    ui.label(treeId + 2, 'Position: ' + formatNumber(position.x, 2) + ', ' +
      formatNumber(position.y, 2) + ', ' + formatNumber(position.z, 2));
    ui.label(treeId + 3, 'Scale: ' + formatNumber(scale.x, 2) + ', ' +
      formatNumber(scale.y, 2) + ', ' + formatNumber(scale.z, 2));

    if (depth >= MAX_HIERARCHY_DEPTH) {
      ui.label(treeId + 4, 'Hierarchy depth limit reached');
      ui.endTreeNode(treeId);
      return;
    }

    const children = object.children;
    for (let index = 0; index < children.length; index++) {
      this.renderObject(children[index], depth + 1, remaining);
      if (remaining[0] <= 0) break;
    }
    ui.endTreeNode(treeId);
  }

  private renderAssets(): void {
    const ui = this.game.debugUi;
    ui.beginWindow(WINDOW_ASSETS, 'BornEngine | Assets', 16, 208, 300, 144);
    const assets: any = (this.game as any).assets;
    if (assets === undefined || assets === null) {
      ui.label(WINDOW_ASSETS + 1, 'Asset manager unavailable');
    } else {
      if (assets.textureCount !== undefined) {
        ui.label(WINDOW_ASSETS + 1, 'Textures: ' + assets.textureCount);
      }
      if (assets.assetCount !== undefined) {
        ui.label(WINDOW_ASSETS + 2, 'Cached assets: ' + assets.assetCount);
      }
    }
    ui.endWindow(WINDOW_ASSETS);
  }
}

function formatNumber(value: number, digits: number): string {
  const scale = digits === 1 ? 10 : 100;
  return '' + (Math.round(value * scale) / scale);
}
