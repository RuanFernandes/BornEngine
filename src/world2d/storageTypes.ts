export type World2DSerializeMode = 'compact' | 'readable';
export type World2DSerializeEffort = 'fast' | 'max';

export interface World2DSerializeOptions {
  mode?: World2DSerializeMode;
  effort?: World2DSerializeEffort;
}
