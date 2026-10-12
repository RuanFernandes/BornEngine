import { createEmptyPrefab, createPrefabRegistry, loadPrefab, registerPrefab } from './prefab';
import type { PrefabRegistry } from './prefab';
import type { PrefabData } from './types';
import { savePrefab } from './saver';
import type { SaveResult } from './saver';
import { validatePrefab } from './validate';

/** Project-owned collection of validated prefab documents. */
export class PrefabLibrary {
  private readonly registry: PrefabRegistry = createPrefabRegistry();

  /** Number of prefabs currently registered. */
  get size(): number {
    return this.registry.byId.size;
  }
  /** Returns the prefab with the given id, or `null` if it is not registered. */
  get(id: string): PrefabData | null {
    return this.registry.getPrefab(id);
  }
  /**
   * Adds a prefab, replacing any with the same id.
   * @returns False without registering if the prefab fails validation.
   */
  register(prefab: PrefabData): boolean {
    if (!validatePrefab(prefab).ok) return false;
    registerPrefab(this.registry, prefab);
    return true;
  }
  /**
   * Reads a prefab file from disk and registers it.
   * @throws Error if the file is missing, is not valid JSON, or fails validation.
   */
  load(path: string): PrefabData {
    const prefab = loadPrefab(path);
    this.register(prefab);
    return prefab;
  }
  /** Creates an empty prefab and registers it. */
  create(id: string, name: string): PrefabData {
    const prefab = createEmptyPrefab(id, name);
    this.register(prefab);
    return prefab;
  }
  /**
   * Writes a prefab to disk after validating it.
   * @returns Result with the error messages on failure.
   */
  save(path: string, prefab: PrefabData): SaveResult {
    return savePrefab(path, prefab);
  }

  /** @internal Supplies the private loader with the class-owned data table. */
  _registry(): PrefabRegistry {
    return this.registry;
  }
}
