import { GuiControlKind } from '../commands';
import { GUIEventType } from '../events';
import { GUI } from '../gui';
import { GUIProfiles } from '../profile';
import { validateGuiCoordinate } from '../layout';
import type { GUIControlOptions } from '../types';

/** Control that displays a text label. */
export class GuiText extends GUI {
  private text = '';

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Text;
    this.setProfile(GUIProfiles.get('text'));
  }

  /** Returns the displayed text. */
  getText(): string {
    return this.text;
  }
  /** Sets the displayed text. */
  setText(text: string): this {
    this.text = text;
    this._guiCommandText = text;
    return this;
  }
}

/** Multi-line text label. */
export class GuiMLText extends GuiText {
  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.MLText;
  }
}

/** Single-line editable text field with optional length limit, password masking, and numbers-only input. */
export class GuiTextEdit extends GuiText {
  private maxLength = 0x7fff_ffff;
  private password = false;
  private numbersOnly = false;
  private selectionStart = 0;
  private selectionEnd = 0;
  private textRevision = 0;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.TextEdit;
    this.syncOptions();
  }

  /** Sets the text, applying the numbers-only filter and the maximum length. */
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

  /** Selects the whole text. */
  selectAll(): this {
    this.selectionStart = 0;
    this.selectionEnd = this.getText().length;
    this.syncOptions();
    return this;
  }

  /** Removes all text and clears the selection. */
  clear(): this {
    this.setText('');
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.syncOptions();
    return this;
  }

  /**
   * Sets the maximum text length and truncates the current text if needed.
   *
   * @throws RangeError if the length is not a non-negative integer.
   */
  setMaxLength(length: number): this {
    validateGuiCoordinate(length, 'maximum text length');
    if (!Number.isInteger(length) || length < 0)
      throw new RangeError('Maximum text length must be a non-negative integer.');
    this.maxLength = length;
    this.setText(this.getText());
    this.syncOptions();
    return this;
  }

  /** Returns the maximum text length. */
  getMaxLength(): number {
    return this.maxLength;
  }
  /** Enables or disables password masking. */
  setPassword(enabled: boolean): this {
    this.password = enabled;
    this.syncOptions();
    return this;
  }
  /** Returns whether password masking is enabled. */
  isPassword(): boolean {
    return this.password;
  }
  /** Enables or disables numbers-only input. When enabled, characters other than digits, ".", "+" and "-" are removed from the text. */
  setNumbersOnly(enabled: boolean): this {
    this.numbersOnly = enabled;
    if (enabled) this.setText(this.getText());
    this.syncOptions();
    return this;
  }
  /** Returns whether numbers-only input is enabled. */
  isNumbersOnly(): boolean {
    return this.numbersOnly;
  }
  /** Returns the selected text range as start and end character offsets. */
  getSelection(): { start: number; end: number } {
    return { start: this.selectionStart, end: this.selectionEnd };
  }

  /** @internal Captures the text revision associated with an emitted command. */
  _captureTextRevision(): number {
    return this.textRevision;
  }

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

/** Multi-line editable text field. */
export class GuiMLTextEdit extends GuiTextEdit {
  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.MLTextEdit;
  }
}

/** Text field that edits a numeric value within a range. */
export class GuiTextEditSlider extends GuiTextEdit {
  private value = 0;
  private minimum = 0;
  private maximum = 1;
  private revision = 0;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.TextEditSlider;
    this.syncValueCommand();
  }

  /** Sets the text, applying the numbers-only filter and the maximum length. */
  override setText(text: string): this {
    super.setText(text);
    this.syncValueCommand();
    return this;
  }

  /**
   * Sets the allowed range and clamps the current value into it.
   *
   * @throws RangeError if minimum is greater than maximum.
   */
  setRange(minimum: number, maximum: number): this {
    validateGuiCoordinate(minimum, 'minimum');
    validateGuiCoordinate(maximum, 'maximum');
    if (minimum > maximum) throw new RangeError('Minimum must not exceed maximum.');
    this.minimum = minimum;
    this.maximum = maximum;
    this.setValue(this.value);
    return this;
  }

  /** Sets the maximum text length and truncates the current text if needed. */
  override setMaxLength(length: number): this {
    super.setMaxLength(length);
    this.syncValueCommand();
    return this;
  }

  /** Enables or disables password masking. */
  override setPassword(enabled: boolean): this {
    super.setPassword(enabled);
    this.syncValueCommand();
    return this;
  }

  /** Enables or disables numbers-only input. */
  override setNumbersOnly(enabled: boolean): this {
    super.setNumbersOnly(enabled);
    this.syncValueCommand();
    return this;
  }

  /** Returns the current minimum and maximum. */
  getRange(): { minimum: number; maximum: number } {
    return { minimum: this.minimum, maximum: this.maximum };
  }
  /** Returns the current numeric value. */
  getValue(): number {
    return this.value;
  }

  /** Sets the value, clamped to the range, and updates the text to match. */
  setValue(value: number): this {
    validateGuiCoordinate(value, 'value');
    this.value = Math.max(this.minimum, Math.min(this.maximum, value));
    this.revision++;
    super.setText(String(this.value));
    this.syncValueCommand();
    return this;
  }

  /** @internal Captures the numeric value revision emitted with this control. */
  _captureValueRevision(): number {
    return this.revision;
  }

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
