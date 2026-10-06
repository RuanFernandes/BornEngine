import type {
  World2DJsonValue,
  World2DObjectData,
  World2DPropertyData,
  World2DVector,
} from '@bornengine/engine/world2d/editor';
import type { World2DEditOperation } from './world2dEdits';

export type ObjectInspectorChange =
  | { type: 'transform'; transform: NonNullable<Extract<World2DEditOperation, { type: 'transformObject' }>['transform']> }
  | { type: 'name'; value: string }
  | { type: 'objectType'; value: string }
  | { type: 'visible'; value: boolean }
  | { type: 'tags'; value: string[] }
  | { type: 'property'; name: string; value: World2DPropertyData | null }
  | { type: 'component'; kind: 'spriteRenderer' | 'physicsBody2D'; data: Record<string, World2DJsonValue> | null };

export function createDefaultWorld2DObject(id: string, position: World2DVector, ordinal = 1): World2DObjectData {
  return {
    id,
    name: `Object ${ordinal}`,
    type: 'object',
    position: { ...position },
    rotation: 0,
    size: { x: 16, y: 16 },
    origin: { x: 0.5, y: 0.5 },
    visible: true,
    tags: [],
    properties: {},
    components: [],
  };
}

export function createObjectInspectorOperation(
  layerId: string,
  objectId: string,
  change: ObjectInspectorChange,
): World2DEditOperation {
  switch (change.type) {
    case 'transform':
      return { type: 'transformObject', layerId, objectId, transform: change.transform };
    case 'name':
      return { type: 'updateObject', layerId, objectId, updates: { name: change.value } };
    case 'objectType':
      return { type: 'updateObject', layerId, objectId, updates: { type: change.value } };
    case 'visible':
      return { type: 'updateObject', layerId, objectId, updates: { visible: change.value } };
    case 'tags':
      return { type: 'updateObject', layerId, objectId, updates: { tags: [...change.value] } };
    case 'property':
      return { type: 'setObjectProperty', layerId, objectId, propertyName: change.name, value: change.value };
    case 'component':
      return { type: 'setObjectComponent', layerId, objectId, kind: change.kind, data: change.data };
    default: {
      const exhaustive: never = change;
      throw new Error(`Unsupported object inspector change: ${String((exhaustive as { type?: unknown }).type)}.`);
    }
  }
}
