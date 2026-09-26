import { getGameContext } from '../core/context';
import type { ContextResource, ContextFrameService, GameContext } from '../core/context';
import type { Game } from '../core/game';

/** Colyseus Native SDK operations stay behind a game-owned polling service. */
declare function bloom_colyseus_client_create(url: string): number;
declare function bloom_colyseus_client_join(client: number, method: number, target: string, options: string): number;
declare function bloom_colyseus_client_dispose(client: number): void;
declare function bloom_colyseus_poll(): void;
declare function bloom_colyseus_next_event(): string;
declare function bloom_colyseus_room_send(room: number, type: string, payload: string): void;
declare function bloom_colyseus_room_send_bytes(room: number, type: string, bytes: string): void;
declare function bloom_colyseus_room_request(room: number, type: string, payload: string): number;
declare function bloom_colyseus_room_cancel_request(room: number, request: number): void;
declare function bloom_colyseus_room_leave(room: number, consented: number): void;
declare function bloom_colyseus_room_is_connected(room: number): number;
declare function bloom_colyseus_room_is_reconnecting(room: number): number;
declare function bloom_colyseus_room_id(room: number): string;
declare function bloom_colyseus_room_session_id(room: number): string;
declare function bloom_colyseus_room_reconnection_token(room: number): string;

export interface RoomRequestOptions { timeout?: number; }
export interface ColyseusError extends Error { code?: number; reason?: unknown; }

/** Join callbacks delivered while the owning Game polls native network events. */
export interface RoomJoinCallbacks<TState = any> {
  onJoin(room: Room<TState>): void;
  onError(error: ColyseusError): void;
}

interface NativeRoomEvent {
  kind: string; room: number; roomId?: string; sessionId?: string; reconnectionToken?: string;
  state?: unknown; type?: string; data?: unknown; request?: number; outcome?: number;
  code?: number; message?: string; reason?: string;
}

interface PendingJoin {
  room: Room;
  resolve?: (room: Room) => void;
  reject?: (error: Error) => void;
  onJoin?: (room: Room) => void;
  onError?: (error: ColyseusError) => void;
}
interface MessageListener { type: string; callback: (message: any) => void; }
interface PendingRequest { id: number; deadline: number; resolve: (value: any) => void; reject: (error: Error) => void; }

class NativeRoomHandle { constructor(readonly value: number) {} }
const COLYSEUS_RUNTIME_SLOT = {};

class ColyseusRuntime implements ContextFrameService {
  private clients: ColyseusClient[] = [];
  private disposed = false;

  constructor(private readonly context: GameContext) {
    context.registerFrameService(this);
  }

  add(client: ColyseusClient): void {
    if (this.clients.indexOf(client) < 0) this.clients.push(client);
  }

  remove(client: ColyseusClient): void {
    const index = this.clients.indexOf(client);
    if (index >= 0) this.clients.splice(index, 1);
    if (this.clients.length === 0) this.dispose();
  }

  updateFrame(_deltaTime: number): void {
    if (this.disposed || this.clients.length === 0 || !this.context.isReady) return;
    bloom_colyseus_poll();
    for (let count = 0; count < 4096; count++) {
      const encoded = bloom_colyseus_next_event();
      if (encoded.length === 0) break;
      let event: NativeRoomEvent;
      try { event = JSON.parse(encoded) as NativeRoomEvent; }
      catch (_error) { continue; }
      for (let index = 0; index < this.clients.length; index++) {
        if (this.clients[index]._handleEvent(event)) break;
      }
    }
    const now = Date.now();
    for (const client of this.clients) client._checkRequestTimeouts(now);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const clients = this.clients.slice();
    this.clients.length = 0;
    for (const client of clients) client._disposeFromRuntime();
    this.context.unregisterFrameService(this);
    this.context.removeService(COLYSEUS_RUNTIME_SLOT, this);
  }
}

/** Client for a Colyseus server, polled automatically by the owning Game. */
export class ColyseusClient implements ContextResource {
  private readonly context: GameContext;
  private runtime: ColyseusRuntime | null = null;
  private handleValue = 0;
  private errorValue: string | null = null;
  private rooms: Room[] = [];
  private pendingJoins: PendingJoin[] = [];
  private disposed = false;

  constructor(owner: Game, readonly endpoint: string) {
    this.context = getGameContext(owner);
    if (!this.context.isReady || this.context.isDisposed) {
      this.errorValue = 'ColyseusClient requires a ready Game.';
      return;
    }

    const runtime = this.context.getOrCreateService(COLYSEUS_RUNTIME_SLOT, () => new ColyseusRuntime(this.context));
    this.runtime = runtime;
    this.handleValue = bloom_colyseus_client_create(endpoint);
    if (this.handleValue === 0) {
      this.errorValue = 'Unable to create Colyseus client for this platform or URL.';
      runtime.remove(this);
      this.runtime = null;
      return;
    }
    if (!this.context.register(this)) {
      bloom_colyseus_client_dispose(this.handleValue);
      this.handleValue = 0;
      this.errorValue = 'Unable to register Colyseus client with the owning Game.';
      runtime.remove(this);
      this.runtime = null;
      return;
    }
    runtime.add(this);
  }

  get isLoaded(): boolean { return !this.disposed && this.context.isReady && !this.context.isDisposed && this.context.owns(this) && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }
  get error(): string | null { return this.errorValue; }

  joinOrCreate<TState = any>(roomName: string, options: object = {}): Promise<Room<TState>> { return this.startJoin<TState>(0, roomName, options); }
  create<TState = any>(roomName: string, options: object = {}): Promise<Room<TState>> { return this.startJoin<TState>(1, roomName, options); }
  join<TState = any>(roomName: string, options: object = {}): Promise<Room<TState>> { return this.startJoin<TState>(2, roomName, options); }
  joinById<TState = any>(roomId: string, options: object = {}): Promise<Room<TState>> { return this.startJoin<TState>(3, roomId, options); }
  reconnect<TState = any>(token: string): Promise<Room<TState>> { return this.startJoin<TState>(4, token, {}); }

  /**
   * Start matchmaking and deliver the result from the owning Game's frame
   * polling. This callback form is suitable for Perry's native blocking loop.
   */
  joinOrCreateWithCallbacks<TState = any>(
    roomName: string,
    options: object,
    callbacks: RoomJoinCallbacks<TState>,
  ): boolean {
    return this.startJoinWithCallbacks<TState>(0, roomName, options, callbacks);
  }

  createWithCallbacks<TState = any>(
    roomName: string,
    options: object,
    callbacks: RoomJoinCallbacks<TState>,
  ): boolean {
    return this.startJoinWithCallbacks<TState>(1, roomName, options, callbacks);
  }

  joinWithCallbacks<TState = any>(
    roomName: string,
    options: object,
    callbacks: RoomJoinCallbacks<TState>,
  ): boolean {
    return this.startJoinWithCallbacks<TState>(2, roomName, options, callbacks);
  }

  joinByIdWithCallbacks<TState = any>(
    roomId: string,
    options: object,
    callbacks: RoomJoinCallbacks<TState>,
  ): boolean {
    return this.startJoinWithCallbacks<TState>(3, roomId, options, callbacks);
  }

  reconnectWithCallbacks<TState = any>(
    token: string,
    callbacks: RoomJoinCallbacks<TState>,
  ): boolean {
    return this.startJoinWithCallbacks<TState>(4, token, {}, callbacks);
  }

  /** Process queued native callbacks immediately when driving a custom frame loop. */
  poll(): void {
    const runtime = this.runtime;
    if (this.isLoaded && runtime !== null) runtime.updateFrame(0);
  }

  dispose(): void { this.disposeInternal(true); }

  private startJoin<TState>(method: number, target: string, options: object): Promise<Room<TState>> {
    if (!this.isLoaded) return Promise.reject(new Error(this.errorValue || 'Colyseus client has been disposed.'));
    const optionsJson = JSON.stringify(options);
    return new Promise<Room<TState>>((resolve, reject) => {
      const nativeHandle = bloom_colyseus_client_join(this.handleValue, method, target,
        optionsJson === undefined ? '{}' : optionsJson);
      if (nativeHandle === 0) { reject(new Error('Unable to start Colyseus matchmaking')); return; }
      const room = new Room<TState>(new NativeRoomHandle(nativeHandle), this);
      this.rooms.push(room);
      this.pendingJoins.push({ room, resolve: (joined) => resolve(joined as Room<TState>), reject });
    });
  }

  private startJoinWithCallbacks<TState>(
    method: number,
    target: string,
    options: object,
    callbacks: RoomJoinCallbacks<TState>,
  ): boolean {
    if (!this.isLoaded) {
      callbacks.onError(new Error(this.errorValue || 'Colyseus client has been disposed.') as ColyseusError);
      return false;
    }

    const optionsJson = JSON.stringify(options);
    const nativeHandle = bloom_colyseus_client_join(this.handleValue, method, target,
      optionsJson === undefined ? '{}' : optionsJson);
    if (nativeHandle === 0) {
      callbacks.onError(new Error('Unable to start Colyseus matchmaking') as ColyseusError);
      return false;
    }

    const room = new Room<TState>(new NativeRoomHandle(nativeHandle), this);
    this.rooms.push(room);
    this.pendingJoins.push({
      room,
      onJoin: (joined) => callbacks.onJoin(joined as Room<TState>),
      onError: callbacks.onError,
    });
    return true;
  }

  _handleEvent(event: NativeRoomEvent): boolean {
    const room = this.rooms.find((candidate) => candidate._matchesNativeHandle(event.room)) || null;
    if (event.kind === 'clientError' || room === null) return false;
    if (event.kind === 'join') {
      room._setJoined(event);
      const index = this.pendingJoins.findIndex((pending) => pending.room === room);
      if (index >= 0) {
        const pending = this.pendingJoins[index];
        this.pendingJoins.splice(index, 1);
        if (pending.onJoin !== undefined) pending.onJoin(room);
        else pending.resolve?.(room);
      }
      return true;
    }
    if (event.kind === 'error') {
      const index = this.pendingJoins.findIndex((pending) => pending.room === room);
      const error = new Error(event.message || 'Colyseus connection failed') as ColyseusError;
      error.code = event.code;
      if (index >= 0) {
        const pending = this.pendingJoins[index];
        this.pendingJoins.splice(index, 1);
        if (pending.onError !== undefined) pending.onError(error);
        else pending.reject?.(error);
      }
      else room._emitError(error);
      return true;
    }
    room._handleEvent(event);
    return true;
  }

  _checkRequestTimeouts(now: number): void { for (const room of this.rooms) room._checkRequestTimeouts(now); }
  _disposeFromRuntime(): void { this.disposeInternal(false); }

  private disposeInternal(removeFromRuntime: boolean): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.pendingJoins) {
      const error = new Error('Colyseus client was disposed.') as ColyseusError;
      if (pending.onError !== undefined) pending.onError(error);
      else pending.reject?.(error);
    }
    this.pendingJoins = [];
    for (const room of this.rooms) room._dispose();
    this.rooms = [];
    if (this.handleValue !== 0) bloom_colyseus_client_dispose(this.handleValue);
    this.handleValue = 0;
    this.context.unregister(this);
    if (removeFromRuntime && this.runtime !== null) this.runtime.remove(this);
  }
}

/** A live Colyseus room connection. */
export class Room<TState = any> {
  private roomIdValue = '';
  private sessionIdValue = '';
  private reconnectionTokenValue = '';
  state: TState | null = null;

  private readonly handle: NativeRoomHandle;
  private client: ColyseusClient;
  private connected = false;
  private messageListeners: MessageListener[] = [];
  private anyMessageListeners: Array<(type: string | number, message: any) => void> = [];
  private stateListeners: Array<(state: TState) => void> = [];
  private dropListeners: Array<(code: number, reason: string) => void> = [];
  private reconnectListeners: Array<() => void> = [];
  private leaveListeners: Array<(code: number, reason: string) => void> = [];
  private disposed = false;
  private errorListeners: Array<(error: ColyseusError) => void> = [];
  private pendingRequests: PendingRequest[] = [];
  private nextRequestId = 1;

  constructor(handle: NativeRoomHandle, client: ColyseusClient) {
    this.handle = handle;
    this.client = client;
  }

  get roomId(): string { return this.roomIdValue; }

  get sessionId(): string { return this.sessionIdValue; }

  get reconnectionToken(): string { return this.reconnectionTokenValue; }

  get isLoaded(): boolean { return !this.disposed && this.client.isLoaded; }

  get isConnected(): boolean {
    return this.isLoaded && this.connected && bloom_colyseus_room_is_connected(this.handle.value) !== 0;
  }

  get reconnectionPending(): boolean {
    return this.isLoaded && bloom_colyseus_room_is_reconnecting(this.handle.value) !== 0;
  }

  onMessage<T = any>(type: string | number, callback: (message: T) => void): () => void {
    if (!this.isLoaded) return () => {};
    const listener = { type: String(type), callback: callback as (message: any) => void };
    this.messageListeners.push(listener);
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index >= 0) this.messageListeners.splice(index, 1);
    };
  }

  onMessageAny(callback: (type: string | number, message: any) => void): () => void {
    if (!this.isLoaded) return () => {};
    this.anyMessageListeners.push(callback);
    return () => {
      const index = this.anyMessageListeners.indexOf(callback);
      if (index >= 0) this.anyMessageListeners.splice(index, 1);
    };
  }

  onStateChange(callback: (state: TState) => void): () => void {
    if (!this.isLoaded) return () => {};
    this.stateListeners.push(callback);
    return () => {
      const index = this.stateListeners.indexOf(callback);
      if (index >= 0) this.stateListeners.splice(index, 1);
    };
  }

  onDrop(callback: (code: number, reason: string) => void): () => void {
    if (!this.isLoaded) return () => {};
    this.dropListeners.push(callback);
    return () => {
      const index = this.dropListeners.indexOf(callback);
      if (index >= 0) this.dropListeners.splice(index, 1);
    };
  }

  onReconnect(callback: () => void): () => void {
    if (!this.isLoaded) return () => {};
    this.reconnectListeners.push(callback);
    return () => {
      const index = this.reconnectListeners.indexOf(callback);
      if (index >= 0) this.reconnectListeners.splice(index, 1);
    };
  }

  onLeave(callback: (code: number, reason: string) => void): () => void {
    if (!this.isLoaded) return () => {};
    this.leaveListeners.push(callback);
    return () => {
      const index = this.leaveListeners.indexOf(callback);
      if (index >= 0) this.leaveListeners.splice(index, 1);
    };
  }

  onError(callback: (error: ColyseusError) => void): () => void {
    if (!this.isLoaded) return () => {};
    this.errorListeners.push(callback);
    return () => {
      const index = this.errorListeners.indexOf(callback);
      if (index >= 0) this.errorListeners.splice(index, 1);
    };
  }

  /** Send a MsgPack-encoded Colyseus room message. */
  send(type: string | number, message: unknown = null): void {
    if (!this.isConnected) return;
    const payload: string = JSON.stringify(message) ?? 'null';
    const messageType: string = typeof type === 'number' ? `i${type}` : String(type);
    bloom_colyseus_room_send(this.handle.value, messageType, payload);
  }

  /** Send raw bytes through Colyseus' ROOM_DATA_BYTES protocol. */
  sendBytes(type: string | number, bytes: number[] | Uint8Array): void {
    if (!this.isConnected) return;
    const values: number[] = Array.from(bytes);
    const messageType: string = typeof type === 'number' ? `i${type}` : String(type);
    const payload: string = JSON.stringify(values) ?? '[]';
    bloom_colyseus_room_send_bytes(this.handle.value, messageType, payload);
  }

  /** Send a message and resolve with the value returned by the server handler. */
  request<T = any>(type: string, message: unknown = null, options: RoomRequestOptions = {}): Promise<T> {
    const payload: string = JSON.stringify(message) ?? 'null';
    if (!this.isConnected) return Promise.reject(new Error('Colyseus room is not connected.'));
    const timeout = options.timeout === undefined ? 10_000 : Math.max(0, options.timeout);
    return new Promise<T>((resolve, reject) => {
      const requestId = bloom_colyseus_room_request(
        this.handle.value,
        type,
        payload,
      );
      if (requestId === 0) {
        reject(new Error('Unable to send Colyseus request'));
        return;
      }
      this.pendingRequests.push({
        id: requestId,
        deadline: Date.now() + timeout,
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
  }

  /** Leave this room. */
  leave(consented = true): Promise<void> {
    if (!this.isConnected) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.leaveListeners.push(() => resolve());
      bloom_colyseus_room_leave(this.handle.value, consented ? 1 : 0);
      this.client.poll();
    });
  }

  /** Poll network callbacks manually when not using the engine's frame loop. */
  poll(): void {
    if (this.isLoaded) this.client.poll();
  }

  _matchesNativeHandle(handle: number): boolean { return this.handle.value === handle; }

  _setJoined(event: NativeRoomEvent): void {
    this.roomIdValue = event.roomId || bloom_colyseus_room_id(this.handle.value);
    this.sessionIdValue = event.sessionId || bloom_colyseus_room_session_id(this.handle.value);
    this.reconnectionTokenValue = event.reconnectionToken || bloom_colyseus_room_reconnection_token(this.handle.value);
    this.connected = true;
    if (event.state !== undefined && event.state !== null) {
      this.state = event.state as TState;
      this._emitState();
    }
  }

  _handleEvent(event: NativeRoomEvent): void {
    if (event.kind === 'state') {
      this.state = event.state as TState;
      this._emitState();
    } else if (event.kind === 'message') {
      const type = this._normalizeMessageType(event.type || '');
      for (let index = 0; index < this.messageListeners.length; index++) {
        if (this.messageListeners[index].type === String(type)) this.messageListeners[index].callback(event.data);
      }
      for (let index = 0; index < this.anyMessageListeners.length; index++) this.anyMessageListeners[index](type, event.data);
    } else if (event.kind === 'drop') {
      this.connected = false;
      for (let index = 0; index < this.dropListeners.length; index++) this.dropListeners[index](event.code || 0, event.reason || '');
    } else if (event.kind === 'reconnect') {
      this.connected = true;
      for (let index = 0; index < this.reconnectListeners.length; index++) this.reconnectListeners[index]();
    } else if (event.kind === 'leave') {
      this.connected = false;
      for (let index = 0; index < this.leaveListeners.length; index++) this.leaveListeners[index](event.code || 0, event.reason || '');
      this.leaveListeners = [];
    } else if (event.kind === 'request') {
      this._settleRequest(event);
    }
  }

  _emitError(error: ColyseusError): void {
    for (let index = 0; index < this.errorListeners.length; index++) this.errorListeners[index](error);
  }

  _checkRequestTimeouts(now: number): void {
    for (let index = this.pendingRequests.length - 1; index >= 0; index--) {
      const request = this.pendingRequests[index];
      if (request.deadline > now) continue;
      this.pendingRequests.splice(index, 1);
      bloom_colyseus_room_cancel_request(this.handle.value, request.id);
      request.reject(new Error('Colyseus request timed out'));
    }
  }

  _dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.connected = false;
    for (let index = 0; index < this.pendingRequests.length; index++) {
      bloom_colyseus_room_cancel_request(this.handle.value, this.pendingRequests[index].id);
      this.pendingRequests[index].reject(new Error('Colyseus room was disposed'));
    }
    this.pendingRequests = [];
    for (const listener of this.leaveListeners) listener(0, 'Room disposed.');
    this.leaveListeners = [];
    this.messageListeners = [];
    this.anyMessageListeners = [];
    this.stateListeners = [];
    this.dropListeners = [];
    this.reconnectListeners = [];
    this.errorListeners = [];
  }

  private _emitState(): void {
    if (this.state === null) return;
    for (let index = 0; index < this.stateListeners.length; index++) this.stateListeners[index](this.state);
  }

  private _normalizeMessageType(type: string): string | number {
    if (type.length > 1 && type.charAt(0) === 'i') {
      const numeric = parseInt(type.slice(1), 10);
      if (!isNaN(numeric)) return numeric;
    }
    return type;
  }

  private _settleRequest(event: NativeRoomEvent): void {
    const index = this.pendingRequests.findIndex((request) => request.id === event.request);
    if (index < 0) return;
    const pending = this.pendingRequests[index];
    this.pendingRequests.splice(index, 1);
    if (event.outcome === 0) {
      pending.resolve(event.data);
      return;
    }
    const error = new Error(event.reason || 'Colyseus request failed') as ColyseusError;
    if (event.outcome === 1) {
      error.name = 'rejected';
      error.reason = event.data;
    }
    pending.reject(error);
  }
}
