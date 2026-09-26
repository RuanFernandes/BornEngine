import { UiSurface } from '../ui/surface';
import { UiBackend } from '../ui/opcodes';
import type { ContextReference } from '../core/context';
import type { UiApi, UiColor, UiId, UiResponse } from '../ui/types';

export class DebugUi extends UiSurface {
  constructor(owner: ContextReference) { super(owner, UiBackend.DearImGui); }
}

export interface DebugUi extends UiApi {}
export type { UiId, UiResponse, UiColor };
