import { createUiApi } from './api';

export const ui = createUiApi(0);
export type { UiApi, UiId, UiResponse, UiColor } from './types';
export { UiBackend, UiOpcode } from './opcodes';
