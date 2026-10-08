import type { Texture } from '../../textures';
import { GuiControlKind } from '../commands';
import { GUI } from '../gui';
import { GUIProfiles } from '../profile';
import { GuiNumberValueControl } from './value';
import type { GUIControlOptions } from '../types';

export abstract class GuiButtonBase extends GUI {
  private text = '';

  protected constructor(options: GUIControlOptions = {}) {
    super(options);
    this.setProfile(GUIProfiles.get('button'));
  }

  getText(): string { return this.text; }
  setText(text: string): this {
    this.text = text;
    this._guiCommandText = text;
    return this;
  }
}

export class GuiButton extends GuiButtonBase {
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Button;
  }
}

export class GuiCheckBox extends GuiNumberValueControl<boolean> {
  constructor(options: GUIControlOptions = {}) {
    super(options, false, GuiControlKind.CheckBox, 'checkbox');
  }

  setValue(value: boolean): this { return super.setValue(value); }
}

export class GuiRadioButton extends GuiCheckBox {
  private group: string | null = null;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.RadioButton;
  }

  setGroup(groupId: string | null): this {
    if (groupId !== null && groupId.length === 0) throw new TypeError('Radio button group IDs cannot be empty.');
    this.group = groupId;
    if (this.getValue()) this.clearSelectedSiblings();
    return this;
  }

  getGroup(): string | null { return this.group; }

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
      if (sibling !== this && sibling instanceof GuiRadioButton && sibling.getGroup() === this.group && sibling.getValue()) {
        sibling.setValue(false);
      }
    }
  }
}

export interface GuiBitmapButtonTextures {
  normal: Texture | null;
  hover: Texture | null;
  pressed: Texture | null;
  disabled: Texture | null;
}

export class GuiBitmapButton extends GuiButtonBase {
  private textures: GuiBitmapButtonTextures = { normal: null, hover: null, pressed: null, disabled: null };

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.BitmapButton;
  }

  setTextures(textures: Partial<GuiBitmapButtonTextures>): this {
    this.textures = {
      normal: textures.normal ?? null,
      hover: textures.hover ?? null,
      pressed: textures.pressed ?? null,
      disabled: textures.disabled ?? null,
    };
    return this;
  }

  getTextures(): GuiBitmapButtonTextures { return { ...this.textures }; }
  /** @internal Texture ownership is checked by the Game-owned GUIManager. */
  _getButtonTextures(): GuiBitmapButtonTextures { return this.getTextures(); }
}

export class GuiSlider extends GuiNumberValueControl<number> {
  constructor(options: GUIControlOptions = {}) {
    super(options, 0, GuiControlKind.Slider, 'slider');
  }
}
