import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function resolveEngineRoot(projectRoot, configuredPath) {
  const candidate = typeof configuredPath === 'string' && configuredPath.trim().length > 0
    ? path.resolve(projectRoot, configuredPath)
    : path.resolve(projectRoot, '../..');
  const engineRoot = realpathSync(candidate);
  if (!existsSync(path.join(engineRoot, 'native/web/build.sh'))) {
    throw new Error(`BornEngine source at ${engineRoot} does not contain native/web/build.sh.`);
  }
  return engineRoot;
}
