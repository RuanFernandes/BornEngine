import type { SpriteAnimationFrameDefinition } from './spriteAnimationSchema';

export interface RasterImageSize {
  width: number;
  height: number;
}

export interface SpriteFrameSize {
  width: number;
  height: number;
}

export interface SpriteAnimationCreationData {
  name: string;
  imageRelativePath: string;
  metadataPath: string;
  imageSize: RasterImageSize;
  frameSize: SpriteFrameSize;
  frames?: SpriteAnimationFrameDefinition[];
}

export function readRasterImageSize(fileName: string, input: Uint8Array): RasterImageSize | null {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const readU24LE = (offset: number): number => bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
  const isPng = bytes.length >= 24 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG';
  if (isPng) return positiveSize(bytes.readUInt32BE(16), bytes.readUInt32BE(20));

  const isGif = bytes.length >= 10 && (bytes.toString('ascii', 0, 6) === 'GIF87a' || bytes.toString('ascii', 0, 6) === 'GIF89a');
  if (isGif) return positiveSize(bytes.readUInt16LE(6), bytes.readUInt16LE(8));

  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return positiveSize(readU24LE(24) + 1, readU24LE(27) + 1);
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return positiveSize(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const first = bytes[21]!;
      const second = bytes[22]!;
      const third = bytes[23]!;
      const fourth = bytes[24]!;
      return positiveSize(1 + first + ((second & 0x3f) << 8), 1 + ((second >> 6) & 0x03) + (third << 2) + ((fourth & 0x0f) << 10));
    }
  }

  if (bytes.length >= 26 && bytes.toString('ascii', 0, 2) === 'BM') {
    const width = Math.abs(bytes.readInt32LE(18));
    const height = Math.abs(bytes.readInt32LE(22));
    return positiveSize(width, height);
  }

  if (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const segmentLength = bytes.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      const isStartOfFrame = marker !== undefined && [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
      if (isStartOfFrame && segmentLength >= 7) return positiveSize(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      offset += segmentLength;
    }
  }

  return null;
}

function positiveSize(width: number, height: number): RasterImageSize | null {
  return Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
    ? { width, height }
    : null;
}

export function parseFrameSize(value: string, imageSize: RasterImageSize): SpriteFrameSize | null {
  const match = value.trim().match(/^(\d+)\s*[x×,]\s*(\d+)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width > imageSize.width || height > imageSize.height) return null;
  return { width, height };
}

export function spriteAnimationFileStem(name: string): string {
  const stem = name.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return stem || 'animation';
}

export function createSpriteAnimationAssets(data: SpriteAnimationCreationData): {
  metadata: {
    spritesheet: { path: string };
    cell_size: SpriteFrameSize;
    sheet_size: RasterImageSize;
    columns: number;
    rows: Array<{ row: number; type: string; frame_count: number; animation_group_id: string; direction: string }>;
  };
  animation: {
    format: 'bornengine.spriteanim';
    version: 1;
    source: string;
    clips: Array<{ name: string; animationGroupId: string; fps: number; loop: 'loop'; frames?: SpriteAnimationFrameDefinition[] }>;
  };
} {
  const columns = Math.floor(data.imageSize.width / data.frameSize.width);
  const rowCount = Math.floor(data.imageSize.height / data.frameSize.height);
  if (columns < 1 || rowCount < 1) throw new Error('Frame size must fit inside the selected sprite sheet.');

  return {
    metadata: {
      spritesheet: { path: data.imageRelativePath },
      cell_size: { ...data.frameSize },
      sheet_size: { ...data.imageSize },
      columns,
      rows: Array.from({ length: rowCount }, (_, row) => ({
        row,
        type: data.name,
        frame_count: columns,
        animation_group_id: data.name,
        direction: `row-${row + 1}`,
      })),
    },
    animation: {
      format: 'bornengine.spriteanim',
      version: 1,
      source: data.metadataPath,
      clips: [{
        name: data.name,
        animationGroupId: data.name,
        fps: 12,
        loop: 'loop',
        ...(data.frames === undefined ? {} : { frames: data.frames.map((frame) => ({ ...frame })) }),
      }],
    },
  };
}
