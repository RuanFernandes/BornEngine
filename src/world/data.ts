import type { Game } from '../core/game';
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

  /**
   * Wraps either a path to a `*.world.json` file (call `load()` to read it) or an already-built `WorldDocument`.
   * @param source File path to load later, or an in-memory world document.
   */
  constructor(source: string | WorldDocument) {
    this.sourcePath = typeof source === 'string' ? source : null;
    this.documentValue = typeof source === 'string' ? null : source;
  }

  /** The world document, or `null` until it is loaded. */
  get document(): WorldDocument | null {
    return this.documentValue;
  }
  /** Source file path, or `null` when built from an in-memory document. Updated after a successful `save()` to a new path. */
  get path(): string | null {
    return this.sourcePath;
  }
  /** Message from the last failed `load()` or `save()`, or `null` when the last operation succeeded. */
  get error(): string | null {
    return this.errorValue;
  }
  /** True when a world document is available. */
  get isLoaded(): boolean {
    return this.documentValue !== null;
  }
  /** Display name of the world, or an empty string when not loaded. */
  get name(): string {
    return this.documentValue === null ? '' : this.documentValue.name;
  }
  /** Stable id of the world, or an empty string when not loaded. */
  get id(): string {
    return this.documentValue === null ? '' : this.documentValue.id;
  }

  /**
   * Reads, migrates, and validates the world file at the source path.
   * @returns True on success; false if there is no source path or loading fails, with the reason in `error`.
   */
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

  /**
   * Checks the loaded document against the world schema.
   * @returns A failed result when the world is not loaded.
   */
  validate(): ValidationResult {
    if (this.documentValue === null) return { ok: false, errors: ['WorldData is not loaded.'] };
    return validator.validateWorld(this.documentValue);
  }

  /**
   * Writes the world to disk after validating it, keeping a `.bak` copy of the previous file.
   * @param path Target file; defaults to the current source path.
   * @returns Result with the error messages when validation or writing fails.
   */
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

  /**
   * Creates scene nodes, terrain, water, and rivers for this world in the given game.
   * @param options Callbacks used to resolve model and prefab references.
   * @returns A `WorldInstance`; check its `error` and `warnings`.
   */
  instantiate(game: Game, options: WorldInstantiateOptions): WorldInstance {
    return new WorldInstance(game, this, options);
  }

  /** Pure constructors and transforms remain static because they own no runtime state. */
  static create(id: string, name: string): WorldData {
    return new WorldData(loader.createEmptyWorld(id, name));
  }
  /**
   * Creates an entity placed at `position` that references a model, with identity rotation and unit scale.
   * @param id Entity id, unique within the world.
   * @param modelRef Relative model path.
   */
  static createEntity(id: string, modelRef: string, position: [number, number, number]): import('./types').EntityData {
    return loader.createEntity(id, modelRef, position);
  }
  /** Upgrades a parsed world document to the current schema version, mutating and returning it. */
  static migrate(document: WorldDocument): WorldDocument {
    return versions.migrateWorldData(document);
  }
  /** Checks a world document against the world schema. */
  static validateDocument(document: WorldDocument): ValidationResult {
    return validator.validateWorld(document);
  }
  /** Converts a world document to the JSON text used for `*.world.json` files. */
  static serialize(document: WorldDocument): string {
    return importSerializeWorld(document);
  }
  /** Creates a flat 128x128 terrain with 1-unit cells centered on the origin. */
  static createDefaultTerrain(): TerrainData {
    return terrain.defaultTerrain();
  }
  /** Returns the interpolated world-space terrain height at `(x, z)`, clamped to the grid edges. */
  static sampleTerrain(data: TerrainData, x: number, z: number): number {
    return terrain.sampleHeight(data, x, z);
  }
  /**
   * Creates a splat layer sized to the terrain grid with all weights at zero.
   * @param tileScale UV tiling factor of the layer texture.
   */
  static createTerrainLayer(data: TerrainData, id: string, textureRef: string, tileScale: number): TerrainLayer {
    return terrain.createTerrainLayer(data, id, textureRef, tileScale);
  }
  /** Clamps a splat weight to 0..1 and rounds it to three decimals. */
  static quantizeWeight(weight: number): number {
    return terrain.quantizeWeight(weight);
  }

  /** Checks a prefab document against the prefab schema. */
  static validatePrefab(prefab: PrefabData): ValidationResult {
    return validator.validatePrefab(prefab);
  }
  /** Upgrades a parsed prefab document to the current schema version, mutating and returning it. */
  static migratePrefab(prefab: PrefabData): PrefabData {
    return versions.migratePrefabData(prefab);
  }
}
