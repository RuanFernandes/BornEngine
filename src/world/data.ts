import type { ContextReference } from '../core/context';
import * as loader from './loader';
import * as saver from './saver';
import * as validator from './validate';
import * as versions from './version';
import * as terrain from './terrain';
import type { WorldDocument, PrefabData, TerrainData, TerrainLayer } from './types';
import type { SaveResult } from './saver';
import type { ValidationResult } from './validate';
import { serializeWorld as importSerializeWorld } from './serialize';
import type { WorldInstantiateOptions } from './world-instance';
import { WorldInstance } from './world-instance';

/** Serialized world document plus instance operations for loading and saving it. */
export class WorldData {
  private documentValue: WorldDocument | null;
  private sourcePath: string | null;
  private errorValue: string | null = null;

  constructor(source: string | WorldDocument) {
    this.sourcePath = typeof source === 'string' ? source : null;
    this.documentValue = typeof source === 'string' ? null : source;
  }

  get document(): WorldDocument | null { return this.documentValue; }
  get path(): string | null { return this.sourcePath; }
  get error(): string | null { return this.errorValue; }
  get isLoaded(): boolean { return this.documentValue !== null; }
  get name(): string { return this.documentValue === null ? '' : this.documentValue.name; }
  get id(): string { return this.documentValue === null ? '' : this.documentValue.id; }

  load(): boolean {
    if (this.sourcePath === null) {
      this.errorValue = 'WorldData has no source path.';
      return false;
    }
    try {
      this.documentValue = loader.loadWorld(this.sourcePath);
      this.errorValue = null;
      return true;
    } catch (error) {
      this.documentValue = null;
      this.errorValue = String(error);
      return false;
    }
  }

  validate(): ValidationResult {
    if (this.documentValue === null) return { ok: false, errors: ['WorldData is not loaded.'] };
    return validator.validateWorld(this.documentValue);
  }

  save(path?: string): SaveResult {
    if (this.documentValue === null) return { ok: false, errors: ['WorldData is not loaded.'] };
    const target = path === undefined ? this.sourcePath : path;
    if (target === null || target.length === 0) return { ok: false, errors: ['A save path is required.'] };
    const result = saver.saveWorld(target, this.documentValue);
    if (result.ok) {
      this.sourcePath = target;
      this.errorValue = null;
    } else {
      this.errorValue = validator.formatValidationErrors(result.errors);
    }
    return result;
  }

  instantiate(owner: ContextReference, options: WorldInstantiateOptions): WorldInstance {
    return new WorldInstance(owner, this, options);
  }

  /** Pure constructors and transforms remain static because they own no runtime state. */
  static create(id: string, name: string): WorldData { return new WorldData(loader.createEmptyWorld(id, name)); }
  static createEntity(id: string, modelRef: string, position: [number, number, number]): import('./types').EntityData {
    return loader.createEntity(id, modelRef, position);
  }
  static migrate(document: WorldDocument): WorldDocument { return versions.migrateWorldData(document); }
  static validateDocument(document: WorldDocument): ValidationResult { return validator.validateWorld(document); }
  static serialize(document: WorldDocument): string { return importSerializeWorld(document); }
  static createDefaultTerrain(): TerrainData { return terrain.defaultTerrain(); }
  static sampleTerrain(data: TerrainData, x: number, z: number): number { return terrain.sampleHeight(data, x, z); }
  static createTerrainLayer(data: TerrainData, id: string, textureRef: string, tileScale: number): TerrainLayer {
    return terrain.createTerrainLayer(data, id, textureRef, tileScale);
  }
  static quantizeWeight(weight: number): number { return terrain.quantizeWeight(weight); }

  static validatePrefab(prefab: PrefabData): ValidationResult { return validator.validatePrefab(prefab); }
  static migratePrefab(prefab: PrefabData): PrefabData { return versions.migratePrefabData(prefab); }

}
