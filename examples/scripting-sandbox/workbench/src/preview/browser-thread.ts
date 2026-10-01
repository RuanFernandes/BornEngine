/** Promise-compatible fallback for Perry's worker helpers in the browser preview. */
export async function spawn<T>(task: () => T | PromiseLike<T>): Promise<Awaited<T>> {
  return await task();
}

/** Preserve parallelMap's result ordering while browser work runs on its event loop. */
export function parallelMap<T, R>(
  values: readonly T[],
  task: (value: T, index: number) => R | PromiseLike<R>,
): Promise<Awaited<R>[]> {
  return Promise.all(values.map(task));
}
