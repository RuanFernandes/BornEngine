import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import { resolveEngineRoot } from '../../scripts/engine-root.mjs';

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (configPath === undefined) {
  console.error('Could not locate workbench tsconfig.json.');
  process.exitCode = 1;
} else {
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error !== undefined) {
    console.error(ts.formatDiagnosticsWithColorAndContext([loaded.error], {
      getCurrentDirectory: process.cwd,
      getCanonicalFileName: (fileName) => fileName,
      getNewLine: () => '\n',
    }));
    process.exitCode = 1;
  } else {
    const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath));
    const projectRoot = path.resolve(process.cwd());
    const repositoryRoot = path.resolve(projectRoot, '..');
    const localEngineRoot = resolveEngineRoot(repositoryRoot, process.env.BORNENGINE_ENGINE_PATH);
    const compilerOptions = {
      ...parsed.options,
      noEmit: true,
      paths: {
        '@bornengine/engine': [path.join(localEngineRoot, 'src/index.ts')],
        '@bornengine/engine/*': [path.join(localEngineRoot, 'src/*')],
      },
    };
    const program = ts.createProgram(parsed.fileNames, compilerOptions);
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)].filter((diagnostic) => {
      if (diagnostic.file === undefined) return true;
      const fileName = path.resolve(diagnostic.file.fileName);
      return fileName === projectRoot || fileName.startsWith(`${projectRoot}${path.sep}`);
    });
    if (diagnostics.length > 0) {
      console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: process.cwd,
        getCanonicalFileName: (fileName) => fileName,
        getNewLine: () => '\n',
      }));
      process.exitCode = 1;
    } else {
      console.log('Workbench TypeScript sources type-check.');
    }
  }
}
