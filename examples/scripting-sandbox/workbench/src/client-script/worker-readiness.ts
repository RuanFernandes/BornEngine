const REGISTRATION_ERROR = 'TypeScript not registered!';
const REGISTRATION_TIMEOUT_MS = 10_000;
const RETRY_INTERVAL_MS = 16;

export async function waitForTypeScriptWorker<T>(loadWorker: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + REGISTRATION_TIMEOUT_MS;

  while (true) {
    try {
      return await loadWorker();
    } catch (error) {
      if (error !== REGISTRATION_ERROR || Date.now() >= deadline) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
  }
}
