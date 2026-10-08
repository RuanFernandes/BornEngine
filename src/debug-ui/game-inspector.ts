import type { Game, GameDebugOptions } from '../core/game';
import type { RendererStats } from '../core/renderer';
import { getFPS } from '../core/internal';
import { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';

const WINDOW_METRICS = 4000000000;
const WINDOW_SCENE = 4000000001;
const WINDOW_ASSETS = 4000000002;
const WINDOW_SCRIPTS = 4000000003;
const OBJECT_ID_OFFSET = 4000010000;
const MAX_VISIBLE_OBJECTS = 256;
const MAX_HIERARCHY_DEPTH = 64;
const MAX_VISIBLE_SCRIPTS = 64;
const MAX_SCRIPT_ERROR_CHARS = 180;

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
  private readonly showScripts: boolean;

  constructor(
    private readonly game: Game,
    options?: boolean | GameDebugOptions,
  ) {
    const config = typeof options === 'object' && options !== null ? options : null;
    this.enabled = options === true || (config !== null && config.enabled === true);
    this.showMetrics = config === null || config.metrics !== false;
    this.showSceneHierarchy = config === null || config.sceneHierarchy !== false;
    this.showAssets = config === null || config.assets !== false;
    this.showScripts = config === null || config.scripts !== false;
  }

  render(deltaTime: number): void {
    if (this.disposed || !this.enabled || !this.game.isReady || !this.game.debugUi.isAvailable()) return;

    if (this.showMetrics) this.renderMetrics(deltaTime);
    if (this.showSceneHierarchy) this.renderSceneHierarchy();
    if (this.showAssets) this.renderAssets();
    if (this.showScripts) this.renderScripts();
  }

  dispose(): void {
    this.disposed = true;
  }

  private renderMetrics(deltaTime: number): void {
    const ui = this.game.debugUi;
    ui.beginWindow(WINDOW_METRICS, 'BornEngine | Performance', 16, 16, 300, 252);
    const stats: RendererStats = this.game.renderer.stats;
    const gameStats = this.game.stats;
    const fps = stats.fps > 0 ? stats.fps : getFPS();
    const frameTime = stats.frameIntervalMs > 0 ? stats.frameIntervalMs : deltaTime * 1000;
    ui.label(WINDOW_METRICS + 1, 'FPS: ' + formatNumber(fps, 1));
    ui.label(WINDOW_METRICS + 2, 'Frame: ' + formatNumber(frameTime, 2) + ' ms');

    ui.label(WINDOW_METRICS + 3, '2D submissions: ' + stats.drawSubmissions2D);
    ui.label(WINDOW_METRICS + 4, 'Sprites: ' + stats.spritesDrawn);
    ui.label(WINDOW_METRICS + 5, 'Culled sprites: ' + stats.spritesCulled);
    ui.label(WINDOW_METRICS + 6, 'Update: ' + formatNumber(gameStats.updateTimeMs, 2) + ' ms');
    ui.label(WINDOW_METRICS + 7, 'Render: ' + formatNumber(gameStats.renderTimeMs, 2) + ' ms');
    ui.label(
      WINDOW_METRICS + 8,
      'Objects: ' + gameStats.activeObjectCount + ' active / ' + gameStats.objectCount + ' total',
    );
    ui.label(
      WINDOW_METRICS + 9,
      'Components: ' + gameStats.activeComponentCount + ' active / ' + gameStats.componentCount + ' total',
    );
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
    ui.label(
      treeId + 2,
      'Position: ' +
        formatNumber(position.x, 2) +
        ', ' +
        formatNumber(position.y, 2) +
        ', ' +
        formatNumber(position.z, 2),
    );
    ui.label(
      treeId + 3,
      'Scale: ' + formatNumber(scale.x, 2) + ', ' + formatNumber(scale.y, 2) + ', ' + formatNumber(scale.z, 2),
    );

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
    ui.beginWindow(WINDOW_ASSETS, 'BornEngine | Assets', 16, 280, 300, 144);
    ui.label(WINDOW_ASSETS + 1, 'Textures: ' + this.game.assets.textureCount);
    ui.endWindow(WINDOW_ASSETS);
  }

  private renderScripts(): void {
    const ui = this.game.debugUi;
    const windowWidth = this.game.window.width;
    const windowHeight = this.game.window.height;
    const panelWidth = Math.min(360, Math.max(1, windowWidth - 32));
    const panelHeight = Math.min(420, Math.max(1, windowHeight - 32));
    const x = Math.max(0, windowWidth - panelWidth - 16);
    const y = Math.max(0, windowHeight - panelHeight - 16);
    ui.beginWindow(WINDOW_SCRIPTS, 'BornEngine | Scripts', x, y, panelWidth, panelHeight);

    const runtime = this.game.scripting;
    if (!runtime.isSupported) {
      ui.label(WINDOW_SCRIPTS + 1, 'Embedded JavaScript is unavailable on this target');
      ui.endWindow(WINDOW_SCRIPTS);
      return;
    }

    const components = runtime._componentsSnapshot();
    if (components.length === 0) {
      ui.label(WINDOW_SCRIPTS + 1, 'No script components');
      ui.endWindow(WINDOW_SCRIPTS);
      return;
    }

    const visibleCount = Math.min(components.length, MAX_VISIBLE_SCRIPTS);
    for (let index = 0; index < visibleCount; index++) {
      const script = components[index];
      const id = WINDOW_SCRIPTS + 10 + index * 4;
      const owner = script.gameObject;
      const ownerName = owner === null ? 'Unattached script' : owner.name === '' ? 'GameObject' : owner.name;
      const ownerId = owner === null ? index + 1 : owner.id;
      ui.label(id, ownerName + ' #' + ownerId + ' · ' + script.status);
      ui.label(id + 1, 'Memory: ' + formatBytes(script.memoryUsed));
      ui.label(id + 2, 'Callback: ' + formatNumber(script.lastCallbackMs, 2) + ' ms');
      if (script.error !== null) {
        ui.label(id + 3, 'Error: ' + truncate(script.error, MAX_SCRIPT_ERROR_CHARS));
      }
    }

    if (components.length > MAX_VISIBLE_SCRIPTS) {
      ui.label(WINDOW_SCRIPTS + 2, 'Showing ' + MAX_VISIBLE_SCRIPTS + ' of ' + components.length + ' scripts');
    }
    ui.endWindow(WINDOW_SCRIPTS);
  }
}

function formatNumber(value: number, digits: number): string {
  const scale = digits === 1 ? 10 : 100;
  return '' + Math.round(value * scale) / scale;
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return formatNumber(value / (1024 * 1024), 2) + ' MiB';
  if (value >= 1024) return formatNumber(value / 1024, 2) + ' KiB';
  return formatNumber(value, 2) + ' B';
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return value.slice(0, limit - 1) + '…';
}
