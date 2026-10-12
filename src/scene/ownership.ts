import type { Game } from '../core/game';
import { SceneNode } from './scene-node';

/** @internal Wraps a native scene node handle in a SceneNode owned by the game. */
export function adoptSceneNode(game: Game, nativeHandle: number, name = ''): SceneNode {
  return (SceneNode as any).adoptNative(game, nativeHandle, name) as SceneNode;
}

/** @internal Links an adopted child node under a parent without a native round trip. */
export function adoptSceneNodeParent(child: SceneNode, parent: SceneNode): void {
  (SceneNode as any).adoptParentLink(child, parent);
}

/** @internal Reports whether a node wraps the given native handle. */
export function matchesSceneNodeHandle(node: SceneNode, nativeHandle: number): boolean {
  return (node as any).matchesNativeHandle(nativeHandle) as boolean;
}
