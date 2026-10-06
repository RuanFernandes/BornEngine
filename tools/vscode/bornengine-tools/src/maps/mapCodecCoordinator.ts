export interface MapCodecRevision {
  uri: string;
  textVersion: number;
  generation: number;
  sourceText: string;
}

export interface MapCodecRequest extends MapCodecRevision {
  type: 'encode';
  effort: 'max';
}

export interface MapCodecResult extends MapCodecRevision {
  type: 'encoded';
  ok: boolean;
  json: string;
  diagnostics?: string;
}

interface MapCodecWorkerPort {
  on(event: 'message', listener: (result: MapCodecResult) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  postMessage(request: MapCodecRequest): void;
  terminate(): Promise<number> | number;
}

interface PendingCodecRequest {
  promise: Promise<MapCodecResult>;
  resolve(result: MapCodecResult): void;
  reject(error: Error): void;
}

function revisionKey(revision: MapCodecRevision): string {
  return `${revision.uri.length}:${revision.uri}:${revision.textVersion}:${revision.generation}:${revision.sourceText}`;
}

function sameRevision(left: MapCodecRevision, right: MapCodecRevision): boolean {
  return left.uri === right.uri && left.textVersion === right.textVersion &&
    left.generation === right.generation && left.sourceText === right.sourceText;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('World2D map encoding worker failed.');
}

/** Debounces max-effort map encoding and accepts results only for the latest document revision. */
export class World2DMapCodecCoordinator {
  private worker: MapCodecWorkerPort | null = null;
  private disposed = false;
  private readonly latest = new Map<string, MapCodecRevision>();
  private readonly cached = new Map<string, MapCodecResult>();
  private readonly pending = new Map<string, PendingCodecRequest>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly createWorker: () => MapCodecWorkerPort,
    private readonly debounceMs = 250,
  ) {}

  schedule(revision: MapCodecRevision): void {
    this.ensureAvailable();
    this.setLatest(revision);
    this.clearTimer(revision.uri);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(revision.uri);
      void this.dispatch(revision).catch(() => undefined);
    }, this.debounceMs);
    this.debounceTimers.set(revision.uri, timer);
  }

  invalidate(uri: string): void {
    this.clearTimer(uri);
    this.latest.delete(uri);
    for (const key of this.cached.keys()) if (key.startsWith(`${uri.length}:${uri}:`)) this.cached.delete(key);
    for (const [key, request] of this.pending) {
      if (key.startsWith(`${uri.length}:${uri}:`)) {
        this.pending.delete(key);
        request.reject(new Error('World2D map revision changed before encoding completed.'));
      }
    }
  }

  isCurrent(revision: MapCodecRevision): boolean {
    const current = this.latest.get(revision.uri);
    return current !== undefined && sameRevision(current, revision);
  }

  requestMax(revision: MapCodecRevision, timeoutMs?: number): Promise<MapCodecResult | null> {
    this.ensureAvailable();
    this.setLatest(revision);
    this.clearTimer(revision.uri);
    const key = revisionKey(revision);
    const cached = this.cached.get(key);
    if (cached && sameRevision(cached, revision)) return Promise.resolve(cached);

    const request = this.pending.get(key) ?? this.startRequest(revision, key);
    if (timeoutMs === undefined) return request.promise;
    return new Promise<MapCodecResult | null>((resolve, reject) => {
      const timer = setTimeout(() => resolve(null), Math.max(0, timeoutMs));
      request.promise.then((result) => {
        clearTimeout(timer);
        resolve(result);
      }, (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const uri of this.debounceTimers.keys()) this.clearTimer(uri);
    for (const request of this.pending.values()) request.reject(new Error('World2D map encoder was disposed.'));
    this.pending.clear();
    const worker = this.worker;
    this.worker = null;
    if (worker) void worker.terminate();
  }

  private ensureAvailable(): void {
    if (this.disposed) throw new Error('World2D map encoder is unavailable.');
  }

  private clearTimer(uri: string): void {
    const timer = this.debounceTimers.get(uri);
    if (timer !== undefined) clearTimeout(timer);
    this.debounceTimers.delete(uri);
  }

  private setLatest(revision: MapCodecRevision): void {
    const previous = this.latest.get(revision.uri);
    if (previous && sameRevision(previous, revision)) return;
    this.latest.set(revision.uri, revision);
    for (const key of this.cached.keys()) if (key.startsWith(`${revision.uri.length}:${revision.uri}:`)) this.cached.delete(key);
    for (const [key, request] of this.pending) {
      if (key.startsWith(`${revision.uri.length}:${revision.uri}:`)) {
        this.pending.delete(key);
        request.reject(new Error('World2D map revision changed before encoding completed.'));
      }
    }
  }

  private ensureWorker(): MapCodecWorkerPort {
    this.ensureAvailable();
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.on('message', (result) => this.receive(result));
    worker.on('error', (error) => this.failWorker(worker, asError(error)));
    this.worker = worker;
    return worker;
  }

  private startRequest(revision: MapCodecRevision, key: string): PendingCodecRequest {
    const request = {} as PendingCodecRequest;
    request.promise = new Promise<MapCodecResult>((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });
    this.pending.set(key, request);
    try {
      this.ensureWorker().postMessage({ ...revision, type: 'encode', effort: 'max' });
    } catch (error) {
      this.pending.delete(key);
      request.reject(asError(error));
    }
    return request;
  }

  private dispatch(revision: MapCodecRevision): Promise<MapCodecResult> {
    return this.requestMax(revision).then((result) => {
      if (result === null) throw new Error('World2D max encoding did not return a result.');
      return result;
    });
  }

  private receive(result: MapCodecResult): void {
    if (result === null || typeof result !== 'object' || result.type !== 'encoded' ||
        typeof result.uri !== 'string' || typeof result.sourceText !== 'string') return;
    const revision: MapCodecRevision = {
      uri: result.uri,
      textVersion: result.textVersion,
      generation: result.generation,
      sourceText: result.sourceText,
    };
    const key = revisionKey(revision);
    const request = this.pending.get(key);
    this.pending.delete(key);
    if (!this.isCurrent(revision)) {
      request?.reject(new Error('World2D map revision changed before encoding completed.'));
      return;
    }
    this.cached.set(key, result);
    request?.resolve(result);
  }

  private failWorker(worker: MapCodecWorkerPort, error: Error): void {
    if (this.worker === worker) this.worker = null;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    void worker.terminate();
  }
}
