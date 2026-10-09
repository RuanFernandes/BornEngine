// Scripted FFI responses exercise GameDatabase's wire decoding and transaction state machine.
// Runs under node: Perry binds the declared bloom_database_* calls to the linked native symbols,
// so these globalThis doubles are only reachable from a JS runtime.
import { columns, defineSchema, defineTable } from '../../src/storage/schema';
import { GameDatabase } from '../../src/storage/game-database';

let failures = 0;
function check(label: string, passed: boolean): void {
  if (passed) console.log('PASS ' + label);
  else { console.error('FAIL ' + label); failures++; }
}

const schema = defineSchema({
  entries: defineTable({ columns: {
    id: columns.integer({ primaryKey: true, autoIncrement: true }),
    title: columns.text({ notNull: true }),
    note: columns.text({ nullable: true }),
  }, indexes: [{ name: 'entries_title_idx', columns: ['title'] }] }),
});

type StubValue = { kind: number; value: number | string | Uint8Array | null };
interface StubResponse { op: number; status: number; values: StubValue[]; rows: number; }
const queued: StubResponse[] = [];
const tickets = new Map<number, StubResponse>();
const calls: number[] = [];
const submitted: Array<{ op: number; handle: number }> = [];
let nextTicket = 1;
function enqueue(op: number, status = 0, values: StubValue[] = [], rows = 0): void {
  queued.push({ op, status, values, rows });
}
function stub(name: string, value: (...args: any[]) => unknown): void {
  (globalThis as any)[name] = value;
}
stub('bloom_database_scratch_reset', () => {});
stub('bloom_database_scratch_push_f64', () => {});
stub('bloom_database_scratch_push_string', () => {});
stub('bloom_database_scratch_push_byte', () => {});
stub('bloom_database_submit', (op: number, handle: number) => {
  calls.push(op);
  submitted.push({ op, handle });
  const index = queued.findIndex((response) => response.op === op);
  const response = index >= 0 ? queued.splice(index, 1)[0] : { op, status: 0, values: [], rows: 0 };
  const ticket = nextTicket++;
  tickets.set(ticket, response);
  return ticket;
});
stub('bloom_database_poll', () => 1);
stub('bloom_database_status', (ticket: number) => tickets.get(ticket)?.status ?? 10);
stub('bloom_database_result_rows', (ticket: number) => tickets.get(ticket)?.rows ?? 0);
stub('bloom_database_result_count', (ticket: number) => tickets.get(ticket)?.values.length ?? 0);
stub('bloom_database_result_kind', (ticket: number, index: number) => tickets.get(ticket)?.values[index]?.kind ?? -1);
stub('bloom_database_result_number', (ticket: number, index: number) => tickets.get(ticket)?.values[index]?.value ?? 0);
stub('bloom_database_result_string', (ticket: number, index: number) => tickets.get(ticket)?.values[index]?.value ?? '');
stub('bloom_database_result_byte_count', (ticket: number, index: number) => (tickets.get(ticket)?.values[index]?.value as Uint8Array)?.length ?? 0);
stub('bloom_database_result_byte', (ticket: number, index: number, offset: number) => (tickets.get(ticket)?.values[index]?.value as Uint8Array)?.[offset] ?? 0);
stub('bloom_database_release', (ticket: number) => { tickets.delete(ticket); });

async function openedDatabase(): Promise<GameDatabase<typeof schema>> {
  enqueue(1, 0, [{ kind: 1, value: 1 }, { kind: 1, value: 0 }]);
  const database = new GameDatabase({ appId: 'org.example.game', name: 'test', schema });
  check('stub database opens', (await database.open()).ok);
  return database;
}

async function run(): Promise<void> {
const database = await openedDatabase();
enqueue(4, 0, [{ kind: 2, value: 'bad-id' }, { kind: 2, value: 'title' }, { kind: 0, value: null }], 1);
check('select rejects text for integer column', (await database.select('entries')).status === 'corrupt_data');
enqueue(4, 0, [{ kind: 1, value: 1 }, { kind: 0, value: null }, { kind: 0, value: null }], 1);
check('select rejects null for not-null column', (await database.select('entries')).status === 'corrupt_data');

const rollbackDb = await openedDatabase();
calls.length = 0;
enqueue(7);
enqueue(9, 10);
enqueue(2);
const rollback = await rollbackDb.transaction(async () => ({ ok: false as const, status: 'invalid_data' as const, value: null }));
check('failed rollback reports storage_error', rollback.status === 'storage_error');
check('failed rollback closes uncertain handle', rollbackDb.state === 'closed' && calls.includes(2));

const commitDb = await openedDatabase();
calls.length = 0;
enqueue(7);
enqueue(8, 11);
enqueue(9);
const commit = await commitDb.transaction(async () => ({ ok: true as const, status: 'ok' as const, value: 1 }));
check('failed commit attempts rollback', commit.status === 'quota_exceeded' && calls.join(',') === '7,8,9');
check('successful rollback keeps handle usable', commitDb.state === 'open');

const malformedDb = await openedDatabase();
calls.length = 0;
enqueue(7);
enqueue(9);
const malformed = await malformedDb.transaction(async () => ({ ok: true, status: 'invalid_data', value: 1 } as any));
check('malformed callback result is normalized and rolled back', malformed.status === 'storage_error' && calls.join(',') === '7,9');

const retainedDb = await openedDatabase();
calls.length = 0;
let retainedTransaction: any = null;
enqueue(7);
enqueue(8);
const firstTransaction = await retainedDb.transaction(async (tx) => {
  retainedTransaction = tx;
  return { ok: true, status: 'ok', value: 1 };
});
check('first transaction commits before its reference is retained', firstTransaction.ok);
calls.length = 0;
enqueue(7);
enqueue(3, 0, [{ kind: 1, value: 2 }]);
enqueue(8);
const secondTransaction = await retainedDb.transaction(async (tx) => {
  const inserted = await tx.insert('entries', { title: 'current' });
  const stale = await retainedTransaction.insert('entries', { title: 'stale' });
  const booleanBypass = await (retainedDb as any).insertInternal('entries', { title: 'bypass' }, true);
  check('a retained transaction is closed while a newer transaction runs', stale.status === 'closed');
  check('a boolean cannot impersonate the active transaction token', booleanBypass.status === 'closed');
  return inserted;
});
check('a retained transaction cannot submit an operation to a newer transaction',
  secondTransaction.ok && calls.join(',') === '7,3,8');
const staleOutside = await retainedTransaction.insert('entries', { title: 'after' });
check('a retained transaction remains closed after the newer transaction completes', staleOutside.status === 'closed');
enqueue(2);
check('database closes after transaction completion', (await retainedDb.close()).ok);
enqueue(1, 0, [{ kind: 1, value: 9 }, { kind: 1, value: 0 }]);
check('database reopens after transaction completion', (await retainedDb.open()).ok);
const staleAfterReopen = await retainedTransaction.insert('entries', { title: 'reopened' });
check('a retained transaction stays closed after the database reopens', staleAfterReopen.status === 'closed');

const ownershipDb = await openedDatabase();
calls.length = 0;
submitted.length = 0;
let releaseOldCallback!: (value: any) => void;
const oldCallback = new Promise<any>((resolve) => { releaseOldCallback = resolve; });
let finishOldOperation!: (status: string) => void;
const oldOperationFinished = new Promise<string>((resolve) => { finishOldOperation = resolve; });
enqueue(7);
enqueue(3, 6);
const oldTransaction = ownershipDb.transaction(async (tx) => {
  const operation = await tx.insert('entries', { title: 'old generation' });
  finishOldOperation(operation.status);
  return oldCallback;
});
check('old transaction observes its quarantined handle', await oldOperationFinished === 'closed');
enqueue(1, 0, [{ kind: 1, value: 2 }, { kind: 1, value: 0 }]);
check('database recovers onto a new handle during the old callback', (await ownershipDb.open()).ok);
submitted.length = 0;
calls.length = 0;
let releaseNewCallback!: (value: any) => void;
const newCallback = new Promise<any>((resolve) => { releaseNewCallback = resolve; });
let finishNewOperation!: (status: string) => void;
const newOperationFinished = new Promise<string>((resolve) => { finishNewOperation = resolve; });
enqueue(7);
enqueue(3, 0, [{ kind: 1, value: 2 }]);
const newTransaction = ownershipDb.transaction(async (tx) => {
  const operation = await tx.insert('entries', { title: 'new generation' });
  finishNewOperation(operation.status);
  return newCallback;
});
check('new-generation transaction is active before the old callback settles', await newOperationFinished === 'ok');
releaseOldCallback({ ok: true, status: 'ok', value: 1 });
const oldTransactionResult = await oldTransaction;
check('old transaction reports the closure without touching the replacement transaction',
  oldTransactionResult.status === 'closed' && !submitted.some((request) => request.op === 9 && request.handle === 2));
releaseNewCallback({ ok: true, status: 'ok', value: 2 });
const newTransactionResult = await newTransaction;
check('replacement transaction commits and keeps the database open', newTransactionResult.ok && ownershipDb.state === 'open');
enqueue(2);
check('replacement database closes after its transaction commits', (await ownershipDb.close()).ok);

if (failures > 0) process.exitCode = 1;
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
