import type { Color } from '../../core/types';
import type { Texture } from '../../textures';
import { GuiControlKind } from '../commands';
import type { GuiControlKindCode } from '../commands';
import { GUI } from '../gui';
import { GUIProfiles } from '../profile';
import { validateGuiCoordinate, validateGuiDimension } from '../layout';
import type { GUIControlOptions, GuiPoint, GuiRect } from '../types';

const WHITE: Color = { r: 1, g: 1, b: 1, a: 1 };

abstract class GuiImageBase extends GUI {
  private texture: Texture | null = null;
  private tint: Color = { ...WHITE };
  private opacity = 1;
  private rotation = 0;
  private zoom = 1;

  protected constructor(options: GUIControlOptions = {}, kind: GuiControlKindCode = GuiControlKind.Bitmap) {
    super(options);
    this._guiCommandKind = kind;
    this.syncCommand();
  }

  setTexture(texture: Texture | null): this {
    this.texture = texture;
    this.syncCommand();
    return this;
  }
  getTexture(): Texture | null {
    return this.texture;
  }
  setTint(tint: Color): this {
    validateGuiCoordinate(tint.r, 'tint.r');
    validateGuiCoordinate(tint.g, 'tint.g');
    validateGuiCoordinate(tint.b, 'tint.b');
    validateGuiCoordinate(tint.a, 'tint.a');
    this.tint = { ...tint };
    this.syncCommand();
    return this;
  }
  getTint(): Color {
    return { ...this.tint };
  }
  setOpacity(opacity: number): this {
    validateGuiDimension(opacity, 'opacity');
    if (opacity > 1) throw new RangeError('Opacity must be between zero and one.');
    this.opacity = opacity;
    this.syncCommand();
    return this;
  }
  getOpacity(): number {
    return this.opacity;
  }
  setRotation(rotation: number): this {
    validateGuiCoordinate(rotation, 'rotation');
    this.rotation = rotation;
    this.syncCommand();
    return this;
  }
  getRotation(): number {
    return this.rotation;
  }
  setZoom(zoom: number): this {
    validateGuiDimension(zoom, 'zoom');
    if (zoom === 0) throw new RangeError('Zoom must be greater than zero.');
    this.zoom = zoom;
    this.syncCommand();
    return this;
  }
  getZoom(): number {
    return this.zoom;
  }

  /** @internal Texture references are validated by the Game-owned GUIManager. */
  _getTexture(): Texture | null {
    return this.texture;
  }

  private syncCommand(): void {
    this._guiCommandValues = [
      this.opacity,
      this.rotation,
      this.zoom,
      this.tint.r,
      this.tint.g,
      this.tint.b,
      this.tint.a,
      0,
    ];
  }
}

export class GuiBitmap extends GuiImageBase {
  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.Bitmap);
  }
}

export class GuiShowImg extends GuiImageBase {
  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.ShowImg);
  }
}

export class GuiProgress extends GUI {
  private value = 0;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Progress;
    this.setProfile(GUIProfiles.get('progress'));
    this.syncCommand();
  }

  setValue(value: number): this {
    validateGuiCoordinate(value, 'progress value');
    this.value = Math.max(0, Math.min(1, value));
    this.syncCommand();
    return this;
  }

  getValue(): number {
    return this.value;
  }
  private syncCommand(): void {
    this._guiCommandValues = [this.value];
  }
}

export interface GuiDrawingLine {
  kind: 'line';
  start: GuiPoint;
  end: GuiPoint;
  color: Color;
  thickness: number;
}

export interface GuiDrawingRect {
  kind: 'rect';
  rect: GuiRect;
  color: Color;
  filled: boolean;
}

export interface GuiDrawingCircle {
  kind: 'circle';
  center: GuiPoint;
  radius: number;
  color: Color;
  thickness: number;
}

export interface GuiDrawingText {
  kind: 'text';
  text: string;
  position: GuiPoint;
  size: number;
  color: Color;
}

export interface GuiDrawingImage {
  kind: 'image';
  texture: Texture;
  destination: GuiRect;
  tint: Color;
  rotation: number;
}

export interface GuiDrawingPolyline {
  kind: 'polyline' | 'polygon';
  points: GuiPoint[];
  color: Color;
  thickness: number;
}

export type GuiDrawingCommand =
  | GuiDrawingLine
  | GuiDrawingRect
  | GuiDrawingCircle
  | GuiDrawingText
  | GuiDrawingImage
  | GuiDrawingPolyline;

function copyColor(color: Color): Color {
  validateGuiCoordinate(color.r, 'color.r');
  validateGuiCoordinate(color.g, 'color.g');
  validateGuiCoordinate(color.b, 'color.b');
  validateGuiCoordinate(color.a, 'color.a');
  return { ...color };
}

function copyPoint(point: GuiPoint, name: string): GuiPoint {
  return { x: validateGuiCoordinate(point.x, `${name}.x`), y: validateGuiCoordinate(point.y, `${name}.y`) };
}

function copyRect(rect: GuiRect, name: string): GuiRect {
  return {
    x: validateGuiCoordinate(rect.x, `${name}.x`),
    y: validateGuiCoordinate(rect.y, `${name}.y`),
    width: validateGuiDimension(rect.width, `${name}.width`),
    height: validateGuiDimension(rect.height, `${name}.height`),
  };
}

export class GuiDrawingPanel extends GUI {
  private drawings: GuiDrawingCommand[] = [];

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.DrawingPanel;
    this.setClipToBounds(true);
  }

  drawLine(start: GuiPoint, end: GuiPoint, color: Color, thickness = 1): this {
    this.drawings.push({
      kind: 'line',
      start: copyPoint(start, 'start'),
      end: copyPoint(end, 'end'),
      color: copyColor(color),
      thickness: validateGuiDimension(thickness, 'thickness'),
    });
    this.syncDrawings();
    return this;
  }

  drawRect(rect: GuiRect, color: Color, filled = true): this {
    this.drawings.push({ kind: 'rect', rect: copyRect(rect, 'rect'), color: copyColor(color), filled });
    this.syncDrawings();
    return this;
  }

  drawCircle(center: GuiPoint, radius: number, color: Color, thickness = 1): this {
    this.drawings.push({
      kind: 'circle',
      center: copyPoint(center, 'center'),
      radius: validateGuiDimension(radius, 'radius'),
      color: copyColor(color),
      thickness: validateGuiDimension(thickness, 'thickness'),
    });
    this.syncDrawings();
    return this;
  }

  drawText(text: string, position: GuiPoint, size: number, color: Color): this {
    this.drawings.push({
      kind: 'text',
      text,
      position: copyPoint(position, 'position'),
      size: validateGuiDimension(size, 'size'),
      color: copyColor(color),
    });
    this.syncDrawings();
    return this;
  }

  drawImage(texture: Texture, destination: GuiRect, tint: Color = WHITE, rotation = 0): this {
    validateGuiCoordinate(rotation, 'rotation');
    this.drawings.push({
      kind: 'image',
      texture,
      destination: copyRect(destination, 'destination'),
      tint: copyColor(tint),
      rotation,
    });
    this.syncDrawings();
    return this;
  }

  drawPolyline(points: GuiPoint[], color: Color, thickness = 1): this {
    if (points.length < 2) throw new RangeError('A polyline requires at least two points.');
    this.drawings.push({
      kind: 'polyline',
      points: points.map((point) => copyPoint(point, 'point')),
      color: copyColor(color),
      thickness: validateGuiDimension(thickness, 'thickness'),
    });
    this.syncDrawings();
    return this;
  }

  drawPolygon(points: GuiPoint[], color: Color): this {
    if (points.length < 3) throw new RangeError('A polygon requires at least three points.');
    this.drawings.push({
      kind: 'polygon',
      points: points.map((point) => copyPoint(point, 'point')),
      color: copyColor(color),
      thickness: 1,
    });
    this.syncDrawings();
    return this;
  }

  clearDrawing(): this {
    this.drawings = [];
    this.syncDrawings();
    return this;
  }

  getDrawingCommands(): readonly GuiDrawingCommand[] {
    return this.drawings.map((command) => {
      if (command.kind === 'line')
        return { ...command, start: { ...command.start }, end: { ...command.end }, color: { ...command.color } };
      if (command.kind === 'rect') return { ...command, rect: { ...command.rect }, color: { ...command.color } };
      if (command.kind === 'circle') return { ...command, center: { ...command.center }, color: { ...command.color } };
      if (command.kind === 'text')
        return { ...command, position: { ...command.position }, color: { ...command.color } };
      if (command.kind === 'image')
        return { ...command, destination: { ...command.destination }, tint: { ...command.tint } };
      return { ...command, points: command.points.map((point) => ({ ...point })), color: { ...command.color } };
    });
  }

  private syncDrawings(): void {
    this._guiCommandDrawings = this.drawings.map((drawing) => {
      if (drawing.kind === 'line')
        return {
          kind: 0,
          values: [
            drawing.start.x,
            drawing.start.y,
            drawing.end.x,
            drawing.end.y,
            drawing.color.r,
            drawing.color.g,
            drawing.color.b,
            drawing.color.a,
            drawing.thickness,
          ],
          text: '',
        };
      if (drawing.kind === 'rect')
        return {
          kind: 1,
          values: [
            drawing.rect.x,
            drawing.rect.y,
            drawing.rect.width,
            drawing.rect.height,
            drawing.color.r,
            drawing.color.g,
            drawing.color.b,
            drawing.color.a,
            drawing.filled ? 1 : 0,
          ],
          text: '',
        };
      if (drawing.kind === 'circle')
        return {
          kind: 2,
          values: [
            drawing.center.x,
            drawing.center.y,
            drawing.radius,
            drawing.color.r,
            drawing.color.g,
            drawing.color.b,
            drawing.color.a,
            drawing.thickness,
          ],
          text: '',
        };
      if (drawing.kind === 'text')
        return {
          kind: 3,
          values: [
            drawing.position.x,
            drawing.position.y,
            drawing.size,
            drawing.color.r,
            drawing.color.g,
            drawing.color.b,
            drawing.color.a,
          ],
          text: drawing.text,
        };
      if (drawing.kind === 'image')
        return {
          kind: 4,
          values: [
            drawing.destination.x,
            drawing.destination.y,
            drawing.destination.width,
            drawing.destination.height,
            drawing.tint.r,
            drawing.tint.g,
            drawing.tint.b,
            drawing.tint.a,
            drawing.rotation,
          ],
          text: '',
          texture: drawing.texture,
        };
      const points = drawing.points.flatMap((point) => [point.x, point.y]);
      return {
        kind: drawing.kind === 'polygon' ? 6 : 5,
        values: [
          drawing.points.length,
          drawing.color.r,
          drawing.color.g,
          drawing.color.b,
          drawing.color.a,
          drawing.thickness,
          ...points,
        ],
        text: '',
      };
    });
  }
}
