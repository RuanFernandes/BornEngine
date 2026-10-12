import type { Texture } from '../../textures';
import { GuiControlKind } from '../commands';
import { GUI } from '../gui';
import { GUIProfiles } from '../profile';
import { GuiNumberValueControl } from './value';
import type { GUIControlOptions } from '../types';

/** Base class for GUI buttons that display a text label. */
export abstract class GuiButtonBase extends GUI {
  private text = '';

  protected constructor(options: GUIControlOptions = {}) {
    super(options);
    this.setProfile(GUIProfiles.get('button'));
  }

  /** Returns the button label. */
  getText(): string {
    return this.text;
  }
  /** Sets the button label. */
  setText(text: string): this {
    this.text = text;
    this._guiCommandText = text;
    return this;
  }
}

/** Clickable button with a text label. */
export class GuiButton extends GuiButtonBase {
  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Button;
  }
}

/** Two-state check box; its value is true when checked. */
export class GuiCheckBox extends GuiNumberValueControl<boolean> {
  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options, false, GuiControlKind.CheckBox, 'checkbox');
  }

  /** Checks or unchecks the box. */
  setValue(value: boolean): this {
    return super.setValue(value);
  }
}

/** Check box that belongs to a group; selecting it clears the other selected radio buttons of the same group under the same parent. */
export class GuiRadioButton extends GuiCheckBox {
  private group: string | null = null;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.RadioButton;
  }

  /**
   * Assigns the radio group, or removes it with null. Clears selected siblings of the new group if this button is already selected.
   *
   * @throws TypeError if the group ID is an empty string.
   */
  setGroup(groupId: string | null): this {
    if (groupId !== null && groupId.length === 0) throw new TypeError('Radio button group IDs cannot be empty.');
    this.group = groupId;
    if (this.getValue()) this.clearSelectedSiblings();
    return this;
  }

  /** Returns the radio group ID, or null if the button has no group. */
  getGroup(): string | null {
    return this.group;
  }

  /** Selects or deselects the button. Selecting clears the other selected radio buttons in the same group. */
  override setValue(value: boolean): this {
    if (value) this.clearSelectedSiblings();
    super.setValue(value);
    this._guiCommandKind = GuiControlKind.RadioButton;
    return this;
  }

  private clearSelectedSiblings(): void {
    if (this.group === null) return;
    const parent = this.getParent();
    if (parent === null) return;
    for (const sibling of parent.getControls()) {
      if (
        sibling !== this &&
        sibling instanceof GuiRadioButton &&
        sibling.getGroup() === this.group &&
        sibling.getValue()
      ) {
        sibling.setValue(false);
      }
    }
  }
}

/** Textures a bitmap button shows in each state; null means no texture for that state. */
export interface GuiBitmapButtonTextures {
  normal: Texture | null;
  hover: Texture | null;
  pressed: Texture | null;
  disabled: Texture | null;
}

/** Button drawn from per-state textures instead of the themed button style. */
export class GuiBitmapButton extends GuiButtonBase {
  private textures: GuiBitmapButtonTextures = { normal: null, hover: null, pressed: null, disabled: null };

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.BitmapButton;
  }

  /** Replaces the state textures. States omitted from the argument are reset to null. */
  setTextures(textures: Partial<GuiBitmapButtonTextures>): this {
    this.textures = {
      normal: textures.normal ?? null,
      hover: textures.hover ?? null,
      pressed: textures.pressed ?? null,
      disabled: textures.disabled ?? null,
    };
    return this;
  }

  /** Returns a copy of the current state textures. */
  getTextures(): GuiBitmapButtonTextures {
    return { ...this.textures };
  }
  /** @internal Texture ownership is checked by the Game-owned GUIManager. */
  _getButtonTextures(): GuiBitmapButtonTextures {
    return this.getTextures();
  }
}

/** Slider with a numeric value clamped to its range (0 to 1 by default). */
export class GuiSlider extends GuiNumberValueControl<number> {
  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options, 0, GuiControlKind.Slider, 'slider');
  }
}
