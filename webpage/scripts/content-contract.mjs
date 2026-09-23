export const REQUIRED_COMMAND_IDS = [
  'create', 'new', 'init', 'build', 'run', 'dev', 'check',
  'clean', 'doctor', 'info', 'version',
  'engine/current', 'engine/install', 'engine/list', 'engine/update',
  'engine/remove', 'engine/use', 'upgrade', 'update',
  'config/set', 'config/get', 'config/list',
];

export function commandInventoryErrors(commands) {
  const present = new Set(commands.map(({ id }) => id));
  return REQUIRED_COMMAND_IDS
    .filter((id) => !present.has(id))
    .map((id) => `Missing CLI command: ${id}`);
}

export function prerequisiteErrors(entries) {
  const errors = [];
  for (const entry of entries) {
    if (!/^https:\/\//.test(entry.docsUrl ?? '')) {
      errors.push(`${entry.id} must link to an HTTPS installation document`);
    }
    if (!entry.verify?.trim()) {
      errors.push(`${entry.id} must include a verification command`);
    }
  }
  return errors;
}
