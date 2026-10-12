import { GUIEventType } from '../events';
import { GUI } from '../gui';
import { GUIProfiles } from '../profile';
import { GuiControlKind } from '../commands';
import type { GuiControlKindCode } from '../commands';
import { validateGuiCoordinate } from '../layout';
import type { GUIControlOptions } from '../types';

/** Base class for controls that hold a numeric or boolean value and report changes made by the user. */
export class GuiNumberValueControl<TValue extends number | boolean> extends GUI {
  private value: TValue;
  private minimum = 0;
  private maximum = 1;
  private revision = 0;

  /**
   * @param options Initial control options.
   * @param initialValue Starting value.
   * @param kind Native control kind sent to the renderer.
   * @param profile Name of the style profile to apply.
   */
  constructor(
    options: GUIControlOptions = {},
    initialValue: TValue,
    kind: GuiControlKindCode = GuiControlKind.Control,
    profile = 'default',
  ) {
    super(options);
    this.value = initialValue;
    this._guiCommandKind = kind;
    this.setProfile(GUIProfiles.get(profile));
    this.syncCommand();
  }

  /** Returns the current value. */
  getValue(): TValue {
    return this.value;
  }

  /**
   * Sets the value. Numbers are clamped to the current range.
   *
   * @throws TypeError if the value is neither a number nor a boolean.
   */
  setValue(value: TValue): this {
    if (typeof value === 'number') {
      validateGuiCoordinate(value, 'value');
      this.value = Math.max(this.minimum, Math.min(this.maximum, value)) as TValue;
    } else if (typeof value === 'boolean') {
      this.value = value as TValue;
    } else {
      throw new TypeError('GUI value controls accept only numbers or booleans.');
    }
    this.revision++;
    this.syncCommand();
    return this;
  }

  /**
   * Sets the allowed range and clamps a numeric value into it.
   *
   * @throws RangeError if minimum is greater than maximum.
   */
  setRange(minimum: number, maximum: number): this {
    validateGuiCoordinate(minimum, 'minimum');
    validateGuiCoordinate(maximum, 'maximum');
    if (minimum > maximum) throw new RangeError('Minimum must not exceed maximum.');
    this.minimum = minimum;
    this.maximum = maximum;
    if (typeof this.value === 'number') this.value = Math.max(minimum, Math.min(maximum, this.value)) as TValue;
    this.revision++;
    this.syncCommand();
    return this;
  }

  /** Returns the current minimum and maximum. */
  getRange(): { minimum: number; maximum: number } {
    return { minimum: this.minimum, maximum: this.maximum };
  }

  /** @internal Captures the value revision associated with an emitted command. */
  _captureValueRevision(): number {
    return this.revision;
  }

  /** @internal Applies a native response only if TypeScript has not since changed the value. */
  _applyNativeValue(value: TValue, commandRevision: number): void {
    if (commandRevision !== this.revision) return;
    const previous = this.value;
    if (previous === value) return;
    this.setValue(value);
    this._dispatchValueChange();
  }

  private syncCommand(): void {
    this._guiCommandValues = [
      typeof this.value === 'boolean' ? (this.value ? 1 : 0) : this.value,
      this.minimum,
      this.maximum,
    ];
  }

  private _dispatchValueChange(): void {
    const manager = this._getManager();
    if (manager !== null) manager.dispatchEvent(this, GUIEventType.Change);
  }
}
