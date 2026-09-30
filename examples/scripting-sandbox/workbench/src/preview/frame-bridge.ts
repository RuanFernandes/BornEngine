import { isPreviewRequest, isPreviewResponse } from './protocol.js';
import type { PreviewRequest, PreviewResponse } from './protocol.js';

export interface MessageHost {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface PreviewBridge {
  send(message: PreviewRequest): boolean;
  dispose(): void;
}

/** A strict same-origin bridge bound to one iframe's WindowProxy. */
export function createPreviewBridge(
  frame: HTMLIFrameElement,
  origin: string,
  hostWindow: MessageHost = window,
  onResponse: (response: PreviewResponse) => void = () => undefined,
): PreviewBridge {
  let disposed = false;
  const expectedOrigin = (() => {
    try {
      const parsed = new URL(origin);
      return parsed.origin === origin && parsed.origin !== 'null' ? parsed.origin : '';
    } catch (_error) {
      return '';
    }
  })();

  const onMessage = (event: MessageEvent): void => {
    if (disposed || expectedOrigin.length === 0 || event.origin !== expectedOrigin ||
        event.source !== frame.contentWindow || !isPreviewResponse(event.data)) return;
    onResponse(event.data);
  };

  hostWindow.addEventListener('message', onMessage);

  return {
    send(message: PreviewRequest): boolean {
      if (disposed || expectedOrigin.length === 0 || !isPreviewRequest(message)) return false;
      const target = frame.contentWindow;
      if (target === null) return false;
      target.postMessage(message, expectedOrigin);
      return true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      hostWindow.removeEventListener('message', onMessage);
    },
  };
}
