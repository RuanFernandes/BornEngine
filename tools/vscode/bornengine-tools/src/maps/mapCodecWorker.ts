import { parentPort } from 'node:worker_threads';
import { serializeWorld2D } from '@bornengine/engine/world2d/editor';
import type { MapCodecRequest, MapCodecResult } from './mapCodecCoordinator';

parentPort?.on('message', (request: MapCodecRequest) => {
  let result: MapCodecResult;
  try {
    const input = JSON.parse(request.sourceText) as unknown;
    const serialized = serializeWorld2D(input, { mode: 'compact', effort: 'max' });
    result = {
      ...request,
      type: 'encoded',
      ok: serialized.ok,
      json: serialized.json,
      diagnostics: serialized.ok ? undefined : serialized.diagnostics.map((item) =>
        `${item.path || '/'} [${item.code}]: ${item.message}`).join('\n'),
    };
  } catch (error) {
    result = {
      ...request,
      type: 'encoded',
      ok: false,
      json: '',
      diagnostics: error instanceof Error ? error.message : 'World2D map could not be compacted.',
    };
  }
  parentPort?.postMessage(result);
});
