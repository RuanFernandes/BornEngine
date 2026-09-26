/**
 * Colyseus multiplayer client backed by the official Colyseus Native SDK.
 * Native callbacks are delivered by poll(), which beginDrawing() invokes
 * automatically while the engine game loop is running.
 */

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

export interface RoomRequestOptions {
  timeout?: number;
}

export interface ColyseusError extends Error {
  code?: number;
  reason?: unknown;
}

interface NativeRoomEvent {
  kind: string;
  room: number;
  roomId?: string;
  sessionId?: string;
  reconnectionToken?: string;
  state?: unknown;
  type?: string;
  data?: unknown;
  request?: number;
  outcome?: number;
  code?: number;
  message?: string;
  reason?: string;
}

interface PendingJoin {
  room: Room;
  resolve: (room: Room) => void;
  reject: (error: Error) => void;
}

interface MessageListener {
  type: string;
  callback: (message: any) => void;
}

interface PendingRequest {
  id: number;
  deadline: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/** Client for a Colyseus server. */
export class ColyseusClient {
  private static clients: ColyseusClient[] = [];
  private handle: number;
  private rooms: Room[] = [];
  private pendingJoins: PendingJoin[] = [];
  private disposed = false;

  constructor(endpoint: string) {
    this.handle = bloom_colyseus_client_create(endpoint);
    if (this.handle === 0) {
      throw new Error('Unable to create Colyseus client for this platform or URL');
    }
    ColyseusClient.clients.push(this);
  }

  /** Join an existing room or create one when none is available. */
  joinOrCreate<TState = any>(roomName: string, options: object = {}): Promise<Room<TState>> {
    return this.startJoin<TState>(0, roomName, options);
  }

  /** Always create a room with the given name. */
  create<TState = any>(roomName: string, options: object = {}): Promise<Room<TState>> {
    return this.startJoin<TState>(1, roomName, options);
  }

  /** Join an existing room with the given name. */
  join<TState = any>(roomName: string, options: object = {}): Promise<Room<TState>> {
    return this.startJoin<TState>(2, roomName, options);
  }

  /** Join a room by its server-assigned id. */
  joinById<TState = any>(roomId: string, options: object = {}): Promise<Room<TState>> {
    return this.startJoin<TState>(3, roomId, options);
  }

  /** Reconnect using a token previously returned by Room.reconnectionToken. */
  reconnect<TState = any>(reconnectionToken: string): Promise<Room<TState>> {
    return this.startJoin<TState>(4, reconnectionToken, {});
  }

  /**
   * Process Colyseus network callbacks. beginDrawing() calls this for every
   * client automatically; call it directly when driving a custom game loop.
   */
  poll(): void {
    ColyseusClient.pumpAll();
  }

  /** Release this client and its rooms. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    bloom_colyseus_client_dispose(this.handle);
    for (let index = 0; index < this.pendingJoins.length; index++) {
      this.pendingJoins[index].reject(new Error('Colyseus client was disposed'));
    }
    this.pendingJoins = [];
    for (let index = 0; index < this.rooms.length; index++) this.rooms[index]._dispose();
    this.rooms = [];
    const index = ColyseusClient.clients.indexOf(this);
    if (index >= 0) ColyseusClient.clients.splice(index, 1);
  }

  private startJoin<TState>(method: number, target: string, options: object): Promise<Room<TState>> {
    if (this.disposed) return Promise.reject(new Error('Colyseus client has been disposed'));
    const optionsJson = JSON.stringify(options);
    return new Promise<Room<TState>>((resolve, reject) => {
      const handle = bloom_colyseus_client_join(
        this.handle,
        method,
        target,
        optionsJson === undefined ? '{}' : optionsJson,
      );
      if (handle === 0) {
        reject(new Error('Unable to start Colyseus matchmaking'));
        return;
      }
      const room = new Room<TState>(handle, this);
      this.rooms.push(room);
      this.pendingJoins.push({
        room,
        resolve: (joined) => resolve(joined as Room<TState>),
        reject,
      });
    });
  }

  static pumpAll(): void {
    if (ColyseusClient.clients.length === 0) return;
    bloom_colyseus_poll();
    for (let count = 0; count < 4096; count++) {
      const encoded = bloom_colyseus_next_event();
      if (encoded.length === 0) break;
      let event: NativeRoomEvent;
      try {
        event = JSON.parse(encoded) as NativeRoomEvent;
      } catch (_error) {
        continue;
      }
      for (let clientIndex = 0; clientIndex < ColyseusClient.clients.length; clientIndex++) {
        if (ColyseusClient.clients[clientIndex]._handleEvent(event)) break;
      }
    }
    const now = Date.now();
    for (let clientIndex = 0; clientIndex < ColyseusClient.clients.length; clientIndex++) {
      const rooms = ColyseusClient.clients[clientIndex].rooms;
      for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) rooms[roomIndex]._checkRequestTimeouts(now);
    }
  }

  private _handleEvent(event: NativeRoomEvent): boolean {
    const room = this._findRoom(event.room);
    if (event.kind === 'clientError') return false;
    if (room === null) return false;

    if (event.kind === 'join') {
      room._setJoined(event);
      const index = this.pendingJoins.findIndex((pending) => pending.room === room);
      if (index >= 0) {
        const pending = this.pendingJoins[index];
        this.pendingJoins.splice(index, 1);
        pending.resolve(room);
      }
      return true;
    }
    if (event.kind === 'error') {
      const joinIndex = this.pendingJoins.findIndex((pending) => pending.room === room);
      const error = new Error(event.message || 'Colyseus connection failed') as ColyseusError;
      error.code = event.code;
      if (joinIndex >= 0) {
        const pending = this.pendingJoins[joinIndex];
        this.pendingJoins.splice(joinIndex, 1);
        pending.reject(error);
      } else {
        room._emitError(error);
      }
      return true;
    }
    room._handleEvent(event);
    return true;
  }

  private _findRoom(handle: number): Room | null {
    for (let index = 0; index < this.rooms.length; index++) {
      if (this.rooms[index]._handle() === handle) return this.rooms[index];
    }
    return null;
  }
}

/** A live Colyseus room connection. */
export class Room<TState = any> {
  private roomIdValue = '';
  private sessionIdValue = '';
  private reconnectionTokenValue = '';
  state: TState | null = null;

  private handle: number;
  private client: ColyseusClient;
  private connected = false;
  private messageListeners: MessageListener[] = [];
  private anyMessageListeners: Array<(type: string | number, message: any) => void> = [];
  private stateListeners: Array<(state: TState) => void> = [];
  private dropListeners: Array<(code: number, reason: string) => void> = [];
  private reconnectListeners: Array<() => void> = [];
  private leaveListeners: Array<(code: number, reason: string) => void> = [];
  private errorListeners: Array<(error: ColyseusError) => void> = [];
  private pendingRequests: PendingRequest[] = [];
  private nextRequestId = 1;

  constructor(handle: number, client: ColyseusClient) {
    this.handle = handle;
    this.client = client;
  }

  get roomId(): string { return this.roomIdValue; }

  get sessionId(): string { return this.sessionIdValue; }

  get reconnectionToken(): string { return this.reconnectionTokenValue; }

  get isConnected(): boolean {
    return this.connected && bloom_colyseus_room_is_connected(this.handle) !== 0;
  }

  get reconnectionPending(): boolean {
    return bloom_colyseus_room_is_reconnecting(this.handle) !== 0;
  }

  onMessage<T = any>(type: string | number, callback: (message: T) => void): () => void {
    const listener = { type: String(type), callback: callback as (message: any) => void };
    this.messageListeners.push(listener);
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index >= 0) this.messageListeners.splice(index, 1);
    };
  }

  onMessageAny(callback: (type: string | number, message: any) => void): () => void {
    this.anyMessageListeners.push(callback);
    return () => {
      const index = this.anyMessageListeners.indexOf(callback);
      if (index >= 0) this.anyMessageListeners.splice(index, 1);
    };
  }

  onStateChange(callback: (state: TState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      const index = this.stateListeners.indexOf(callback);
      if (index >= 0) this.stateListeners.splice(index, 1);
    };
  }

  onDrop(callback: (code: number, reason: string) => void): () => void {
    this.dropListeners.push(callback);
    return () => {
      const index = this.dropListeners.indexOf(callback);
      if (index >= 0) this.dropListeners.splice(index, 1);
    };
  }

  onReconnect(callback: () => void): () => void {
    this.reconnectListeners.push(callback);
    return () => {
      const index = this.reconnectListeners.indexOf(callback);
      if (index >= 0) this.reconnectListeners.splice(index, 1);
    };
  }

  onLeave(callback: (code: number, reason: string) => void): () => void {
    this.leaveListeners.push(callback);
    return () => {
      const index = this.leaveListeners.indexOf(callback);
      if (index >= 0) this.leaveListeners.splice(index, 1);
    };
  }

  onError(callback: (error: ColyseusError) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      const index = this.errorListeners.indexOf(callback);
      if (index >= 0) this.errorListeners.splice(index, 1);
    };
  }

  /** Send a MsgPack-encoded Colyseus room message. */
  send(type: string | number, message: unknown = null): void {
    const payload: string = JSON.stringify(message) ?? 'null';
    const messageType: string = typeof type === 'number' ? `i${type}` : String(type);
    bloom_colyseus_room_send(this.handle, messageType, payload);
  }

  /** Send raw bytes through Colyseus' ROOM_DATA_BYTES protocol. */
  sendBytes(type: string | number, bytes: number[] | Uint8Array): void {
    const values: number[] = Array.from(bytes);
    const messageType: string = typeof type === 'number' ? `i${type}` : String(type);
    const payload: string = JSON.stringify(values) ?? '[]';
    bloom_colyseus_room_send_bytes(this.handle, messageType, payload);
  }

  /** Send a message and resolve with the value returned by the server handler. */
  request<T = any>(type: string, message: unknown = null, options: RoomRequestOptions = {}): Promise<T> {
    const payload: string = JSON.stringify(message) ?? 'null';
    const timeout = options.timeout === undefined ? 10_000 : Math.max(0, options.timeout);
    return new Promise<T>((resolve, reject) => {
      const requestId = bloom_colyseus_room_request(
        this.handle,
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
    if (!this.connected) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.leaveListeners.push(() => resolve());
      bloom_colyseus_room_leave(this.handle, consented ? 1 : 0);
      this.client.poll();
    });
  }

  /** Poll network callbacks manually when not using the engine's frame loop. */
  poll(): void {
    this.client.poll();
  }

  _handle(): number { return this.handle; }

  _setJoined(event: NativeRoomEvent): void {
    this.roomIdValue = event.roomId || bloom_colyseus_room_id(this.handle);
    this.sessionIdValue = event.sessionId || bloom_colyseus_room_session_id(this.handle);
    this.reconnectionTokenValue = event.reconnectionToken || bloom_colyseus_room_reconnection_token(this.handle);
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
      bloom_colyseus_room_cancel_request(this.handle, request.id);
      request.reject(new Error('Colyseus request timed out'));
    }
  }

  _dispose(): void {
    this.connected = false;
    for (let index = 0; index < this.pendingRequests.length; index++) {
      bloom_colyseus_room_cancel_request(this.handle, this.pendingRequests[index].id);
      this.pendingRequests[index].reject(new Error('Colyseus room was disposed'));
    }
    this.pendingRequests = [];
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

/** Pump all active clients. Called by core.beginDrawing(). */
export function pumpColyseusClients(): void {
  ColyseusClient.pumpAll();
}
