import type { GameComponent as Component, GameComponentType } from './game-component';
import type { GameObject } from './game-object';
import type { GameScene } from './game-scene';
import type { Texture } from '../textures/texture';

declare global {
  namespace Reflect {
    function defineMetadata(key: string, value: unknown, target: object): void;
    function getOwnMetadata(key: string, target: object): unknown;
    function getMetadata(key: string, target: object, propertyKey: string): unknown;
  }
}

/** Callback for a failed @Asset load. Return a replacement texture (or a promise of one) to use instead, or null; call retry() to load the path again. */
export type AssetErrorHandler = (
  error: string,
  path: string,
  retry: () => Texture,
) => Texture | null | Promise<Texture | null>;

interface AssetAnnotation {
  readonly kind: 'asset';
  readonly key: string;
  readonly path: string;
  readonly onError: AssetErrorHandler | undefined;
}

interface ComponentAnnotation {
  readonly kind: 'component';
  readonly key: string;
  readonly type: GameComponentType<Component>;
  readonly options: object | undefined;
}

type Annotation = AssetAnnotation | ComponentAnnotation;

type PropertyAnnotation = (target: object, key: string | symbol) => void;

interface Binding {
  readonly key: string;
  readonly value: unknown;
}

type BindingState = true | Promise<void>;

const ANNOTATIONS_KEY = 'bornengine:annotations';

let bindingStates: WeakMap<object, BindingState> | null = null;

/**
 * Property decorator that loads the texture at the path and assigns it to the field when the object is added to a scene.
 * @param onError Called on failure; without it, a failed load throws when the object is added.
 */
export function Asset(path: string, onError?: AssetErrorHandler): PropertyAnnotation {
  return (target, key) => {
    addAnnotation(target, { kind: 'asset', key: String(key), path, onError });
  };
}

/** Attaches a component of the field's declared class. Pass the class as the type argument to type `options`. */
export function GameComponent<T extends Component = Component>(options?: T['__options']): PropertyAnnotation {
  return (target, key) => {
    const name = String(key);
    const type = Reflect.getMetadata('design:type', target, name);
    if (typeof type !== 'function') throw new TypeError(`@GameComponent "${name}" needs a class type`);
    addAnnotation(target, {
      kind: 'component',
      key: name,
      type: type as GameComponentType<Component>,
      options,
    });
  };
}

/**
 * Resolves the @Asset and @GameComponent fields of an object for the given scene.
 * @returns a promise when an async error callback is pending, otherwise null once bound.
 */
export function bindAnnotations(object: GameObject, scene: GameScene): Promise<void> | null {
  const states = stateMap();
  const state = states.get(object);
  if (state === true) return null;
  if (state !== undefined) return state;

  const bindings = collectAnnotations(object).map(
    (annotation): Binding => ({
      key: annotation.key,
      value: annotation.kind === 'asset' ? loadAsset(scene, annotation) : attachComponent(object, annotation),
    }),
  );
  if (!bindings.some((binding) => isThenable(binding.value))) {
    assignBindings(object, bindings);
    states.set(object, true);
    return null;
  }

  const pending = Promise.all(bindings.map(async (binding) => ({ key: binding.key, value: await binding.value }))).then(
    (resolved) => {
      assignBindings(object, resolved);
      states.set(object, true);
    },
  );
  states.set(object, pending);
  return pending;
}

function stateMap(): WeakMap<object, BindingState> {
  if (bindingStates === null) bindingStates = new WeakMap();
  return bindingStates;
}

function assignBindings(object: GameObject, bindings: readonly Binding[]): void {
  for (const binding of bindings) Reflect.set(object, binding.key, binding.value);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as PromiseLike<unknown>).then === 'function';
}

function addAnnotation(target: object, annotation: Annotation): void {
  Reflect.defineMetadata(ANNOTATIONS_KEY, [...ownAnnotations(target), annotation], target);
}

function ownAnnotations(target: object): Annotation[] {
  const stored = Reflect.getOwnMetadata(ANNOTATIONS_KEY, target);
  return Array.isArray(stored) ? stored : [];
}

function collectAnnotations(target: object): Annotation[] {
  const chain: Annotation[][] = [];
  for (let proto: object | null = target; proto !== null; proto = Object.getPrototypeOf(proto)) {
    chain.unshift(ownAnnotations(proto));
  }
  return chain.flat();
}

function loadAsset(scene: GameScene, annotation: AssetAnnotation): unknown {
  const texture = scene._loadTexture(annotation.path);
  if (texture !== null && texture.isLoaded) return texture;
  const error = loadError(texture, annotation.path);
  if (annotation.onError === undefined) throw new Error(error);
  return annotation.onError(error, annotation.path, () => retryLoad(scene, annotation.path));
}

function retryLoad(scene: GameScene, path: string): Texture {
  const texture = scene._reloadTexture(path);
  if (texture !== null && texture.isLoaded) return texture;
  throw new Error(loadError(texture, path));
}

function loadError(texture: Texture | null, path: string): string {
  if (texture === null) return `Could not load ${path}: scene has no asset manager`;
  return texture.error || `Could not load ${path}`;
}

function attachComponent(object: GameObject, annotation: ComponentAnnotation): Component {
  const component = object.addComponent(
    annotation.options === undefined ? new annotation.type() : new annotation.type(annotation.options),
  );
  if (component === null) throw new Error(`Could not attach "${annotation.key}" component`);
  return component;
}
