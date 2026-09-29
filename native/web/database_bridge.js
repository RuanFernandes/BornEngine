// Ticketed, non-blocking bridge for the frozen GameDatabase FFI protocol.
const MAX_ITEMS = 1_000_000;
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_DEPTH = 32;

export function createDatabaseBridge({ createWorker }) {
  let worker;
  let stopped = false;
  let failed = false;
  let nextTicket = 1;
  let scratch = [];
  const tickets = new Map();

  function terminal(ticket, status) {
    tickets.set(ticket, { pending: false, status, rows: 0, values: [] });
    return ticket;
  }
  function workerFailure() {
    if (failed) return;
    failed = true;
    for (const [id, result] of tickets) if (result.pending) terminal(id, 10);
    if (worker) {
      worker.removeEventListener?.('message', onMessage);
      worker.removeEventListener?.('error', workerFailure);
      worker.removeEventListener?.('messageerror', workerFailure);
      worker.terminate();
      worker = undefined;
    }
  }
  function onMessage(event) {
    const message = event.data;
    if (!message || !Number.isSafeInteger(message.id)) return;
    const existing = tickets.get(message.id);
    if (!existing?.pending) return;
    if (!Number.isInteger(message.status) || message.status < 0 || message.status > 15 ||
        !Number.isSafeInteger(message.rows) || message.rows < 0 || !Array.isArray(message.values) ||
        message.values.length > MAX_ITEMS || !message.values.every(validResultValue)) {
      terminal(message.id, 10);
      return;
    }
    tickets.set(message.id, { pending: false, status: message.status, rows: message.rows, values: message.values });
  }
  function ensureWorker() {
    if (worker || stopped || failed) return worker;
    try {
      worker = createWorker();
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', workerFailure);
      worker.addEventListener('messageerror', workerFailure);
    } catch { workerFailure(); }
    return worker;
  }
  function parseFrame(argc) {
    if (!Number.isSafeInteger(argc) || argc < 0 || argc > MAX_ITEMS) return null;
    let position = 0;
    let remaining = MAX_ITEMS;
    function take(type) {
      const item = scratch[position++];
      if (!item || item.type !== type) throw Error('invalid scratch item');
      return item.value;
    }
    function size(limit = MAX_ITEMS) {
      const number = take('number');
      if (!Number.isSafeInteger(number) || number < 0 || number > limit) throw Error('invalid size');
      return number;
    }
    function value(depth) {
      if (depth > MAX_DEPTH || --remaining < 0) throw Error('too many values');
      const tag = size();
      if (tag === 0) return null;
      if (tag === 1) {
        const number = take('number');
        if (!Number.isFinite(number)) throw Error('non-finite number');
        return number;
      }
      if (tag === 2) return take('string');
      if (tag === 3) return false;
      if (tag === 4) return true;
      if (tag === 5) {
        const length = size(MAX_BYTES);
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
          const byte = take('byte');
          if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw Error('invalid byte');
          bytes[i] = byte;
        }
        return bytes;
      }
      if (tag === 6) {
        const length = size();
        const array = [];
        for (let i = 0; i < length; i++) array.push(value(depth + 1));
        return array;
      }
      if (tag === 7) {
        const length = size();
        const object = Object.create(null);
        for (let i = 0; i < length; i++) {
          const key = take('string');
          if (Object.hasOwn(object, key)) throw Error('duplicate key');
          object[key] = value(depth + 1);
        }
        return object;
      }
      throw Error('invalid tag');
    }
    try {
      const args = [];
      for (let i = 0; i < argc; i++) args.push(value(0));
      return position === scratch.length ? args : null;
    } catch { return null; }
  }
  const result = (ticket) => tickets.get(ticket);
  const entry = (ticket, index) => result(ticket)?.pending ? undefined : result(ticket)?.values[index];
  const bridge = {
    bloom_database_scratch_reset() { scratch = []; },
    bloom_database_scratch_push_f64(value) { scratch.push({ type: 'number', value }); },
    bloom_database_scratch_push_string(value) { scratch.push({ type: 'string', value }); },
    bloom_database_scratch_push_byte(value) { scratch.push({ type: 'byte', value }); },
    bloom_database_submit(op, handle, argc) {
      const id = nextTicket++;
      const args = parseFrame(argc);
      scratch = [];
      if (!args) return terminal(id, 4);
      if (!Number.isSafeInteger(op) || op < 1 || op > 12) return terminal(id, 9);
      if (!Number.isSafeInteger(handle) || handle < 0) return terminal(id, 5);
      if (stopped || failed || !ensureWorker()) return terminal(id, 10);
      tickets.set(id, { pending: true, status: 10, rows: 0, values: [] });
      try { worker.postMessage({ id, op, handle, args }); }
      catch { workerFailure(); }
      return id;
    },
    bloom_database_poll(ticket) { const item = result(ticket); return item ? (item.pending ? 0 : 1) : -1; },
    bloom_database_status(ticket) { return result(ticket)?.status ?? 10; },
    bloom_database_result_rows(ticket) { return result(ticket)?.rows ?? 0; },
    bloom_database_result_count(ticket) { return result(ticket)?.values.length ?? 0; },
    bloom_database_result_kind(ticket, index) {
      const value = entry(ticket, index);
      if (value === undefined || value === null) return 0;
      if (typeof value === 'number') return 1;
      if (typeof value === 'string') return 2;
      if (value === false) return 3;
      if (value === true) return 4;
      if (value instanceof Uint8Array) return 5;
      return 0;
    },
    bloom_database_result_number(ticket, index) { const value = entry(ticket, index); return typeof value === 'number' ? value : 0; },
    bloom_database_result_string(ticket, index) { const value = entry(ticket, index); return typeof value === 'string' ? value : ''; },
    bloom_database_result_byte_count(ticket, index) { const value = entry(ticket, index); return value instanceof Uint8Array ? value.length : 0; },
    bloom_database_result_byte(ticket, index, offset) {
      const value = entry(ticket, index);
      return value instanceof Uint8Array && Number.isInteger(offset) ? (value[offset] ?? 0) : 0;
    },
    bloom_database_release(ticket) { tickets.delete(ticket); },
    abort(ticket) { if (tickets.get(ticket)?.pending) terminal(ticket, 10); },
    shutdown() {
      stopped = true;
      workerFailure();
    },
    handlePageHide(event) { if (!event?.persisted) bridge.shutdown(); },
  };
  return bridge;
}

function validResultValue(value) {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (value instanceof Uint8Array && value.length <= MAX_BYTES);
}
