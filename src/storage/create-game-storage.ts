import { GameStorage } from './game-storage';
import type { GameStorageBackend } from './game-storage';

declare function bloom_get_platform(): number;
declare function bloom_storage_remove(path: number): number;
declare function bloom_storage_write(path: number, data: number): number;
declare function bloom_storage_exists(path: number): number;
declare function bloom_storage_read(path: number): number;

const WEB_PLATFORM = 7;

class PlatformStorageBackend implements GameStorageBackend {
  private readonly supported = bloom_get_platform() === WEB_PLATFORM;

  isSupported(): boolean { return this.supported; }
  read(path: string): string | null {
    if (!this.supported || bloom_storage_exists(path as any) === 0.0) return null;
    return bloom_storage_read(path as any) as any;
  }
  writeAtomic(path: string, contents: string): boolean {
    return this.supported && bloom_storage_write(path as any, contents as any) !== 0.0;
  }
  remove(path: string): boolean {
    return this.supported && bloom_storage_remove(path as any) !== 0.0;
  }
}

/** Create storage using the verified app-data backend for the current target. */
export function createGameStorage(appId: string, slot = 'default'): GameStorage {
  return new GameStorage(appId, slot, new PlatformStorageBackend());
}
