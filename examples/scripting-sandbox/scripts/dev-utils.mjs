import path from 'node:path';

export function createWorkbenchLaunchOptions(projectRoot) {
  const workbenchRoot = path.join(projectRoot, 'workbench');
  return {
    entry: path.join(workbenchRoot, 'node_modules/vite/bin/vite.js'),
    cwd: workbenchRoot,
  };
}
