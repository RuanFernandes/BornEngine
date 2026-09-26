import type { Game } from '../core/game';
import { SceneNode } from './scene-node';

export function adoptSceneNode(game: Game, nativeHandle: number, name = ''): SceneNode {
  return (SceneNode as any).adoptNative(game, nativeHandle, name) as SceneNode;
}

export function adoptSceneNodeParent(child: SceneNode, parent: SceneNode): void {
  (SceneNode as any).adoptParentLink(child, parent);
}

export function matchesSceneNodeHandle(node: SceneNode, nativeHandle: number): boolean {
  return (node as any).matchesNativeHandle(nativeHandle) as boolean;
}
