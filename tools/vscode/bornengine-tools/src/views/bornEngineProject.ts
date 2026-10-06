const BORNENGINE_PACKAGE_NAME = '@bornengine/engine';
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns whether a parsed package.json identifies an engine or consumer project. */
export function isBornEngineProjectManifest(input: unknown): boolean {
  if (!isRecord(input)) return false;
  if (input.name === BORNENGINE_PACKAGE_NAME) return true;

  return DEPENDENCY_SECTIONS.some((section) => {
    const dependencies = input[section];
    if (!isRecord(dependencies)) return false;
    return typeof dependencies[BORNENGINE_PACKAGE_NAME] === 'string'
      && dependencies[BORNENGINE_PACKAGE_NAME] !== '';
  });
}
