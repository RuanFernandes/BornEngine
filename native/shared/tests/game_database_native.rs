use bloom_shared::database::{DatabaseStatus, DatabaseStore, DatabaseValue};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

#[path = "game_database_native/import_recovery.rs"]
mod import_recovery;

const OPEN: u32 = 1;
const CLOSE: u32 = 2;
const INSERT: u32 = 3;
const SELECT: u32 = 4;
const UPDATE: u32 = 5;
const DELETE: u32 = 6;
const BEGIN: u32 = 7;
const COMMIT: u32 = 8;
const ROLLBACK: u32 = 9;
const MIGRATE: u32 = 10;
const EXPORT: u32 = 11;
const IMPORT: u32 = 12;

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "bornengine-database-test-{}-{id}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

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

fn empty_object() -> DatabaseValue {
    object(std::iter::empty::<(String, DatabaseValue)>())
}

fn descriptor(kind: &str, options: DatabaseValue) -> DatabaseValue {
    object([("kind", string(kind)), ("options", options)])
}

fn schema() -> DatabaseValue {
    object([(
        "saves",
        object([(
            "columns",
            object([
                (
                    "id",
                    descriptor(
                        "integer",
                        object([
                            ("primaryKey", DatabaseValue::Boolean(true)),
                            ("autoIncrement", DatabaseValue::Boolean(true)),
                        ]),
                    ),
                ),
                (
                    "slot",
                    descriptor(
                        "text",
                        object([
                            ("notNull", DatabaseValue::Boolean(true)),
                            ("unique", DatabaseValue::Boolean(true)),
                        ]),
                    ),
                ),
                (
                    "score",
                    descriptor(
                        "integer",
                        object([("notNull", DatabaseValue::Boolean(true))]),
                    ),
                ),
                (
                    "payload",
                    descriptor("blob", object([("notNull", DatabaseValue::Boolean(true))])),
                ),
            ]),
        )]),
    )])
}

fn open_args(app_id: &str, name: &str) -> Vec<DatabaseValue> {
    vec![
        string(app_id),
        string(name),
        DatabaseValue::Boolean(false),
        schema(),
    ]
}

fn create_saves_migration() -> DatabaseValue {
    object([
        ("op", string("createTable")),
        ("table", string("saves")),
        ("name", string("")),
        (
            "values",
            match schema() {
                DatabaseValue::Object(mut schema) => match schema.remove("saves").unwrap() {
                    DatabaseValue::Object(mut table) => table.remove("columns").unwrap(),
                    _ => unreachable!(),
                },
                _ => unreachable!(),
            },
        ),
    ])
}

fn migration_step(op: &str, table: &str, name: &str, values: DatabaseValue) -> DatabaseValue {
    object([
        ("op", string(op)),
        ("table", string(table)),
        ("name", string(name)),
        ("values", values),
    ])
}

fn add_nullable_text_column(table: &str, name: &str) -> DatabaseValue {
    migration_step(
        "addColumn",
        table,
        name,
        object([("descriptor", descriptor("text", empty_object()))]),
    )
}

fn make_database_image(sql: &str) -> Vec<u8> {
    let connection = rusqlite::Connection::open_in_memory().unwrap();
    connection.execute_batch(sql).unwrap();
    connection.serialize(rusqlite::MAIN_DB).unwrap().to_vec()
}

fn rewrite_database_image(image: &[u8], sql: &str) -> Vec<u8> {
    let mut connection = rusqlite::Connection::open_in_memory().unwrap();
    connection
        .deserialize_read_exact(rusqlite::MAIN_DB, image, image.len(), false)
        .unwrap();
    connection.execute_batch(sql).unwrap();
    connection.serialize(rusqlite::MAIN_DB).unwrap().to_vec()
}

fn execute(
    store: &mut DatabaseStore,
    op: u32,
    handle: f64,
    args: Vec<DatabaseValue>,
    root: Option<&Path>,
) -> (DatabaseStatus, Vec<DatabaseValue>, usize) {
    let response = store.execute(op, handle, args, root);
    (response.status, response.values, response.rows)
}

fn open_and_migrate(store: &mut DatabaseStore, root: &Path, name: &str) -> f64 {
    let (status, values, _) = execute(
        store,
        OPEN,
        0.0,
        open_args("org.example.native-tests", name),
        Some(root),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    let handle = match values[0] {
        DatabaseValue::Number(handle) => handle,
        _ => panic!("open did not return a database handle"),
    };
    let (migration_status, _, _) = execute(
        store,
        MIGRATE,
        handle,
        vec![
            number(1.0),
            DatabaseValue::Array(vec![create_saves_migration()]),
        ],
        Some(root),
    );
    assert_eq!(migration_status, DatabaseStatus::Ok);
    handle
}

fn open_existing(store: &mut DatabaseStore, root: &Path, name: &str) -> f64 {
    let (status, values, _) = execute(
        store,
        OPEN,
        0.0,
        open_args("org.example.native-tests", name),
        Some(root),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    match values[0] {
        DatabaseValue::Number(handle) => handle,
        _ => panic!("open did not return a database handle"),
    }
}

#[test]
fn persistent_database_reopens_and_binds_crud_values() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "profile");

    let (status, inserted, _) = execute(
        &mut store,
        INSERT,
        handle,
        vec![
            string("saves"),
            object([
                ("slot", string("'; DROP TABLE saves; --")),
                ("score", number(42.0)),
                ("payload", DatabaseValue::Bytes(vec![0, 1, 127, 255])),
            ]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert!(matches!(inserted.as_slice(), [DatabaseValue::Number(id)] if *id == 1.0));

    let (status, rows, row_count) = execute(
        &mut store,
        SELECT,
        handle,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![
                string("id"),
                string("slot"),
                string("score"),
                string("payload"),
            ]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(row_count, 1);
    assert!(matches!(rows.as_slice(), [
        DatabaseValue::Number(1.0),
        DatabaseValue::String(slot),
        DatabaseValue::Number(42.0),
        DatabaseValue::Bytes(bytes),
    ] if slot == "'; DROP TABLE saves; --" && bytes == &[0, 1, 127, 255]));

    assert_eq!(
        execute(&mut store, CLOSE, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );
    let (status, reopened, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.native-tests", "profile"),
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert!(matches!(
        reopened.as_slice(),
        [DatabaseValue::Number(_), DatabaseValue::Number(1.0)]
    ));
}

#[test]
fn database_handle_is_busy_until_closed() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let _handle = open_and_migrate(&mut store, root.path(), "busy");

    let (status, _, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.native-tests", "busy"),
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Busy);
}

#[test]
fn sqlite_constraints_map_to_constraint_status() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "constraints");
    let args = vec![
        string("saves"),
        object([
            ("slot", string("main")),
            ("score", number(1.0)),
            ("payload", DatabaseValue::Bytes(vec![])),
        ]),
    ];
    assert_eq!(
        execute(&mut store, INSERT, handle, args.clone(), Some(root.path())).0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(&mut store, INSERT, handle, args, Some(root.path())).0,
        DatabaseStatus::ConstraintError
    );
}

#[test]
fn insert_rejects_missing_required_values_before_sqlite() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "required-values");

    let status = execute(
        &mut store,
        INSERT,
        handle,
        vec![string("saves"), object([("slot", string("incomplete"))])],
        Some(root.path()),
    )
    .0;

    assert_eq!(status, DatabaseStatus::InvalidData);
}

#[test]
fn select_accepts_safe_integer_limit_and_offset_values() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "large-select-range");

    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        handle,
        vec![
            string("saves"),
            object([
                ("limit", number(9_007_199_254_740_991.0)),
                ("offset", number(9_007_199_254_740_991.0)),
            ]),
            DatabaseValue::Array(vec![string("id")]),
        ],
        Some(root.path()),
    );

    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 0);
    assert!(values.is_empty());
}

#[test]
fn update_delete_and_commit_report_deterministic_results() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "write-ops");
    let (status, _, _) = execute(
        &mut store,
        INSERT,
        handle,
        vec![
            string("saves"),
            object([
                ("slot", string("main")),
                ("score", number(1.0)),
                ("payload", DatabaseValue::Bytes(vec![1])),
            ]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    let (status, changed, _) = execute(
        &mut store,
        UPDATE,
        handle,
        vec![
            string("saves"),
            object([("score", number(2.0))]),
            object([("slot", object([("eq", string("main"))]))]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert!(matches!(changed.as_slice(), [DatabaseValue::Number(1.0)]));
    assert_eq!(
        execute(&mut store, BEGIN, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(&mut store, COMMIT, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );

    let (status, deleted, _) = execute(
        &mut store,
        DELETE,
        handle,
        vec![
            string("saves"),
            object([("score", object([("eq", number(2.0))]))]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert!(matches!(deleted.as_slice(), [DatabaseValue::Number(1.0)]));
}

#[test]
fn migration_steps_add_and_drop_columns_and_indexes_using_bound_values() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "schema-steps");
    execute(
        &mut store,
        INSERT,
        handle,
        vec![
            string("saves"),
            object([
                ("slot", string("main")),
                ("score", number(3.0)),
                ("payload", DatabaseValue::Bytes(vec![3])),
            ]),
        ],
        Some(root.path()),
    );
    let add_level = object([
        ("op", string("addColumn")),
        ("table", string("saves")),
        ("name", string("level")),
        (
            "values",
            object([(
                "descriptor",
                descriptor(
                    "integer",
                    object([
                        ("notNull", DatabaseValue::Boolean(true)),
                        ("default", number(5.0)),
                    ]),
                ),
            )]),
        ),
    ]);
    let create_index = object([
        ("op", string("createIndex")),
        ("table", string("saves")),
        ("name", string("idx_saves_slot")),
        (
            "values",
            object([(
                "descriptor",
                object([
                    ("name", string("idx_saves_slot")),
                    ("columns", DatabaseValue::Array(vec![string("slot")])),
                    ("unique", DatabaseValue::Boolean(false)),
                ]),
            )]),
        ),
    ]);
    let transform = object([
        ("op", string("transform")),
        ("table", string("saves")),
        ("name", string("")),
        ("values", object([("score", number(99.0))])),
    ]);
    let (status, _, _) = execute(
        &mut store,
        MIGRATE,
        handle,
        vec![
            number(2.0),
            DatabaseValue::Array(vec![add_level, create_index, transform]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);

    let path = root
        .path()
        .join("org.example.native-tests")
        .join("schema-steps.sqlite3");
    let persisted = rusqlite::Connection::open(&path).unwrap();
    let row: (i64, i64) = persisted
        .query_row(
            "SELECT score, level FROM saves WHERE slot = ?",
            ["main"],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(row, (99, 5));
    let index_exists: bool = persisted
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='index' AND name=?)",
            ["idx_saves_slot"],
            |row| row.get(0),
        )
        .unwrap();
    assert!(index_exists);
    drop(persisted);

    let drop_index = object([
        ("op", string("dropIndex")),
        ("table", string("saves")),
        ("name", string("idx_saves_slot")),
        ("values", empty_object()),
    ]);
    let drop_level = object([
        ("op", string("dropColumn")),
        ("table", string("saves")),
        ("name", string("level")),
        ("values", empty_object()),
    ]);
    let (status, _, _) = execute(
        &mut store,
        MIGRATE,
        handle,
        vec![
            number(3.0),
            DatabaseValue::Array(vec![drop_index, drop_level]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    let persisted = rusqlite::Connection::open(path).unwrap();
    let row: i64 = persisted
        .query_row("SELECT score FROM saves WHERE slot = ?", ["main"], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(row, 99);
}

#[test]
fn migration_rejects_dropping_an_index_from_a_different_table() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "index-table-ownership");

    let create_index = object([
        ("op", string("createIndex")),
        ("table", string("saves")),
        ("name", string("idx_owned_by_saves")),
        (
            "values",
            object([(
                "descriptor",
                object([
                    ("name", string("idx_owned_by_saves")),
                    ("columns", DatabaseValue::Array(vec![string("slot")])),
                    ("unique", DatabaseValue::Boolean(false)),
                ]),
            )]),
        ),
    ]);
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![number(2.0), DatabaseValue::Array(vec![create_index])],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let wrong_table_drop = object([
        ("op", string("dropIndex")),
        ("table", string("other_table")),
        ("name", string("idx_owned_by_saves")),
        ("values", empty_object()),
    ]);
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![number(3.0), DatabaseValue::Array(vec![wrong_table_drop])],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::MigrationError
    );

    let path = root
        .path()
        .join("org.example.native-tests")
        .join("index-table-ownership.sqlite3");
    let persisted = rusqlite::Connection::open(path).unwrap();
    let exists: bool = persisted
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='index' AND name=?)",
            ["idx_owned_by_saves"],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        exists,
        "failed migration removed an index owned by another table"
    );
}

#[test]
fn table_rebuild_preserves_boolean_checks_and_primary_key_indexes() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "rebuild-constraints");
    let create = object([
        ("op", string("createTable")),
        ("table", string("settings")),
        ("name", string("")),
        (
            "values",
            object([
                (
                    "key",
                    descriptor(
                        "text",
                        object([("primaryKey", DatabaseValue::Boolean(true))]),
                    ),
                ),
                ("enabled", descriptor("boolean", empty_object())),
            ]),
        ),
    ]);
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![number(2.0), DatabaseValue::Array(vec![create])],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    let add = object([
        ("op", string("addColumn")),
        ("table", string("settings")),
        ("name", string("note")),
        (
            "values",
            object([("descriptor", descriptor("text", empty_object()))]),
        ),
    ]);
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![number(3.0), DatabaseValue::Array(vec![add])],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let path = root
        .path()
        .join("org.example.native-tests")
        .join("rebuild-constraints.sqlite3");
    let persisted = rusqlite::Connection::open(path).unwrap();
    assert!(persisted
        .execute(
            "INSERT INTO settings (key, enabled) VALUES ('valid', 1)",
            []
        )
        .is_ok());
    assert!(persisted
        .execute(
            "INSERT INTO settings (key, enabled) VALUES ('invalid', 2)",
            []
        )
        .is_err());
}

#[test]
fn migrations_commit_schema_and_version_atomically() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "migration-atomicity");

    let failed = object([
        ("op", string("createTable")),
        ("table", string("transient")),
        ("name", string("")),
        (
            "values",
            object([(
                "id",
                descriptor(
                    "integer",
                    object([("primaryKey", DatabaseValue::Boolean(true))]),
                ),
            )]),
        ),
    ]);
    let missing_table_drop = object([
        ("op", string("dropTable")),
        ("table", string("missing")),
        ("name", string("")),
        ("values", empty_object()),
    ]);
    let (status, _, _) = execute(
        &mut store,
        MIGRATE,
        handle,
        vec![
            number(2.0),
            DatabaseValue::Array(vec![failed, missing_table_drop]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::MigrationError);

    assert_eq!(
        execute(&mut store, CLOSE, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );
    let (status, reopened, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.native-tests", "migration-atomicity"),
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert!(matches!(
        reopened.as_slice(),
        [DatabaseValue::Number(_), DatabaseValue::Number(1.0)]
    ));
    let path = root
        .path()
        .join("org.example.native-tests")
        .join("migration-atomicity.sqlite3");
    let persisted = rusqlite::Connection::open(path).unwrap();
    let table_exists: bool = persisted
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='transient')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        !table_exists,
        "the failed migration left its first DDL operation behind"
    );

    let reopened_handle = match reopened[0] {
        DatabaseValue::Number(handle) => handle,
        _ => panic!("reopen did not return a database handle"),
    };
    let (status, values, _) = execute(
        &mut store,
        EXPORT,
        reopened_handle,
        vec![],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    let bytes = match values.as_slice() {
        [DatabaseValue::Bytes(bytes)] => bytes,
        _ => panic!("database export did not return bytes"),
    };
    assert!(bytes.len() >= 100);
}

#[test]
fn transactions_rollback_and_keep_the_handle_usable() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "rollback");

    assert_eq!(
        execute(&mut store, BEGIN, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            handle,
            vec![
                string("saves"),
                object([
                    ("slot", string("temp")),
                    ("score", number(9.0)),
                    ("payload", DatabaseValue::Bytes(vec![9])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(&mut store, ROLLBACK, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );

    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        handle,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("id")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 0);
    assert!(values.is_empty());
}

#[test]
fn export_import_replaces_database_atomically_and_rejects_corrupt_images() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let source = open_and_migrate(&mut store, root.path(), "source");
    execute(
        &mut store,
        INSERT,
        source,
        vec![
            string("saves"),
            object([
                ("slot", string("main")),
                ("score", number(7.0)),
                ("payload", DatabaseValue::Bytes(vec![7, 0, 7])),
            ]),
        ],
        Some(root.path()),
    );
    let (status, image, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let image = match image.into_iter().next().unwrap() {
        DatabaseValue::Bytes(bytes) => bytes,
        _ => panic!("export result was not a blob"),
    };

    let target = open_and_migrate(&mut store, root.path(), "target");
    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(image.clone())],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);

    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("slot"), string("score"), string("payload")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(matches!(values.as_slice(), [
        DatabaseValue::String(slot),
        DatabaseValue::Number(7.0),
        DatabaseValue::Bytes(bytes),
    ] if slot == "main" && bytes == &[7, 0, 7]));

    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(b"not an SQLite file".to_vec())],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::CorruptData);
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("score")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(matches!(values.as_slice(), [DatabaseValue::Number(7.0)]));
}

#[test]
fn app_id_and_database_name_are_safe_path_components() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let (status, _, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("../escape", "valid"),
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::InvalidNamespace);
    let (status, _, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.game", "../escape"),
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::InvalidNamespace);
    assert!(std::fs::read_dir(root.path()).unwrap().next().is_none());
}

#[cfg(unix)]
#[test]
fn persistent_storage_rejects_symlinked_app_namespaces() {
    use std::os::unix::fs::symlink;

    let root = TempDir::new();
    let target = root.path().join("other-app");
    std::fs::create_dir(&target).unwrap();
    symlink(&target, root.path().join("org.example.native-tests")).unwrap();

    let mut store = DatabaseStore::new();
    let status = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.native-tests", "profile"),
        Some(root.path()),
    )
    .0;

    assert_eq!(status, DatabaseStatus::StorageError);
}

#[test]
fn persistent_storage_requires_a_valid_app_data_directory() {
    let mut store = DatabaseStore::new();
    let (status, _, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.game", "missing-root"),
        None,
    );
    assert_eq!(status, DatabaseStatus::StorageError);

    let root = TempDir::new();
    let blocker = root.path().join("not-a-directory");
    std::fs::write(&blocker, b"file").unwrap();
    let (status, _, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.game", "cannot-create-parent"),
        Some(&blocker),
    );
    assert_eq!(status, DatabaseStatus::StorageError);
}

#[test]
fn import_rejects_a_different_schema_version() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let version_one = open_and_migrate(&mut store, root.path(), "version-one");
    let (status, image, _) = execute(&mut store, EXPORT, version_one, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let image = match image.into_iter().next().unwrap() {
        DatabaseValue::Bytes(bytes) => bytes,
        _ => panic!("export result was not a blob"),
    };

    let (status, opened, _) = execute(
        &mut store,
        OPEN,
        0.0,
        open_args("org.example.native-tests", "current"),
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    let current = match opened[0] {
        DatabaseValue::Number(handle) => handle,
        _ => panic!("open did not return a database handle"),
    };
    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        current,
        vec![DatabaseValue::Bytes(image)],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::UnsupportedVersion);
}

#[test]
fn import_rejects_same_version_image_with_a_different_schema_and_keeps_live_data() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let target = open_and_migrate(&mut store, root.path(), "schema-validation");
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            target,
            vec![
                string("saves"),
                object([
                    ("slot", string("keep-me")),
                    ("score", number(73.0)),
                    ("payload", DatabaseValue::Bytes(vec![7, 3])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let unrelated_image =
        make_database_image("CREATE TABLE unrelated (x INTEGER); PRAGMA user_version = 1;");
    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(unrelated_image)],
        Some(root.path()),
    );

    assert_eq!(status, DatabaseStatus::CorruptData);
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("slot"), string("score")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(
        matches!(values.as_slice(), [DatabaseValue::String(slot), DatabaseValue::Number(73.0)] if slot == "keep-me")
    );
}

#[test]
fn independent_sqlite_writer_process_child() {
    let (Ok(path), Ok(ready), Ok(release)) = (
        std::env::var("BLOOM_DATABASE_WRITER_CHILD_PATH"),
        std::env::var("BLOOM_DATABASE_WRITER_CHILD_READY"),
        std::env::var("BLOOM_DATABASE_WRITER_CHILD_RELEASE"),
    ) else {
        return;
    };
    let writer = rusqlite::Connection::open(path).unwrap();
    writer
        .execute_batch(
            "BEGIN IMMEDIATE;
             INSERT INTO saves (slot, score, payload) VALUES ('external', 88, X'58');",
        )
        .unwrap();
    std::fs::write(ready, b"locked").unwrap();
    for _ in 0..1000 {
        if Path::new(&release).is_file() {
            writer.execute_batch("COMMIT").unwrap();
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    panic!("parent did not release the independent SQLite writer");
}

#[test]
fn import_returns_busy_while_an_independent_process_owns_the_writer_lock() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let target = open_and_migrate(&mut store, root.path(), "external-writer-target");
    let source = open_and_migrate(&mut store, root.path(), "external-writer-source");
    let (_, image, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    let image = match image.into_iter().next().unwrap() {
        DatabaseValue::Bytes(image) => image,
        _ => panic!("database export did not return bytes"),
    };
    let path = root
        .path()
        .join("org.example.native-tests")
        .join("external-writer-target.sqlite3");
    let ready = root.path().join("writer-ready");
    let release = root.path().join("writer-release");
    let mut writer = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "independent_sqlite_writer_process_child",
            "--nocapture",
        ])
        .env("BLOOM_DATABASE_WRITER_CHILD_PATH", &path)
        .env("BLOOM_DATABASE_WRITER_CHILD_READY", &ready)
        .env("BLOOM_DATABASE_WRITER_CHILD_RELEASE", &release)
        .spawn()
        .unwrap();
    for _ in 0..1000 {
        if ready.is_file() {
            break;
        }
        assert!(
            writer.try_wait().unwrap().is_none(),
            "writer child exited early"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert!(
        ready.is_file(),
        "writer child did not acquire its transaction"
    );

    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(image)],
        Some(root.path()),
    );

    std::fs::write(&release, b"commit").unwrap();
    let child_status = writer.wait().unwrap();
    assert!(
        child_status.success(),
        "writer child failed: {child_status}"
    );
    assert_eq!(status, DatabaseStatus::Busy);
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            object([(
                "where",
                object([("slot", object([("eq", string("external"))]))]),
            )]),
            DatabaseValue::Array(vec![string("score")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(matches!(values.as_slice(), [DatabaseValue::Number(88.0)]));
}

#[test]
fn closing_with_an_unfinished_transaction_rolls_back_and_releases_the_handle() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "close-aborts-transaction");
    assert_eq!(
        execute(&mut store, BEGIN, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            handle,
            vec![
                string("saves"),
                object([
                    ("slot", string("uncommitted")),
                    ("score", number(1.0)),
                    ("payload", DatabaseValue::Bytes(vec![])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(&mut store, CLOSE, handle, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );

    let reopened = open_existing(&mut store, root.path(), "close-aborts-transaction");
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        reopened,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("id")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 0);
    assert!(values.is_empty());
}

#[test]
fn import_rejects_same_version_image_with_an_extra_unique_constraint() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let target = open_and_migrate(&mut store, root.path(), "extra-unique");
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            target,
            vec![
                string("saves"),
                object([
                    ("slot", string("keep-me")),
                    ("score", number(73.0)),
                    ("payload", DatabaseValue::Bytes(vec![7, 3])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let incompatible_image = make_database_image(
        "CREATE TABLE saves (\
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, \
            slot TEXT NOT NULL UNIQUE, \
            score INTEGER NOT NULL UNIQUE, \
            payload BLOB NOT NULL\
         ) STRICT; PRAGMA user_version = 1;",
    );
    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(incompatible_image)],
        Some(root.path()),
    );

    assert_eq!(status, DatabaseStatus::CorruptData);
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("slot"), string("score")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(
        matches!(values.as_slice(), [DatabaseValue::String(slot), DatabaseValue::Number(73.0)] if slot == "keep-me")
    );
}

#[test]
fn import_accepts_schema_with_matching_migration_created_unique_index() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let target = open_and_migrate(&mut store, root.path(), "unique-index-target");
    let source = open_and_migrate(&mut store, root.path(), "unique-index-source");
    let add_unique_index = || {
        migration_step(
            "createIndex",
            "saves",
            "idx_saves_score_unique",
            object([(
                "descriptor",
                object([
                    ("name", string("idx_saves_score_unique")),
                    ("columns", DatabaseValue::Array(vec![string("score")])),
                    ("unique", DatabaseValue::Boolean(true)),
                ]),
            )]),
        )
    };
    for handle in [target, source] {
        assert_eq!(
            execute(
                &mut store,
                MIGRATE,
                handle,
                vec![number(2.0), DatabaseValue::Array(vec![add_unique_index()])],
                Some(root.path()),
            )
            .0,
            DatabaseStatus::Ok
        );
    }

    let (status, values, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let image = match values.into_iter().next().unwrap() {
        DatabaseValue::Bytes(bytes) => bytes,
        _ => panic!("export result was not a blob"),
    };
    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(image)],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
}

#[test]
fn import_rejects_partial_replacement_of_migration_created_unique_index() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let target = open_and_migrate(&mut store, root.path(), "partial-index-target");
    let source = open_and_migrate(&mut store, root.path(), "partial-index-source");
    let add_unique_index = || {
        migration_step(
            "createIndex",
            "saves",
            "idx_saves_score_unique",
            object([(
                "descriptor",
                object([
                    ("name", string("idx_saves_score_unique")),
                    ("columns", DatabaseValue::Array(vec![string("score")])),
                    ("unique", DatabaseValue::Boolean(true)),
                ]),
            )]),
        )
    };
    for handle in [target, source] {
        assert_eq!(
            execute(
                &mut store,
                MIGRATE,
                handle,
                vec![number(2.0), DatabaseValue::Array(vec![add_unique_index()])],
                Some(root.path()),
            )
            .0,
            DatabaseStatus::Ok
        );
    }
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            target,
            vec![
                string("saves"),
                object([
                    ("slot", string("keep-live")),
                    ("score", number(73.0)),
                    ("payload", DatabaseValue::Bytes(vec![7, 3])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            source,
            vec![
                string("saves"),
                object([
                    ("slot", string("incoming")),
                    ("score", number(31.0)),
                    ("payload", DatabaseValue::Bytes(vec![3, 1])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let (status, values, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let exported = match values.into_iter().next().unwrap() {
        DatabaseValue::Bytes(bytes) => bytes,
        _ => panic!("export result was not a blob"),
    };
    let mut imported_connection = rusqlite::Connection::open_in_memory().unwrap();
    imported_connection
        .deserialize_read_exact(rusqlite::MAIN_DB, &exported[..], exported.len(), false)
        .unwrap();
    imported_connection
        .execute_batch(
            "DROP INDEX idx_saves_score_unique; \
             CREATE UNIQUE INDEX idx_saves_score_unique \
             ON saves (score) WHERE score > 0;",
        )
        .unwrap();
    let version: i64 = imported_connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 2);
    let incompatible_image = imported_connection
        .serialize(rusqlite::MAIN_DB)
        .unwrap()
        .to_vec();

    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(incompatible_image)],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::CorruptData);
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("slot"), string("score")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(
        matches!(values.as_slice(), [DatabaseValue::String(slot), DatabaseValue::Number(73.0)] if slot == "keep-live")
    );
}

#[test]
fn import_rejects_different_predicates_for_matching_partial_indexes() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let target = open_and_migrate(&mut store, root.path(), "partial-predicate-target");
    let source = open_and_migrate(&mut store, root.path(), "partial-predicate-source");
    let add_unique_index = || {
        migration_step(
            "createIndex",
            "saves",
            "idx_saves_score_unique",
            object([(
                "descriptor",
                object([
                    ("name", string("idx_saves_score_unique")),
                    ("columns", DatabaseValue::Array(vec![string("score")])),
                    ("unique", DatabaseValue::Boolean(true)),
                ]),
            )]),
        )
    };
    for handle in [target, source] {
        assert_eq!(
            execute(
                &mut store,
                MIGRATE,
                handle,
                vec![number(2.0), DatabaseValue::Array(vec![add_unique_index()])],
                Some(root.path()),
            )
            .0,
            DatabaseStatus::Ok
        );
    }
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            target,
            vec![
                string("saves"),
                object([
                    ("slot", string("keep-live")),
                    ("score", number(73.0)),
                    ("payload", DatabaseValue::Bytes(vec![7, 3])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            source,
            vec![
                string("saves"),
                object([
                    ("slot", string("incoming")),
                    ("score", number(31.0)),
                    ("payload", DatabaseValue::Bytes(vec![3, 1])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let target_path = root
        .path()
        .join("org.example.native-tests/partial-predicate-target.sqlite3");
    let target_connection = rusqlite::Connection::open(target_path).unwrap();
    target_connection
        .execute_batch(
            "DROP INDEX idx_saves_score_unique; \
             CREATE UNIQUE INDEX idx_saves_score_unique \
             ON saves (score) WHERE score > 0;",
        )
        .unwrap();
    drop(target_connection);

    let (status, values, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let exported = match values.into_iter().next().unwrap() {
        DatabaseValue::Bytes(bytes) => bytes,
        _ => panic!("export result was not a blob"),
    };
    let incompatible_image = rewrite_database_image(
        &exported,
        "DROP INDEX idx_saves_score_unique; \
         CREATE UNIQUE INDEX idx_saves_score_unique \
         ON saves (score) WHERE score > 10;",
    );
    let mut imported_connection = rusqlite::Connection::open_in_memory().unwrap();
    imported_connection
        .deserialize_read_exact(
            rusqlite::MAIN_DB,
            &incompatible_image[..],
            incompatible_image.len(),
            false,
        )
        .unwrap();
    let imported_version: i64 = imported_connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(imported_version, 2);
    drop(imported_connection);

    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(incompatible_image)],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::CorruptData);
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("slot"), string("score")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(
        matches!(values.as_slice(), [DatabaseValue::String(slot), DatabaseValue::Number(73.0)] if slot == "keep-live")
    );
}

#[test]
fn import_rejects_different_explicit_index_names_with_internal_prefix() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let target = open_and_migrate(&mut store, root.path(), "reserved-index-name-target");
    let source = open_and_migrate(&mut store, root.path(), "reserved-index-name-source");
    let add_unique_index = |name: &str| {
        migration_step(
            "createIndex",
            "saves",
            name,
            object([(
                "descriptor",
                object([
                    ("name", string(name)),
                    ("columns", DatabaseValue::Array(vec![string("score")])),
                    ("unique", DatabaseValue::Boolean(true)),
                ]),
            )]),
        )
    };
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            target,
            vec![
                number(2.0),
                DatabaseValue::Array(vec![add_unique_index("__bornengine_unique_a")]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            source,
            vec![
                number(2.0),
                DatabaseValue::Array(vec![add_unique_index("__bornengine_unique_b")]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            target,
            vec![
                string("saves"),
                object([
                    ("slot", string("keep-live")),
                    ("score", number(73.0)),
                    ("payload", DatabaseValue::Bytes(vec![7, 3])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            source,
            vec![
                string("saves"),
                object([
                    ("slot", string("incoming")),
                    ("score", number(31.0)),
                    ("payload", DatabaseValue::Bytes(vec![3, 1])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let (status, values, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let image = match values.into_iter().next().unwrap() {
        DatabaseValue::Bytes(bytes) => bytes,
        _ => panic!("export result was not a blob"),
    };
    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        target,
        vec![DatabaseValue::Bytes(image)],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::CorruptData);
    let (status, values, rows) = execute(
        &mut store,
        SELECT,
        target,
        vec![
            string("saves"),
            empty_object(),
            DatabaseValue::Array(vec![string("slot"), string("score")]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert_eq!(rows, 1);
    assert!(
        matches!(values.as_slice(), [DatabaseValue::String(slot), DatabaseValue::Number(73.0)] if slot == "keep-live")
    );
}

#[test]
fn rebuilding_multiple_unique_tables_uses_distinct_internal_index_names() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "unique-rebuilds");
    let unique_table = |table: &str, column: &str| {
        migration_step(
            "createTable",
            table,
            "",
            object([
                (
                    "id",
                    descriptor(
                        "integer",
                        object([("primaryKey", DatabaseValue::Boolean(true))]),
                    ),
                ),
                (
                    column,
                    descriptor("text", object([("unique", DatabaseValue::Boolean(true))])),
                ),
            ]),
        )
    };
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![
                number(2.0),
                DatabaseValue::Array(vec![
                    unique_table("accounts", "email"),
                    unique_table("settings", "key"),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let rebuild_both = vec![
        add_nullable_text_column("accounts", "display_name"),
        add_nullable_text_column("settings", "description"),
    ];
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![number(3.0), DatabaseValue::Array(rebuild_both)],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![
                number(4.0),
                DatabaseValue::Array(vec![
                    add_nullable_text_column("accounts", "status"),
                    add_nullable_text_column("settings", "category"),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
}

#[test]
fn table_rebuild_preserves_autoincrement_high_water_mark() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let handle = open_and_migrate(&mut store, root.path(), "sequence-rebuild");
    for slot in ["kept", "deleted-largest"] {
        assert_eq!(
            execute(
                &mut store,
                INSERT,
                handle,
                vec![
                    string("saves"),
                    object([
                        ("slot", string(slot)),
                        ("score", number(1.0)),
                        ("payload", DatabaseValue::Bytes(vec![])),
                    ]),
                ],
                Some(root.path()),
            )
            .0,
            DatabaseStatus::Ok
        );
    }
    assert_eq!(
        execute(
            &mut store,
            DELETE,
            handle,
            vec![
                string("saves"),
                object([("slot", object([("eq", string("deleted-largest"))]))]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(
            &mut store,
            MIGRATE,
            handle,
            vec![
                number(2.0),
                DatabaseValue::Array(vec![add_nullable_text_column("saves", "note")])
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );

    let (status, values, _) = execute(
        &mut store,
        INSERT,
        handle,
        vec![
            string("saves"),
            object([
                ("slot", string("after-rebuild")),
                ("score", number(2.0)),
                ("payload", DatabaseValue::Bytes(vec![])),
            ]),
        ],
        Some(root.path()),
    );
    assert_eq!(status, DatabaseStatus::Ok);
    assert!(matches!(values.as_slice(), [DatabaseValue::Number(3.0)]));
}
