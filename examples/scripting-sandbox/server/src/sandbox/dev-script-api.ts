import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const API_PATH = '/__dev/server-scripts';
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = MAX_SOURCE_BYTES * 6 + 1024;

export interface DevScriptApiOptions {
  readonly scriptsDirectory: string;
  readonly enabled: boolean;
  readonly host?: string;
  readonly reloadStatus?: () => unknown;
  readonly onScriptChanged?: (name: string) => void;
}

export interface DevScriptApiRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

export interface DevScriptApiResponse {
  readonly status: number;
  readonly body: unknown;
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}\.ts$/.test(value) && path.basename(value) === value;
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function withinDirectory(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export class DevScriptApi {
  private readonly scriptsDirectory: string;
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly reloadStatus: () => unknown;
  private readonly onScriptChanged: (name: string) => void;
  private server: Server | null = null;

  constructor(options: DevScriptApiOptions) {
    this.scriptsDirectory = path.resolve(options.scriptsDirectory);
    this.enabled = options.enabled;
    this.host = options.host ?? '127.0.0.1';
    this.reloadStatus = options.reloadStatus ?? (() => ({ state: 'idle', revision: 0 }));
    this.onScriptChanged = options.onScriptChanged ?? (() => undefined);
    if (this.enabled && !['127.0.0.1', '::1'].includes(this.host)) {
      throw new Error('The server script API can only bind to a loopback address.');
    }
  }

  async handle(request: DevScriptApiRequest): Promise<DevScriptApiResponse> {
    if (!this.enabled) return { status: 404, body: { error: 'Not found.' } };
    try {
      return await this.dispatch(request.method.toUpperCase(), request.path, request.body);
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: error.message } };
      return { status: 500, body: { error: 'Server script operation failed.' } };
    }
  }

  async listen(port = 2569): Promise<Server | null> {
    if (!this.enabled) return null;
    if (this.server !== null) return this.server;
    const server = createServer((request, response) => { void this.handleHttpRequest(request, response); });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, this.host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    return server;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (server === null) return;
    this.server = null;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  private async dispatch(method: string, requestPath: string, body: unknown): Promise<DevScriptApiResponse> {
    const pathname = requestPath.split('?', 1)[0] ?? '';
    if (pathname === `${API_PATH}/status`) {
      if (method !== 'GET') throw new ApiError(405, 'Method not allowed.');
      return { status: 200, body: this.reloadStatus() };
    }
    if (pathname === API_PATH || pathname === `${API_PATH}/`) {
      if (method === 'GET') return { status: 200, body: { files: await this.listScripts() } };
      if (method === 'POST') return await this.createScript(body);
      throw new ApiError(405, 'Method not allowed.');
    }
    if (!pathname.startsWith(`${API_PATH}/`)) throw new ApiError(404, 'Not found.');
    const encodedName = pathname.slice(API_PATH.length + 1);
    if (encodedName.length === 0 || encodedName.includes('/')) throw new ApiError(400, 'Use one safe .ts filename.');
    let name: string;
    try {
      name = decodeURIComponent(encodedName);
    } catch (_error) {
      throw new ApiError(400, 'Invalid filename encoding.');
    }
    if (!safeName(name)) throw new ApiError(400, 'Use one safe .ts filename.');

    if (method === 'GET') {
      const file = await this.safeFile(name, true);
      return { status: 200, body: { name, source: await readFile(file, 'utf8') } };
    }
    if (method === 'PUT') return await this.updateScript(name, body);
    if (method === 'PATCH') return await this.renameScript(name, body);
    if (method === 'DELETE') return await this.deleteScript(name);
    throw new ApiError(405, 'Method not allowed.');
  }

  private async listScripts(): Promise<{ name: string; source: string }[]> {
    await mkdir(this.scriptsDirectory, { recursive: true });
    const root = await realpath(this.scriptsDirectory);
    const entries = await readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !safeName(entry.name)) continue;
      try {
        const file = await this.safeFile(entry.name, true);
        files.push({ name: entry.name, source: await readFile(file, 'utf8') });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      }
    }
    return files.sort((left, right) => left.name.localeCompare(right.name));
  }

  private async createScript(body: unknown): Promise<DevScriptApiResponse> {
    if (!isRecord(body) || Object.keys(body).length !== 2 || !safeName(body.name) || typeof body.source !== 'string') {
      throw new ApiError(400, 'Create requires a safe .ts name and source text.');
    }
    this.checkSourceSize(body.source);
    await mkdir(this.scriptsDirectory, { recursive: true });
    const target = await this.safeFile(body.name, false);
    let handle;
    try {
      handle = await open(target, 'wx', 0o600);
      await handle.writeFile(body.source, 'utf8');
    } catch (error) {
      if (isRecord(error) && error.code === 'EEXIST') throw new ApiError(409, 'That server script already exists.');
      throw error;
    } finally {
      await handle?.close();
    }
    this.onScriptChanged(body.name);
    return { status: 201, body: { name: body.name, source: body.source } };
  }

  private async updateScript(name: string, body: unknown): Promise<DevScriptApiResponse> {
    if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.source !== 'string') {
      throw new ApiError(400, 'Update requires source text.');
    }
    this.checkSourceSize(body.source);
    const target = await this.safeFile(name, true);
    const temporary = path.join(this.scriptsDirectory, `.save-${randomUUID()}.stage.tmp`);
    try {
      await writeFile(temporary, body.source, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    this.onScriptChanged(name);
    return { status: 200, body: { name, saved: true } };
  }

  private async renameScript(name: string, body: unknown): Promise<DevScriptApiResponse> {
    if (!isRecord(body) || Object.keys(body).length !== 1 || !safeName(body.name)) {
      throw new ApiError(400, 'Rename requires a safe .ts target name.');
    }
    if (name === 'rules.ts') throw new ApiError(409, 'The active rules.ts entrypoint cannot be renamed.');
    const source = await this.safeFile(name, true);
    const destination = await this.safeFile(body.name, false);
    try {
      await rename(source, destination);
    } catch (error) {
      if (isRecord(error) && error.code === 'EEXIST') throw new ApiError(409, 'That server script already exists.');
      throw error;
    }
    this.onScriptChanged(body.name);
    return { status: 200, body: { name: body.name, renamed: true } };
  }

  private async deleteScript(name: string): Promise<DevScriptApiResponse> {
    if (name === 'rules.ts') throw new ApiError(409, 'The active rules.ts entrypoint cannot be deleted.');
    const target = await this.safeFile(name, true);
    await unlink(target);
    this.onScriptChanged(name);
    return { status: 200, body: { name, deleted: true } };
  }

  private async safeFile(name: string, mustExist: boolean): Promise<string> {
    if (!safeName(name)) throw new ApiError(400, 'Use one safe .ts filename.');
    await mkdir(this.scriptsDirectory, { recursive: true });
    const root = await realpath(this.scriptsDirectory);
    const target = path.join(root, name);
    if (!withinDirectory(root, target)) throw new ApiError(400, 'Script path escapes server/scripts.');
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() || !info.isFile()) throw new ApiError(400, 'Script target must be a regular file, not a symlink.');
      if (!mustExist) throw new ApiError(409, 'That server script already exists.');
      const resolved = await realpath(target);
      if (!withinDirectory(root, resolved)) throw new ApiError(400, 'Script path escapes server/scripts.');
      return target;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (isMissing(error) && !mustExist) return target;
      if (isMissing(error)) throw new ApiError(404, 'Server script not found.');
      throw error;
    }
  }

  private checkSourceSize(source: string): void {
    if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
      throw new ApiError(413, 'Server script exceeds the 64 KiB limit.');
    }
  }

  private async handleHttpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(request);
      const result = await this.handle({
        method: request.method ?? 'GET',
        path: request.url ?? '/',
        body,
      });
      response.writeHead(result.status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 400;
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request.' }));
    }
  }

  private async readRequestBody(request: IncomingMessage): Promise<unknown> {
    const lengthHeader = request.headers['content-length'];
    if (lengthHeader !== undefined && Number(lengthHeader) > MAX_REQUEST_BYTES) {
      throw new ApiError(413, 'Request body is too large.');
    }
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.byteLength;
      if (length > MAX_REQUEST_BYTES) throw new ApiError(413, 'Request body is too large.');
      chunks.push(bytes);
    }
    if (length === 0) return undefined;
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (_error) {
      throw new ApiError(400, 'Request body must be valid JSON.');
    }
  }
}
