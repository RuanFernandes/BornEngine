import { UiSurface } from '../ui/surface';
import { UiBackend } from '../ui/opcodes';
import type { Game } from '../core/game';
import type { UiApi, UiColor, UiId, UiResponse } from '../ui/types';

/** Immediate-mode debug UI drawn with the Dear ImGui backend. Needs the native `debug-ui` feature; check `isAvailable()`. Widget methods come from `UiApi`. */
export class DebugUi extends UiSurface {
  /** Creates the debug UI for `owner`. */
  constructor(owner: Game) {
    super(owner, UiBackend.DearImGui);
  }
}

/** Widget and painting methods of `DebugUi`. */
export interface DebugUi extends UiApi {}
export type { UiId, UiResponse, UiColor };
