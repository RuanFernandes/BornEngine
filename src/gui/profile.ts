import type { Color, Sound } from '../core/types';
import type { Texture } from '../textures';
import type { GuiCursor } from './types';

/** Alignment of content along one axis. */
export type GuiTextAlignment = 'start' | 'center' | 'end';

/** Font settings for a GUI profile; a `null` family uses the default font. */
export interface GuiFontProfile {
  family: string | null;
  size: number;
  bold: boolean;
  italic: boolean;
}

/** Horizontal and vertical content alignment for a GUI profile. */
export interface GuiAlignmentProfile {
  horizontal: GuiTextAlignment;
  vertical: GuiTextAlignment;
}

/** Spacing values for a GUI profile: item spacing, padding, and inner spacing. */
export interface GuiSpacingProfile {
  item: number;
  padding: number;
  inner: number;
}

/** Border color, width, and corner radius for a GUI profile. */
export interface GuiBorderProfile {
  color: Color;
  width: number;
  radius: number;
}

/** Drop shadow color, offset, and blur for a GUI profile. */
export interface GuiShadowProfile {
  color: Color;
  offsetX: number;
  offsetY: number;
  blur: number;
}

/** Sounds played when a button is pressed or hovered; `null` plays nothing. */
export interface GuiButtonSounds {
  press: Sound | null;
  hover: Sound | null;
}

/** Partial profile settings accepted by the `GuiProfile` constructor; omitted values use defaults. */
export interface GuiProfileOptions {
  normalColor?: Color;
  hoverColor?: Color;
  disabledColor?: Color;
  textColor?: Color;
  selectionColor?: Color;
  font?: Partial<GuiFontProfile>;
  alignment?: Partial<GuiAlignmentProfile>;
  spacing?: Partial<GuiSpacingProfile>;
  border?: { color?: Color; width?: number; radius?: number };
  opacity?: number;
  background?: Texture | null;
  shadow?: { color?: Color; offsetX?: number; offsetY?: number; blur?: number };
  focusable?: boolean;
  modal?: boolean;
  cursor?: GuiCursor;
  buttonSounds?: GuiButtonSounds | null;
}

const DEFAULT_NORMAL = { r: 0.16, g: 0.17, b: 0.19, a: 1 };
const DEFAULT_HOVER = { r: 0.24, g: 0.27, b: 0.31, a: 1 };
const DEFAULT_DISABLED = { r: 0.12, g: 0.13, b: 0.15, a: 0.65 };
const DEFAULT_TEXT = { r: 0.92, g: 0.93, b: 0.95, a: 1 };
const DEFAULT_SELECTION = { r: 0.24, g: 0.48, b: 0.82, a: 1 };
const DEFAULT_BORDER = { r: 0.36, g: 0.38, b: 0.42, a: 1 };
const DEFAULT_SHADOW = { r: 0, g: 0, b: 0, a: 0.3 };

function copyColor(color: Color): Color {
  return { r: color.r, g: color.g, b: color.b, a: color.a };
}

function copySoundSet(sounds: GuiButtonSounds | null | undefined): GuiButtonSounds | null {
  if (sounds == null) return null;
  return { press: sounds.press, hover: sounds.hover };
}

/** Visual style (colors, font, spacing, border, shadow, sounds) shared by GUI controls. */
export class GuiProfile {
  /** Fill color in the normal state. */
  normalColor: Color;
  /** Fill color while hovered. */
  hoverColor: Color;
  /** Fill color when disabled. */
  disabledColor: Color;
  /** Text color. */
  textColor: Color;
  /** Color of selections and highlights. */
  selectionColor: Color;
  /** Font settings. */
  font: GuiFontProfile;
  /** Content alignment. */
  alignment: GuiAlignmentProfile;
  /** Spacing values. */
  spacing: GuiSpacingProfile;
  /** Border settings. */
  border: GuiBorderProfile;
  /** Overall opacity. */
  opacity: number;
  /** Optional background texture, or `null` for none. */
  background: Texture | null;
  /** Drop shadow settings. */
  shadow: GuiShadowProfile;
  /** Whether controls using this profile can take keyboard focus. */
  focusable: boolean;
  /** Whether controls using this profile are modal. */
  modal: boolean;
  /** Cursor shown over controls using this profile. */
  cursor: GuiCursor;
  /** Press and hover sounds, or `null` for none. */
  buttonSounds: GuiButtonSounds | null;

  /** Creates a profile, filling unspecified options with defaults. */
  constructor(options: GuiProfileOptions = {}) {
    this.normalColor = copyColor(options.normalColor ?? DEFAULT_NORMAL);
    this.hoverColor = copyColor(options.hoverColor ?? DEFAULT_HOVER);
    this.disabledColor = copyColor(options.disabledColor ?? DEFAULT_DISABLED);
    this.textColor = copyColor(options.textColor ?? DEFAULT_TEXT);
    this.selectionColor = copyColor(options.selectionColor ?? DEFAULT_SELECTION);
    this.font = {
      family: options.font?.family ?? null,
      size: options.font?.size ?? 14,
      bold: options.font?.bold ?? false,
      italic: options.font?.italic ?? false,
    };
    this.alignment = {
      horizontal: options.alignment?.horizontal ?? 'start',
      vertical: options.alignment?.vertical ?? 'center',
    };
    this.spacing = {
      item: options.spacing?.item ?? 4,
      padding: options.spacing?.padding ?? 6,
      inner: options.spacing?.inner ?? 2,
    };
    this.border = {
      color: copyColor(options.border?.color ?? DEFAULT_BORDER),
      width: options.border?.width ?? 1,
      radius: options.border?.radius ?? 3,
    };
    this.opacity = options.opacity ?? 1;
    this.background = options.background ?? null;
    this.shadow = {
      color: copyColor(options.shadow?.color ?? DEFAULT_SHADOW),
      offsetX: options.shadow?.offsetX ?? 0,
      offsetY: options.shadow?.offsetY ?? 1,
      blur: options.shadow?.blur ?? 3,
    };
    this.focusable = options.focusable ?? true;
    this.modal = options.modal ?? false;
    this.cursor = options.cursor ?? 'arrow';
    this.buttonSounds = copySoundSet(options.buttonSounds);
  }

  /** Returns an independent copy of this profile. */
  clone(): GuiProfile {
    return new GuiProfile({
      normalColor: this.normalColor,
      hoverColor: this.hoverColor,
      disabledColor: this.disabledColor,
      textColor: this.textColor,
      selectionColor: this.selectionColor,
      font: this.font,
      alignment: this.alignment,
      spacing: this.spacing,
      border: this.border,
      opacity: this.opacity,
      background: this.background,
      shadow: this.shadow,
      focusable: this.focusable,
      modal: this.modal,
      cursor: this.cursor,
      buttonSounds: this.buttonSounds,
    });
  }
}

/** Registry of named profiles. Built-in names include `default`, `text`, `button`, `window`, `scroll`, `checkbox`, `radio`, `popup`, `slider`, `progress`, `tree`, `list`, `blue`, `blue-button`, and `blue-window`. */
export class GUIProfiles {
  private static profiles = new Map<string, GuiProfile>();

  /**
   * Returns the profile registered under `name`.
   * @throws Error if no profile has that name.
   */
  static get(name: string): GuiProfile {
    const profile = this.profiles.get(name);
    if (profile === undefined) throw new Error(`Unknown GUI profile: ${name}`);
    return profile;
  }

  /**
   * Registers a profile under a new name.
   * @throws Error if the name is empty or already registered.
   * @throws TypeError if `profile` is not a `GuiProfile`.
   */
  static register(name: string, profile: GuiProfile): void {
    if (name.trim().length === 0) throw new Error('GUI profile names cannot be empty.');
    if (!(typeof profile === 'object' && profile !== null && profile instanceof GuiProfile))
      throw new TypeError('GUIProfiles.register expects a GuiProfile.');
    if (this.profiles.has(name)) throw new Error(`GUI profile already registered: ${name}`);
    this.profiles.set(name, profile);
  }

  /**
   * Returns a copy of the profile registered under `name`, safe to modify.
   * @throws Error if no profile has that name.
   */
  static clone(name: string): GuiProfile {
    return this.get(name).clone();
  }
}

const BLUE = { r: 0.1, g: 0.32, b: 0.65, a: 1 };

GUIProfiles.register('default', new GuiProfile());
GUIProfiles.register(
  'text',
  new GuiProfile({ normalColor: { r: 0, g: 0, b: 0, a: 0 }, border: { width: 0, radius: 0 } }),
);
GUIProfiles.register(
  'button',
  new GuiProfile({ border: { width: 1, radius: 4 }, spacing: { padding: 8, item: 5, inner: 3 } }),
);
GUIProfiles.register('window', new GuiProfile({ border: { width: 1, radius: 5 }, shadow: { blur: 8, offsetY: 3 } }));
GUIProfiles.register('scroll', new GuiProfile({ spacing: { padding: 4, item: 4, inner: 2 } }));
GUIProfiles.register('checkbox', new GuiProfile({ border: { width: 1, radius: 2 } }));
GUIProfiles.register('radio', new GuiProfile({ border: { width: 1, radius: 8 } }));
GUIProfiles.register('popup', new GuiProfile({ modal: true, shadow: { blur: 8, offsetY: 3 } }));
GUIProfiles.register('slider', new GuiProfile({ cursor: 'pointer' }));
GUIProfiles.register(
  'progress',
  new GuiProfile({ normalColor: { r: 0.12, g: 0.13, b: 0.15, a: 1 }, selectionColor: BLUE }),
);
GUIProfiles.register('tree', new GuiProfile({ spacing: { item: 2, padding: 4, inner: 2 } }));
GUIProfiles.register('list', new GuiProfile({ spacing: { item: 2, padding: 4, inner: 2 } }));
GUIProfiles.register(
  'blue',
  new GuiProfile({ normalColor: BLUE, hoverColor: { r: 0.16, g: 0.42, b: 0.78, a: 1 }, selectionColor: BLUE }),
);
GUIProfiles.register(
  'blue-button',
  new GuiProfile({
    normalColor: BLUE,
    hoverColor: { r: 0.19, g: 0.47, b: 0.86, a: 1 },
    border: { color: { r: 0.35, g: 0.59, b: 0.88, a: 1 }, width: 1, radius: 4 },
  }),
);
GUIProfiles.register(
  'blue-window',
  new GuiProfile({
    normalColor: { r: 0.08, g: 0.18, b: 0.34, a: 1 },
    border: { color: { r: 0.28, g: 0.48, b: 0.72, a: 1 }, width: 1, radius: 5 },
    shadow: { blur: 8, offsetY: 3 },
  }),
);
