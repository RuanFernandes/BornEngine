import { SpriteRenderer, SpriteSheet } from '@bornengine/engine/sprites';
import { SpriteRenderer as RootSpriteRenderer, SpriteSheet as RootSpriteSheet } from '../../src';
import type { SpriteFrame, SpriteRendererOptions, SpriteSheetOptions } from '@bornengine/engine/sprites';

const spriteSheetClass: typeof RootSpriteSheet = SpriteSheet;
const spriteRendererClass: typeof RootSpriteRenderer = SpriteRenderer;
const frameType: SpriteFrame | null = null;
const sheetOptions: SpriteSheetOptions = { frameWidth: 16, frameHeight: 16 };
const rendererOptions: SpriteRendererOptions = { flipX: true, renderOrder: 5 };

void spriteSheetClass;
void spriteRendererClass;
void frameType;
void sheetOptions;
void rendererOptions;
