type BrowserHost = Record<string, unknown>;

/** Connect the native WebAssembly FFI to TypeScript emitted as browser JavaScript. */
export function installBrowserFfi(host: BrowserHost, ffi: Record<string, unknown>): void {
  Object.assign(host, ffi);
  host.callWasmClosure = (callback: unknown, deltaTime: number): void => {
    if (typeof callback !== 'function') {
      throw new TypeError('The browser preview expected a JavaScript game callback.');
    }
    (callback as (dt: number) => void)(deltaTime);
  };
}
