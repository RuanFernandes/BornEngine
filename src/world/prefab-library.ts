import { createEmptyPrefab, createPrefabRegistry, loadPrefab, registerPrefab } from './prefab';
import type { PrefabRegistry } from './prefab';
import type { PrefabData } from './types';
import { savePrefab } from './saver';
import type { SaveResult } from './saver';
import { validatePrefab } from './validate';

/** Project-owned collection of validated prefab documents. */
export class PrefabLibrary {
  private readonly registry: PrefabRegistry = createPrefabRegistry();

  get size(): number { return this.registry.byId.size; }
  get(id: string): PrefabData | null { return this.registry.getPrefab(id); }
  register(prefab: PrefabData): boolean {
    if (!validatePrefab(prefab).ok) return false;
    registerPrefab(this.registry, prefab);
    return true;
  }
  load(path: string): PrefabData {
    const prefab = loadPrefab(path);
    this.register(prefab);
    return prefab;
  }
  create(id: string, name: string): PrefabData {
    const prefab = createEmptyPrefab(id, name);
    this.register(prefab);
    return prefab;
  }
  save(path: string, prefab: PrefabData): SaveResult { return savePrefab(path, prefab); }

  /** @internal Supplies the private loader with the class-owned data table. */
  _registry(): PrefabRegistry { return this.registry; }
}
