import { createUiApi } from '../ui/api';

export const debugUi = createUiApi(1);
export type { DebugUiApi, UiId, UiResponse, UiColor } from './types';
