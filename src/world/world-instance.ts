import type { ContextResource, GameContext } from '../core/context';
import type { Game } from '../core/game';
import { SceneNode } from '../scene/scene-node';
import { adoptSceneNode, adoptSceneNodeParent } from '../scene/ownership';
import type { Model } from '../models/model';
import type { WorldData } from './data';
import { instantiateWorld } from './loader';
import { applyWorldEnvironment } from './render';
import type { InstantiateResult } from './loader';
import type { PrefabLibrary } from './prefab-library';
import type { WorldDocument } from './types';

export interface WorldInstantiateOptions {
  getModel(path: string): Model | null;
  prefabs?: PrefabLibrary | null;
}

export interface WorldEntityNode {
  id: string;
  node: SceneNode;
}

/** Runtime scene nodes and environment created from one WorldData document. */
export class WorldInstance implements ContextResource {
  readonly context: GameContext;
  readonly error: string | null;
  readonly warnings: string[];
  private nodes: SceneNode[] = [];
  private nodeHandles: number[] = [];
  private entities: WorldEntityNode[] = [];
  private terrainNode: SceneNode | null = null;
  private waterNodes: SceneNode[] = [];
  private riverNodes: SceneNode[] = [];
  private worldDocument: WorldDocument | null;
  private disposed = false;

  constructor(owner: Game, data: WorldData, options: WorldInstantiateOptions) {
    this.context = owner.context;
    this.worldDocument = data.document;
    this.warnings = [];
    if (!this.context.isReady || this.context.isDisposed || this.worldDocument === null) {
      this.error = this.worldDocument === null ? 'WorldData must be loaded before instantiation.' :
        'The Game must be ready before instantiating world data.';
      return;
    }

    const document = this.worldDocument;
    const result: InstantiateResult = instantiateWorld(document, {
      getModelHandle: (path: string): number => {
        const model = options.getModel(path);
        if (model === null || (model as any).context !== this.context || !model.isLoaded) return 0;
        return (model as any).handleValue || 0;
      },
      prefabRegistry: options.prefabs === undefined || options.prefabs === null
        ? null
        : options.prefabs._registry(),
    });
    this.warnings.push.apply(this.warnings, result.warnings);

    for (let index = 0; index < result.ownedNodeHandles.length; index++) {
      const handle = result.ownedNodeHandles[index];
      const wrapper = adoptSceneNode(owner, handle);
      this.nodeHandles.push(handle);
      this.nodes.push(wrapper);
    }
    for (let index = 0; index < result.nodeParents.length; index++) {
      const link = result.nodeParents[index];
      const child = this._nodeForHandle(link.child);
      const parent = this._nodeForHandle(link.parent);
      if (child !== null && parent !== null) adoptSceneNodeParent(child, parent);
    }
    for (let index = 0; index < document.entities.length; index++) {
      const id = document.entities[index].id;
      const handle = result.entityHandles.get(id) || 0;
      const node = this._nodeForHandle(handle);
      if (node !== null) this.entities.push({ id, node });
    }
    this.terrainNode = this._nodeForHandle(result.terrainHandle);
    for (let index = 0; index < result.waterHandles.length; index++) {
      const node = this._nodeForHandle(result.waterHandles[index]);
      if (node !== null) this.waterNodes.push(node);
    }
    for (let index = 0; index < result.riverHandles.length; index++) {
      const node = this._nodeForHandle(result.riverHandles[index]);
      if (node !== null) this.riverNodes.push(node);
    }
    this.context.register(this);
    this.error = null;
  }

  get isLoaded(): boolean { return !this.disposed && this.worldDocument !== null && this.context.isReady; }
  get entityNodes(): WorldEntityNode[] { return this.entities.slice(); }
  get terrain(): SceneNode | null { return this.terrainNode; }
  get water(): SceneNode[] { return this.waterNodes.slice(); }
  get rivers(): SceneNode[] { return this.riverNodes.slice(); }

  getEntityNode(id: string): SceneNode | null {
    for (let index = 0; index < this.entities.length; index++) {
      if (this.entities[index].id === id) return this.entities[index].node;
    }
    return null;
  }

  applyLighting(): boolean {
    if (!this.isLoaded || this.worldDocument === null) return false;
    applyWorldEnvironment(this.worldDocument);
    return true;
  }

  _belongsToContext(context: GameContext): boolean { return this.context === context; }

  dispose(): void {
    if (this.disposed) return;
    for (let index = this.nodes.length - 1; index >= 0; index--) this.nodes[index].dispose();
    this.nodes = [];
    this.nodeHandles = [];
    this.entities = [];
    this.waterNodes = [];
    this.riverNodes = [];
    this.terrainNode = null;
    this.worldDocument = null;
    this.disposed = true;
    this.context.unregister(this);
  }

  private _nodeForHandle(handle: number): SceneNode | null {
    if (handle === 0) return null;
    for (let index = 0; index < this.nodeHandles.length; index++) {
      if (this.nodeHandles[index] === handle) return this.nodes[index];
    }
    return null;
  }
}
