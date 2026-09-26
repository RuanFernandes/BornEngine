const MATCHMAKING_METHODS = [
  'joinOrCreate',
  'create',
  'join',
  'joinById',
  'reconnect',
];

/**
 * Adapt the official Colyseus JavaScript SDK to Perry's bloom_colyseus_* FFI.
 * Handles cross the JS/WASM boundary as numbers; async SDK callbacks are
 * serialized into the same event records consumed by the native facade.
 */
export function createColyseusBridge({ Client }) {
  if (typeof Client !== 'function') throw new TypeError('Colyseus Client constructor is required');

  let nextHandle = 1;
  const clients = new Map();
  const rooms = new Map();
  const pendingJoins = new Map();
  const events = [];

  const allocateHandle = () => {
    const handle = nextHandle;
    nextHandle = nextHandle >= Number.MAX_SAFE_INTEGER ? 1 : nextHandle + 1;
    return handle;
  };
  const enqueue = (event) => events.push(event);
  const encode = (value) => {
    try { return JSON.stringify(value); } catch { return ''; }
  };
  const snapshot = (state) => {
    if (state === undefined || state === null) return null;
    try {
      const encoded = JSON.stringify(state);
      return encoded === undefined ? null : JSON.parse(encoded);
    } catch {
      try {
        if (typeof state.toJSON === 'function') return state.toJSON();
      } catch { /* Preserve the callback instead of breaking FFI polling. */ }
      return null;
    }
  };
  const decodeJson = (text, label) => {
    try { return JSON.parse(text === '' ? 'null' : text); }
    catch (error) { throw new Error(`Invalid Colyseus ${label} JSON: ${error.message}`); }
  };
  const decodeMessageType = (type) => {
    const match = /^i(-?\d+)$/.exec(String(type));
    if (!match) return String(type);
    const value = Number(match[1]);
    return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
      ? value
      : String(type);
  };
  const errorMessage = (error, fallback) => error && error.message ? String(error.message) : fallback;

  function attachRoom(clientHandle, roomHandle, room) {
    const record = {
      client: clientHandle,
      room,
      connected: true,
      reconnecting: false,
      requests: new Map(),
      subscriptions: [],
    };
    rooms.set(roomHandle, record);

    const subscribe = (signal, callback) => {
      if (!signal) return;
      const subscription = typeof signal === 'function'
        ? signal(callback)
        : typeof signal.on === 'function' ? signal.on(callback) : null;
      if (typeof subscription === 'function') record.subscriptions.push(subscription);
      else if (subscription && typeof subscription.remove === 'function') {
        record.subscriptions.push(() => subscription.remove());
      }
    };

    subscribe(room.onStateChange, (state) => {
      enqueue({ kind: 'state', room: roomHandle, state: snapshot(state) });
    });
    subscribe(room.onError, (code, message) => {
      enqueue({ kind: 'error', room: roomHandle, code: Number(code) || -1, message: String(message || '') });
    });
    subscribe(room.onLeave, (code, reason) => {
      record.connected = false;
      record.reconnecting = false;
      enqueue({ kind: 'leave', room: roomHandle, code: Number(code) || 0, reason: String(reason || '') });
    });
    subscribe(room.onDrop, (code, reason) => {
      record.connected = false;
      record.reconnecting = true;
      enqueue({ kind: 'drop', room: roomHandle, code: Number(code) || 0, reason: String(reason || '') });
    });
    subscribe(room.onReconnect, () => {
      record.connected = true;
      record.reconnecting = false;
      enqueue({ kind: 'reconnect', room: roomHandle });
    });
    if (typeof room.onMessage === 'function') {
      const unsubscribe = room.onMessage('*', (type, data) => {
        enqueue({ kind: 'message', room: roomHandle, type: typeof type === 'number' ? `i${type}` : String(type), data: snapshot(data) });
      });
      if (typeof unsubscribe === 'function') record.subscriptions.push(unsubscribe);
    }

    enqueue({
      kind: 'join',
      room: roomHandle,
      roomId: String(room.roomId || ''),
      sessionId: String(room.sessionId || ''),
      reconnectionToken: String(room.reconnectionToken || ''),
      state: snapshot(room.state),
    });
  }

  function disposeRoom(roomHandle, record, consented = true) {
    record.connected = false;
    record.reconnecting = false;
    for (const request of record.requests.values()) request.cancelled = true;
    record.requests.clear();
    for (const unsubscribe of record.subscriptions.splice(0)) {
      try { unsubscribe(); } catch { /* Cleanup must continue for other listeners. */ }
    }
    if (typeof record.room.removeAllListeners === 'function') record.room.removeAllListeners();
    try { Promise.resolve(record.room.leave(consented)).catch(() => {}); }
    catch { /* A stale or already-closed connection needs no further cleanup. */ }
    rooms.delete(roomHandle);
  }

  return {
    bloom_colyseus_client_create(endpoint) {
      try {
        const handle = allocateHandle();
        clients.set(handle, { client: new Client(String(endpoint)), disposed: false, rooms: new Set() });
        return handle;
      } catch {
        return 0;
      }
    },

    bloom_colyseus_client_join(clientHandle, method, target, optionsJson) {
      const clientRecord = clients.get(Number(clientHandle));
      const matchmakingMethod = MATCHMAKING_METHODS[Number(method)];
      if (!clientRecord || clientRecord.disposed || !matchmakingMethod) return 0;

      let options;
      try { options = decodeJson(String(optionsJson), 'options'); }
      catch { return 0; }
      const roomHandle = allocateHandle();
      pendingJoins.set(roomHandle, Number(clientHandle));
      clientRecord.rooms.add(roomHandle);

      let matchmaking;
      try {
        matchmaking = Number(method) === 4
          ? clientRecord.client[matchmakingMethod](String(target))
          : clientRecord.client[matchmakingMethod](String(target), options || {});
      } catch (error) {
        pendingJoins.delete(roomHandle);
        clientRecord.rooms.delete(roomHandle);
        enqueue({ kind: 'error', room: roomHandle, code: Number(error.code) || -1, message: errorMessage(error, 'Colyseus matchmaking failed') });
        return roomHandle;
      }

      Promise.resolve(matchmaking).then((room) => {
        pendingJoins.delete(roomHandle);
        if (clientRecord.disposed || clients.get(Number(clientHandle)) !== clientRecord) {
          try { Promise.resolve(room.leave(true)).catch(() => {}); } catch { /* Already closed. */ }
          clientRecord.rooms.delete(roomHandle);
          return;
        }
        attachRoom(Number(clientHandle), roomHandle, room);
      }, (error) => {
        pendingJoins.delete(roomHandle);
        clientRecord.rooms.delete(roomHandle);
        if (clientRecord.disposed) return;
        enqueue({ kind: 'error', room: roomHandle, code: Number(error && error.code) || -1, message: errorMessage(error, 'Colyseus matchmaking failed') });
      });

      return roomHandle;
    },

    bloom_colyseus_client_dispose(clientHandle) {
      const handle = Number(clientHandle);
      const clientRecord = clients.get(handle);
      if (!clientRecord || clientRecord.disposed) return;
      clientRecord.disposed = true;
      for (const roomHandle of [...clientRecord.rooms]) {
        const record = rooms.get(roomHandle);
        if (record) disposeRoom(roomHandle, record, true);
        pendingJoins.delete(roomHandle);
      }
      clientRecord.rooms.clear();
      clients.delete(handle);
    },

    bloom_colyseus_poll() {},

    bloom_colyseus_next_event() {
      const event = events.shift();
      return event === undefined ? '' : encode(event);
    },

    bloom_colyseus_room_send(roomHandle, messageType, payloadJson) {
      const record = rooms.get(Number(roomHandle));
      if (!record) return;
      try {
        record.room.send(decodeMessageType(messageType), decodeJson(String(payloadJson), 'message'));
      } catch (error) {
        enqueue({ kind: 'error', room: Number(roomHandle), code: -1, message: errorMessage(error, 'Unable to send Colyseus message') });
      }
    },

    bloom_colyseus_room_send_bytes(roomHandle, messageType, bytesJson) {
      const record = rooms.get(Number(roomHandle));
      if (!record) return;
      try {
        const bytes = decodeJson(String(bytesJson), 'byte payload');
        if (!Array.isArray(bytes) || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
          throw new Error('sendBytes expects a JSON array of byte values');
        }
        record.room.sendBytes(decodeMessageType(messageType), new Uint8Array(bytes));
      } catch (error) {
        enqueue({ kind: 'error', room: Number(roomHandle), code: -1, message: errorMessage(error, 'Unable to send Colyseus bytes') });
      }
    },

    bloom_colyseus_room_request(roomHandle, messageType, payloadJson) {
      const handle = Number(roomHandle);
      const record = rooms.get(handle);
      if (!record) return 0;
      let payload;
      try { payload = decodeJson(String(payloadJson), 'request'); }
      catch (error) {
        enqueue({ kind: 'error', room: handle, code: -1, message: error.message });
        return 0;
      }
      const requestHandle = allocateHandle();
      const request = { cancelled: false };
      record.requests.set(requestHandle, request);
      let result;
      try { result = record.room.request(decodeMessageType(messageType), payload); }
      catch (error) { result = Promise.reject(error); }
      Promise.resolve(result).then((data) => {
        if (request.cancelled || record.requests.get(requestHandle) !== request) return;
        record.requests.delete(requestHandle);
        enqueue({ kind: 'request', room: handle, request: requestHandle, outcome: 0, data: snapshot(data), reason: '' });
      }, (error) => {
        if (request.cancelled || record.requests.get(requestHandle) !== request) return;
        record.requests.delete(requestHandle);
        const rejected = error && error.name === 'rejected';
        enqueue({
          kind: 'request',
          room: handle,
          request: requestHandle,
          outcome: rejected ? 1 : 2,
          data: rejected ? snapshot(error.reason) : null,
          reason: errorMessage(error, 'Colyseus request failed'),
        });
      });
      return requestHandle;
    },

    bloom_colyseus_room_cancel_request(roomHandle, requestHandle) {
      const record = rooms.get(Number(roomHandle));
      const request = record && record.requests.get(Number(requestHandle));
      if (!request) return;
      request.cancelled = true;
      record.requests.delete(Number(requestHandle));
    },

    bloom_colyseus_room_leave(roomHandle, consented) {
      const record = rooms.get(Number(roomHandle));
      if (!record) return;
      try { Promise.resolve(record.room.leave(Number(consented) !== 0)).catch(() => {}); }
      catch (error) {
        enqueue({ kind: 'error', room: Number(roomHandle), code: -1, message: errorMessage(error, 'Unable to leave Colyseus room') });
      }
    },

    bloom_colyseus_room_is_connected(roomHandle) {
      return rooms.get(Number(roomHandle))?.connected ? 1 : 0;
    },

    bloom_colyseus_room_is_reconnecting(roomHandle) {
      return rooms.get(Number(roomHandle))?.reconnecting ? 1 : 0;
    },

    bloom_colyseus_room_id(roomHandle) { return rooms.get(Number(roomHandle))?.room.roomId || ''; },
    bloom_colyseus_room_session_id(roomHandle) { return rooms.get(Number(roomHandle))?.room.sessionId || ''; },
    bloom_colyseus_room_reconnection_token(roomHandle) { return rooms.get(Number(roomHandle))?.room.reconnectionToken || ''; },
  };
}
