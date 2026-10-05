import { GuiControlKind } from '../commands';
import { GUIEventType } from '../events';
import { GUI } from '../gui';
import { GUIProfiles } from '../profile';
import { validateGuiCoordinate } from '../layout';
import type { GUIControlOptions } from '../types';

export class GuiText extends GUI {
  private text = '';

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Text;
    this.setProfile(GUIProfiles.get('text'));
  }

  getText(): string { return this.text; }
  setText(text: string): this {
    this.text = text;
    this._guiCommandText = text;
    return this;
  }
}

export class GuiMLText extends GuiText {
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.MLText;
  }
}

export class GuiTextEdit extends GuiText {
  private maxLength = 0x7fff_ffff;
  private password = false;
  private numbersOnly = false;
  private selectionStart = 0;
  private selectionEnd = 0;
  private textRevision = 0;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.TextEdit;
    this.syncOptions();
  }

  override setText(text: string): this {
    let value = text;
    if (this.numbersOnly) value = value.replace(/[^0-9.+-]/g, '');
    if (value.length > this.maxLength) value = value.slice(0, this.maxLength);
    super.setText(value);
    this.textRevision++;
    this.selectionStart = Math.min(this.selectionStart, value.length);
    this.selectionEnd = Math.min(this.selectionEnd, value.length);
    this.syncOptions();
    return this;
  }

  selectAll(): this {
    this.selectionStart = 0;
    this.selectionEnd = this.getText().length;
    this.syncOptions();
    return this;
  }

  clear(): this {
    this.setText('');
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.syncOptions();
    return this;
  }

  setMaxLength(length: number): this {
    validateGuiCoordinate(length, 'maximum text length');
    if (!Number.isInteger(length) || length < 0) throw new RangeError('Maximum text length must be a non-negative integer.');
    this.maxLength = length;
    this.setText(this.getText());
    this.syncOptions();
    return this;
  }

  getMaxLength(): number { return this.maxLength; }
  setPassword(enabled: boolean): this { this.password = enabled; this.syncOptions(); return this; }
  isPassword(): boolean { return this.password; }
  setNumbersOnly(enabled: boolean): this {
    this.numbersOnly = enabled;
    if (enabled) this.setText(this.getText());
    this.syncOptions();
    return this;
  }
  isNumbersOnly(): boolean { return this.numbersOnly; }
  getSelection(): { start: number; end: number } { return { start: this.selectionStart, end: this.selectionEnd }; }

  /** @internal Captures the text revision associated with an emitted command. */
  _captureTextRevision(): number { return this.textRevision; }

  /** @internal Applies native edits only when no newer TypeScript text was set. */
  _applyNativeText(text: string, commandRevision: number, dispatchChange = true): boolean {
    if (commandRevision !== this.textRevision) return false;
    const previous = this.getText();
    this.setText(text);
    if (previous === this.getText()) return false;
    if (dispatchChange) {
      const manager = this._getManager();
      if (manager !== null) manager.dispatchEvent(this, GUIEventType.Change);
    }
    return true;
  }

  private syncOptions(): void {
    this._guiCommandValues = [
      this.password ? 1 : 0,
      this.numbersOnly ? 1 : 0,
      this.maxLength,
      this.selectionStart,
      this.selectionEnd,
    ];
  }
}

export class GuiMLTextEdit extends GuiTextEdit {
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.MLTextEdit;
  }
}

export class GuiTextEditSlider extends GuiTextEdit {
  private value = 0;
  private minimum = 0;
  private maximum = 1;
  private revision = 0;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.TextEditSlider;
    this.syncValueCommand();
  }

  override setText(text: string): this {
    super.setText(text);
    this.syncValueCommand();
    return this;
  }

  setRange(minimum: number, maximum: number): this {
    validateGuiCoordinate(minimum, 'minimum');
    validateGuiCoordinate(maximum, 'maximum');
    if (minimum > maximum) throw new RangeError('Minimum must not exceed maximum.');
    this.minimum = minimum;
    this.maximum = maximum;
    this.setValue(this.value);
    return this;
  }

  override setMaxLength(length: number): this {
    super.setMaxLength(length);
    this.syncValueCommand();
    return this;
  }

  override setPassword(enabled: boolean): this {
    super.setPassword(enabled);
    this.syncValueCommand();
    return this;
  }

  override setNumbersOnly(enabled: boolean): this {
    super.setNumbersOnly(enabled);
    this.syncValueCommand();
    return this;
  }

  getRange(): { minimum: number; maximum: number } { return { minimum: this.minimum, maximum: this.maximum }; }
  getValue(): number { return this.value; }

  setValue(value: number): this {
    validateGuiCoordinate(value, 'value');
    this.value = Math.max(this.minimum, Math.min(this.maximum, value));
    this.revision++;
    super.setText(String(this.value));
    this.syncValueCommand();
    return this;
  }

  /** @internal Captures the numeric value revision emitted with this control. */
  _captureValueRevision(): number { return this.revision; }

  /** @internal Rejects old native values after newer TypeScript updates. */
  _applyNativeValue(value: number, commandRevision: number): void {
    if (commandRevision !== this.revision) return;
    const previous = this.value;
    if (previous === value) return;
    this.setValue(value);
    const manager = this._getManager();
    if (manager !== null) manager.dispatchEvent(this, GUIEventType.Change);
  }

  /** @internal Keeps editable numeric text while waiting for a complete value. */
  override _applyNativeText(text: string, commandRevision: number): boolean {
    return super._applyNativeText(text, commandRevision, false);
  }

  private syncValueCommand(): void {
    this._guiCommandValues = [
      this.value,
      this.minimum,
      this.maximum,
      this.isPassword() ? 1 : 0,
      this.isNumbersOnly() ? 1 : 0,
      this.getMaxLength(),
      this.getSelection().start,
      this.getSelection().end,
    ];
  }
}
