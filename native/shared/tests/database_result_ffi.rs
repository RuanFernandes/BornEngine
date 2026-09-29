use bloom_shared::database::{self, DatabaseValue};
use std::alloc::{GlobalAlloc, Layout, System};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

struct CountingAllocator;

static TRACK_ALLOCATIONS: AtomicBool = AtomicBool::new(false);
static ALLOCATED_BYTES: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc(layout) };
        if !pointer.is_null() && TRACK_ALLOCATIONS.load(Ordering::Relaxed) {
            ALLOCATED_BYTES.fetch_add(layout.size(), Ordering::Relaxed);
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) };
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let result = unsafe { System.realloc(pointer, layout, new_size) };
        if !result.is_null() && TRACK_ALLOCATIONS.load(Ordering::Relaxed) {
            ALLOCATED_BYTES.fetch_add(new_size, Ordering::Relaxed);
        }
        result
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn object(entries: impl IntoIterator<Item = (impl Into<String>, DatabaseValue)>) -> DatabaseValue {
    DatabaseValue::Object(
        entries
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}

fn string(value: &str) -> DatabaseValue {
    DatabaseValue::String(value.to_string())
}

fn number(value: f64) -> DatabaseValue {
    DatabaseValue::Number(value)
}

fn column(kind: &str, options: DatabaseValue) -> DatabaseValue {
    object([("kind", string(kind)), ("options", options)])
}

fn schema() -> DatabaseValue {
    object([(
        "payloads",
        object([(
            "columns",
            object([
                (
                    "id",
                    column(
                        "integer",
                        object([
                            ("primaryKey", DatabaseValue::Boolean(true)),
                            ("autoIncrement", DatabaseValue::Boolean(true)),
                        ]),
                    ),
                ),
                (
                    "payload",
                    column("blob", object([("notNull", DatabaseValue::Boolean(true))])),
                ),
            ]),
        )]),
    )])
}

fn migration_create_table() -> DatabaseValue {
    object([
        ("op", string("createTable")),
        ("table", string("payloads")),
        ("name", string("")),
        (
            "values",
            match schema() {
                DatabaseValue::Object(mut tables) => match tables.remove("payloads").unwrap() {
                    DatabaseValue::Object(mut table) => table.remove("columns").unwrap(),
                    _ => unreachable!(),
                },
                _ => unreachable!(),
            },
        ),
    ])
}

fn bloom_database_data_root() -> Option<PathBuf> {
    None
}

bloom_shared::__bloom_ffi_database!();

#[test]
fn byte_result_ffi_getters_do_not_clone_the_ticket_blob() {
    let app_id = "org.example.result-ffi";
    let name = "large-result";
    let open_ticket = database::submit_native(
        1.0,
        0.0,
        vec![
            string(app_id),
            string(name),
            DatabaseValue::Boolean(true),
            schema(),
        ],
        None,
    );
    assert_eq!(bloom_database_status(open_ticket), 0.0);
    let handle = bloom_database_result_number(open_ticket, 0.0);
    bloom_database_release(open_ticket);

    let migrate_ticket = database::submit_native(
        10.0,
        handle,
        vec![
            number(1.0),
            DatabaseValue::Array(vec![migration_create_table()]),
        ],
        None,
    );
    assert_eq!(bloom_database_status(migrate_ticket), 0.0);
    bloom_database_release(migrate_ticket);

    let insert_ticket = database::submit_native(
        3.0,
        handle,
        vec![
            string("payloads"),
            object([("payload", DatabaseValue::Bytes(vec![0xA7; 4 * 1024 * 1024]))]),
        ],
        None,
    );
    assert_eq!(bloom_database_status(insert_ticket), 0.0);
    bloom_database_release(insert_ticket);

    let export_ticket = database::submit_native(11.0, handle, Vec::new(), None);
    ALLOCATED_BYTES.store(0, Ordering::Relaxed);
    TRACK_ALLOCATIONS.store(true, Ordering::Relaxed);
    let status = bloom_database_status(export_ticket);
    let rows = bloom_database_result_rows(export_ticket);
    let count = bloom_database_result_count(export_ticket);
    let kind = bloom_database_result_kind(export_ticket, 0.0);
    let number = bloom_database_result_number(export_ticket, 0.0);
    let string = bloom_database_result_string(export_ticket, 0.0);
    let image_length = bloom_database_result_byte_count(export_ticket, 0.0);
    let first = bloom_database_result_byte(export_ticket, 0.0, 0.0);
    TRACK_ALLOCATIONS.store(false, Ordering::Relaxed);
    let allocated = ALLOCATED_BYTES.load(Ordering::Relaxed);

    assert_eq!(status, 0.0);
    assert_eq!(rows, 0.0);
    assert_eq!(count, 1.0);
    assert_eq!(kind, 5.0);
    assert_eq!(number, 0.0);
    assert!(!string.is_null());
    assert!(image_length > 4_000_000.0);
    assert_eq!(first, b'S' as f64);
    assert!(
        allocated < 32 * 1024,
        "reading FFI getters for a result allocated {allocated} bytes; the ticket's full SQLite image must stay borrowed"
    );
    bloom_database_release(export_ticket);
}
