import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[^/]+$/.test(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context);
      } catch (error) {
        if (error === null || typeof error !== 'object' || error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      }
    }
    return nextResolve(specifier, context);
  },
});
