/** Direction names in Graal `dir` order: 0 = up, 1 = left, 2 = down, 3 = right. */
export const ANIMATION_DIRECTIONS = ['up', 'left', 'down', 'right'] as const;
export type AnimationDirection = (typeof ANIMATION_DIRECTIONS)[number];
export const DEFAULT_ANIMATION_DIRECTION: AnimationDirection = 'down';

export const ANIMATION_DIRECTION_LABELS: Readonly<Record<AnimationDirection, string>> = {
  up: 'Up',
  left: 'Left',
  down: 'Down',
  right: 'Right',
};

export const ANIMATION_DIRECTION_ARROWS: Readonly<Record<AnimationDirection, string>> = {
  up: '↑',
  left: '←',
  down: '↓',
  right: '→',
};

export type AnimationDirectionFrames<F> = Readonly<Record<AnimationDirection, readonly F[]>>;

export interface DirectionalClip<F> {
  readonly frames?: readonly F[];
  readonly directions?: AnimationDirectionFrames<F>;
}

export function isAnimationDirection(value: unknown): value is AnimationDirection {
  return typeof value === 'string' && (ANIMATION_DIRECTIONS as readonly string[]).includes(value);
}

export function isDirectionalClip<F>(clip: DirectionalClip<F>): boolean {
  return clip.directions !== undefined;
}

/** Frames edited for a clip: its own frames, or the selected direction when the clip is directional. */
export function getClipFrameList<F>(clip: DirectionalClip<F>, direction: AnimationDirection): readonly F[] {
  if (clip.directions !== undefined) return clip.directions[direction];
  return clip.frames ?? [];
}

function withoutFrameData<C extends DirectionalClip<unknown>>(clip: C): Omit<C, 'frames' | 'directions'> {
  const { frames: _frames, directions: _directions, ...rest } = clip;
  return rest;
}

/** Replaces the frames that getClipFrameList returns for the same direction. */
export function withClipFrameList<F, C extends DirectionalClip<F>>(clip: C, direction: AnimationDirection, frames: readonly F[]): C {
  if (clip.directions === undefined) return { ...withoutFrameData(clip), frames: [...frames] } as unknown as C;
  return {
    ...withoutFrameData(clip),
    directions: { ...clip.directions, [direction]: [...frames] },
  } as unknown as C;
}

/**
 * Turns per-direction frames on or off. Enabling seeds every direction (from `seed` when given, otherwise
 * from the current frames); disabling keeps only the `keep` direction.
 */
export function setClipDirectional<F, C extends DirectionalClip<F>>(
  clip: C,
  directional: boolean,
  keep: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
  seed?: (direction: AnimationDirection) => readonly F[] | undefined,
): C {
  if (directional === (clip.directions !== undefined)) return clip;
  if (!directional) return { ...withoutFrameData(clip), frames: [...(clip.directions?.[keep] ?? [])] } as unknown as C;
  const current = clip.frames ?? [];
  const directions = {} as Record<AnimationDirection, F[]>;
  for (const direction of ANIMATION_DIRECTIONS) {
    const seeded = seed?.(direction);
    directions[direction] = [...(seeded !== undefined && seeded.length > 0 ? seeded : current)];
  }
  return { ...withoutFrameData(clip), directions } as unknown as C;
}

/** Copies one direction's frames into another, optionally transforming each copy (for example to mirror it). */
export function copyClipDirection<F, C extends DirectionalClip<F>>(
  clip: C,
  from: AnimationDirection,
  to: AnimationDirection,
  transform: (frame: F) => F = (frame) => frame,
): C {
  if (clip.directions === undefined || from === to) return clip;
  return withClipFrameList(clip, to, clip.directions[from].map(transform));
}

export function oppositeHorizontalDirection(direction: AnimationDirection): AnimationDirection | null {
  if (direction === 'left') return 'right';
  if (direction === 'right') return 'left';
  return null;
}
