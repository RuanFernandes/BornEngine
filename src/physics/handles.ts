/** Private registry that keeps native physics identities out of public classes. */
interface NativeHandleRecord {
  owner: object;
  handle: number;
}

const nativeHandles: NativeHandleRecord[] = [];

/** Associates a native physics handle with an owner object; a zero handle is ignored. */
export function registerNativeHandle(owner: object, handle: number): void {
  if (handle === 0) return;
  for (let index = 0; index < nativeHandles.length; index++) {
    if (nativeHandles[index].owner === owner) {
      nativeHandles[index].handle = handle;
      return;
    }
  }
  nativeHandles.push({ owner, handle });
}

/** Returns the native handle registered for an owner, or 0 if none exists. */
export function getNativeHandle(owner: object): number {
  for (let index = 0; index < nativeHandles.length; index++) {
    if (nativeHandles[index].owner === owner) return nativeHandles[index].handle;
  }
  return 0;
}

/** Removes the native handle registration for an owner. */
export function forgetNativeHandle(owner: object): void {
  for (let index = nativeHandles.length - 1; index >= 0; index--) {
    if (nativeHandles[index].owner === owner) nativeHandles.splice(index, 1);
  }
}
