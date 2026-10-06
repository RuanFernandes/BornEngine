import type { SpriteAnimationDocument } from './spriteAnimationSchema';

type SpriteAnimationClip = SpriteAnimationDocument['clips'][number];

export function applySpriteAnimationClipUpdate(
  document: SpriteAnimationDocument,
  clipName: string,
  update: (clip: SpriteAnimationClip) => SpriteAnimationClip,
): SpriteAnimationDocument {
  const clip = document.clips.find((candidate) => candidate.name === clipName);
  if (!clip) return document;

  const nextClip = update(clip);
  return {
    ...document,
    clips: document.clips.map((candidate) => candidate.name === clipName ? nextClip : candidate),
  };
}

export function shouldAcceptSpriteAnimationSnapshot(latestEditId: number, acknowledgedEditId: number): boolean {
  return latestEditId <= acknowledgedEditId;
}
