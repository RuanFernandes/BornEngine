//! Native SQLite backend for `GameDatabase`.
//!
//! The wire protocol deliberately contains typed values and finite schema
//! operations only. No caller-authored SQL crosses this module.

use rusqlite::backup::{Backup, StepResult};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{
    params_from_iter, Connection, Error as SqlError, ErrorCode, OptionalExtension,
    TransactionBehavior, MAIN_DB,
};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[path = "database/ffi.rs"]
mod ffi;
#[path = "database/image.rs"]
mod image;
pub use ffi::*;
use image::{database_physical_schema_matches, database_schema_matches, validate_database_image};

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
const MAX_WIRE_DEPTH: usize = 32;
// Recursive collections are capped independently from byte-tag payloads.
// Binary data has the same 256 MiB ceiling as SQLite export/import; the
// scratch ByteRun is moved into the parsed value instead of copied.
const MAX_WIRE_VALUES: usize = 1_000_000;
const MAX_IMPORT_BYTES: usize = 256 * 1024 * 1024;

/// Tagged recursive value used by the bounded Perry FFI protocol.
#[derive(Clone, Debug, PartialEq)]
pub enum DatabaseValue {
    Null,
    Number(f64),
    String(String),
    Boolean(bool),
    Bytes(Vec<u8>),
    Array(Vec<DatabaseValue>),
    Object(BTreeMap<String, DatabaseValue>),
}

/// Stable FFI values declared by the TypeScript API.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum DatabaseStatus {
    Ok = 0,
    InvalidNamespace = 1,
    InvalidSchema = 2,
    InvalidQuery = 3,
    InvalidData = 4,
    NotOpen = 5,
    Closed = 6,
    NotFound = 7,
    Busy = 8,
    Unsupported = 9,
    StorageError = 10,
    QuotaExceeded = 11,
    MigrationError = 12,
    CorruptData = 13,
    UnsupportedVersion = 14,
    ConstraintError = 15,
}

#[derive(Clone, Debug)]
pub struct DatabaseResponse {
    pub status: DatabaseStatus,
    pub rows: usize,
    pub values: Vec<DatabaseValue>,
}

impl DatabaseResponse {
    fn status(status: DatabaseStatus) -> Self {
        Self {
            status,
            rows: 0,
            values: Vec::new(),
        }
    }

    fn ok(values: Vec<DatabaseValue>) -> Self {
        Self {
            status: DatabaseStatus::Ok,
            rows: 0,
            values,
        }
    }

    fn rows(rows: usize, values: Vec<DatabaseValue>) -> Self {
        Self {
            status: DatabaseStatus::Ok,
            rows,
            values,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ColumnKind {
    Integer,
    Real,
    Text,
    Blob,
    Boolean,
}

#[derive(Clone, Debug)]
struct ColumnSchema {
    kind: ColumnKind,
    primary_key: bool,
    auto_increment: bool,
    not_null: bool,
    unique: bool,
    default: Option<DatabaseValue>,
    has_default: bool,
}

#[derive(Clone, Debug)]
struct TableSchema {
    columns: BTreeMap<String, ColumnSchema>,
}

#[derive(Clone, Debug)]
struct DatabaseSchema {
    tables: BTreeMap<String, TableSchema>,
}

struct DatabaseHandle {
    connection: Option<Connection>,
    path: Option<PathBuf>,
    key: String,
    schema: DatabaseSchema,
    version: i64,
    transaction_active: bool,
}

/// Owns open native SQLite handles. A database name has one live writer per
/// engine process, in addition to SQLite's own file lock for other processes.
#[derive(Default)]
pub struct DatabaseStore {
    handles: HashMap<u64, DatabaseHandle>,
    active_keys: HashMap<String, u64>,
    next_handle: u64,
}

impl DatabaseStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Execute one frozen protocol operation. Persistent opens require an
    /// absolute platform app-data root; there is no cwd or volatile fallback.
    pub fn execute(
        &mut self,
        op: u32,
        handle: f64,
        args: Vec<DatabaseValue>,
        app_data_root: Option<&Path>,
    ) -> DatabaseResponse {
        if op == 1 {
            return self.open(args, app_data_root);
        }
        if !valid_handle(handle) {
            return DatabaseResponse::status(DatabaseStatus::NotOpen);
        }
        let handle_id = handle as u64;
        match op {
            2 => self.close(handle_id),
            3 => self.insert(handle_id, args),
            4 => self.select(handle_id, args),
            5 => self.update(handle_id, args),
            6 => self.delete(handle_id, args),
            7 => self.begin(handle_id),
            8 => self.commit(handle_id),
            9 => self.rollback(handle_id),
            10 => self.migrate(handle_id, args),
            11 => self.export(handle_id),
            12 => self.import(handle_id, args),
            _ => DatabaseResponse::status(DatabaseStatus::Unsupported),
        }
    }

    fn open(&mut self, args: Vec<DatabaseValue>, app_data_root: Option<&Path>) -> DatabaseResponse {
        if args.len() != 4 {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let Some(app_id) = as_string(&args[0]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidNamespace);
        };
        let Some(name) = as_string(&args[1]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidNamespace);
        };
        if !valid_namespace(app_id) || !valid_namespace(name) {
            return DatabaseResponse::status(DatabaseStatus::InvalidNamespace);
        }
        let in_memory = match args[2] {
            DatabaseValue::Boolean(value) => value,
            _ => return DatabaseResponse::status(DatabaseStatus::InvalidData),
        };
        let schema = match parse_schema(&args[3]) {
            Some(schema) => schema,
            None => return DatabaseResponse::status(DatabaseStatus::InvalidSchema),
        };
        let key = format!("{app_id}\0{name}");
        if self.active_keys.contains_key(&key) {
            return DatabaseResponse::status(DatabaseStatus::Busy);
        }

        let path = if in_memory {
            None
        } else {
            let Some(root) = app_data_root else {
                return DatabaseResponse::status(DatabaseStatus::StorageError);
            };
            match database_path(root, app_id, name) {
                Ok(path) => Some(path),
                Err(status) => return DatabaseResponse::status(status),
            }
        };
        let opened = match path.as_ref() {
            Some(path) => Connection::open(path),
            None => Connection::open_in_memory(),
        };
        let connection = match opened {
            Ok(connection) => connection,
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(
                    &error,
                    DatabaseStatus::StorageError,
                ))
            }
        };
        if connection.busy_timeout(Duration::ZERO).is_err() {
            return DatabaseResponse::status(DatabaseStatus::StorageError);
        }
        if let Err(error) = configure_connection(&connection) {
            return DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::StorageError));
        }
        match integrity_check(&connection) {
            Ok(true) => {}
            Ok(false) => return DatabaseResponse::status(DatabaseStatus::CorruptData),
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::CorruptData))
            }
        }
        let version: i64 = match connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
        {
            Ok(version) if version >= 0 => version,
            Ok(_) => return DatabaseResponse::status(DatabaseStatus::UnsupportedVersion),
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::CorruptData))
            }
        };
        if self.next_handle >= 9_007_199_254_740_990 {
            return DatabaseResponse::status(DatabaseStatus::StorageError);
        }
        self.next_handle += 1;
        let handle = self.next_handle;
        self.active_keys.insert(key.clone(), handle);
        self.handles.insert(
            handle,
            DatabaseHandle {
                connection: Some(connection),
                path,
                key,
                schema,
                version,
                transaction_active: false,
            },
        );
        DatabaseResponse::ok(vec![
            DatabaseValue::Number(handle as f64),
            DatabaseValue::Number(version as f64),
        ])
    }

    fn close(&mut self, handle_id: u64) -> DatabaseResponse {
        let Some(mut handle) = self.handles.remove(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if let Some(connection) = handle.connection.take() {
            if handle.transaction_active {
                let _ = connection.execute_batch("ROLLBACK");
            }
            drop(connection);
        }
        self.active_keys.remove(&handle.key);
        DatabaseResponse::ok(Vec::new())
    }

    fn insert(&mut self, handle_id: u64, args: Vec<DatabaseValue>) -> DatabaseResponse {
        if args.len() != 2 {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        let Some(table_name) = as_string(&args[0]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        };
        let Some(table_schema) = handle.schema.tables.get(table_name).cloned() else {
            return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
        };
        let Some(mut values) = as_object(&args[1]).cloned() else {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        };
        if values.is_empty() { /* DEFAULT VALUES is valid for auto-generated rows. */ }
        for (column_name, column) in &table_schema.columns {
            if !values.contains_key(column_name) && column.has_default {
                values.insert(
                    column_name.clone(),
                    column.default.clone().unwrap_or(DatabaseValue::Null),
                );
            }
        }
        if !validate_value_map(&table_schema, &values, true) {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let (sql, params) = match build_insert_sql(table_name, &table_schema, &values) {
            Ok(value) => value,
            Err(status) => return DatabaseResponse::status(status),
        };
        let Some(connection) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if let Err(error) = connection.execute(&sql, params_from_iter(params.iter())) {
            return DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::InvalidData));
        }
        let row_id = connection.last_insert_rowid();
        if row_id.unsigned_abs() as f64 > MAX_SAFE_INTEGER {
            return DatabaseResponse::status(DatabaseStatus::StorageError);
        }
        DatabaseResponse::ok(vec![DatabaseValue::Number(row_id as f64)])
    }

    fn select(&mut self, handle_id: u64, args: Vec<DatabaseValue>) -> DatabaseResponse {
        if args.len() != 3 {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        let Some(table_name) = as_string(&args[0]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        };
        let Some(table_schema) = handle.schema.tables.get(table_name).cloned() else {
            return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
        };
        let Some(columns) = as_array(&args[2]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
        };
        let mut selected = Vec::with_capacity(columns.len());
        for column in columns {
            let Some(name) = as_string(column) else {
                return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
            };
            let Some(descriptor) = table_schema.columns.get(name) else {
                return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
            };
            selected.push((name.to_string(), descriptor.clone()));
        }
        if selected.is_empty() {
            return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
        }
        let options = match parse_select_options(&args[1], &table_schema) {
            Ok(options) => options,
            Err(status) => return DatabaseResponse::status(status),
        };
        let where_clause = match build_filter(options.where_value.as_ref(), &table_schema, 0) {
            Ok(value) => value,
            Err(status) => return DatabaseResponse::status(status),
        };
        let mut sql = format!(
            "SELECT {} FROM {}",
            selected
                .iter()
                .map(|(name, _)| quote_identifier(name))
                .collect::<Vec<_>>()
                .join(", "),
            quote_identifier(table_name)
        );
        let mut params = where_clause.params;
        if !where_clause.sql.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&where_clause.sql);
        }
        for (idx, (column, descending)) in options.order_by.iter().enumerate() {
            if idx == 0 {
                sql.push_str(" ORDER BY ");
            } else {
                sql.push_str(", ");
            }
            sql.push_str(&quote_identifier(column));
            sql.push_str(if *descending { " DESC" } else { " ASC" });
        }
        if let Some(limit) = options.limit {
            sql.push_str(" LIMIT ?");
            params.push(SqlValue::Integer(limit));
        }
        if let Some(offset) = options.offset {
            if options.limit.is_none() {
                sql.push_str(" LIMIT -1");
            }
            sql.push_str(" OFFSET ?");
            params.push(SqlValue::Integer(offset));
        }
        let Some(connection) = handle.connection.as_ref() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        let mut statement = match connection.prepare(&sql) {
            Ok(statement) => statement,
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(
                    &error,
                    DatabaseStatus::InvalidQuery,
                ))
            }
        };
        let mut cursor = match statement.query(params_from_iter(params.iter())) {
            Ok(cursor) => cursor,
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(
                    &error,
                    DatabaseStatus::InvalidQuery,
                ))
            }
        };
        let mut flattened = Vec::new();
        let mut rows = 0usize;
        loop {
            let row = match cursor.next() {
                Ok(Some(row)) => row,
                Ok(None) => break,
                Err(error) => {
                    return DatabaseResponse::status(map_sql_error(
                        &error,
                        DatabaseStatus::InvalidQuery,
                    ))
                }
            };
            for (index, (_, column)) in selected.iter().enumerate() {
                let value = match row.get_ref(index) {
                    Ok(value) => match database_value_from_sql(value, column) {
                        Ok(value) => value,
                        Err(status) => return DatabaseResponse::status(status),
                    },
                    Err(error) => {
                        return DatabaseResponse::status(map_sql_error(
                            &error,
                            DatabaseStatus::CorruptData,
                        ))
                    }
                };
                flattened.push(value);
            }
            rows += 1;
            if flattened.len() > MAX_WIRE_VALUES {
                return DatabaseResponse::status(DatabaseStatus::Unsupported);
            }
        }
        DatabaseResponse::rows(rows, flattened)
    }

    fn update(&mut self, handle_id: u64, args: Vec<DatabaseValue>) -> DatabaseResponse {
        if args.len() != 3 {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        let Some(table_name) = as_string(&args[0]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        };
        let Some(table_schema) = handle.schema.tables.get(table_name).cloned() else {
            return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
        };
        let Some(values) = as_object(&args[1]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        };
        if values.is_empty() || !validate_value_map(&table_schema, values, false) {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let filter = match build_filter(Some(&args[2]), &table_schema, 0) {
            Ok(filter) => filter,
            Err(status) => return DatabaseResponse::status(status),
        };
        let mut assignments = Vec::with_capacity(values.len());
        let mut params = Vec::with_capacity(values.len() + filter.params.len());
        for (column, value) in values {
            let Some(descriptor) = table_schema.columns.get(column) else {
                return DatabaseResponse::status(DatabaseStatus::InvalidData);
            };
            assignments.push(format!("{} = ?", quote_identifier(column)));
            params.push(match to_sql_value(value, descriptor) {
                Ok(value) => value,
                Err(status) => return DatabaseResponse::status(status),
            });
        }
        params.extend(filter.params);
        let mut sql = format!(
            "UPDATE {} SET {}",
            quote_identifier(table_name),
            assignments.join(", ")
        );
        if !filter.sql.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&filter.sql);
        }
        let Some(connection) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        match connection.execute(&sql, params_from_iter(params.iter())) {
            Ok(affected) => DatabaseResponse::ok(vec![DatabaseValue::Number(affected as f64)]),
            Err(error) => {
                DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::InvalidData))
            }
        }
    }

    fn delete(&mut self, handle_id: u64, args: Vec<DatabaseValue>) -> DatabaseResponse {
        if args.len() != 2 {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        let Some(table_name) = as_string(&args[0]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        };
        let Some(table_schema) = handle.schema.tables.get(table_name).cloned() else {
            return DatabaseResponse::status(DatabaseStatus::InvalidQuery);
        };
        let filter = match build_filter(Some(&args[1]), &table_schema, 0) {
            Ok(filter) => filter,
            Err(status) => return DatabaseResponse::status(status),
        };
        let mut sql = format!("DELETE FROM {}", quote_identifier(table_name));
        if !filter.sql.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&filter.sql);
        }
        let Some(connection) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        match connection.execute(&sql, params_from_iter(filter.params.iter())) {
            Ok(affected) => DatabaseResponse::ok(vec![DatabaseValue::Number(affected as f64)]),
            Err(error) => {
                DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::InvalidQuery))
            }
        }
    }

    fn begin(&mut self, handle_id: u64) -> DatabaseResponse {
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if handle.transaction_active {
            return DatabaseResponse::status(DatabaseStatus::Busy);
        }
        let Some(connection) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        match connection.execute_batch("BEGIN IMMEDIATE") {
            Ok(()) => {
                handle.transaction_active = true;
                DatabaseResponse::ok(Vec::new())
            }
            Err(error) => {
                DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::StorageError))
            }
        }
    }

    fn commit(&mut self, handle_id: u64) -> DatabaseResponse {
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if !handle.transaction_active {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        }
        let Some(connection) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        match connection.execute_batch("COMMIT") {
            Ok(()) => {
                handle.transaction_active = false;
                DatabaseResponse::ok(Vec::new())
            }
            Err(error) => {
                DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::StorageError))
            }
        }
    }

    fn rollback(&mut self, handle_id: u64) -> DatabaseResponse {
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if !handle.transaction_active {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        }
        let Some(connection) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        match connection.execute_batch("ROLLBACK") {
            Ok(()) => {
                handle.transaction_active = false;
                DatabaseResponse::ok(Vec::new())
            }
            Err(error) => {
                DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::StorageError))
            }
        }
    }

    fn migrate(&mut self, handle_id: u64, args: Vec<DatabaseValue>) -> DatabaseResponse {
        if args.len() != 2 {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if handle.transaction_active {
            return DatabaseResponse::status(DatabaseStatus::Busy);
        }
        let Some(version) = as_exact_i64(&args[0]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidSchema);
        };
        if version <= 0 || version > i32::MAX as i64 {
            return DatabaseResponse::status(DatabaseStatus::UnsupportedVersion);
        }
        if version <= handle.version {
            return DatabaseResponse::status(DatabaseStatus::UnsupportedVersion);
        }
        let Some(steps) = as_array(&args[1]) else {
            return DatabaseResponse::status(DatabaseStatus::InvalidSchema);
        };
        if steps.is_empty() || steps.len() > MAX_WIRE_VALUES {
            return DatabaseResponse::status(DatabaseStatus::InvalidSchema);
        }
        let Some(connection) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        let transaction = match connection.transaction_with_behavior(TransactionBehavior::Immediate)
        {
            Ok(transaction) => transaction,
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(
                    &error,
                    DatabaseStatus::MigrationError,
                ))
            }
        };
        for step in steps {
            if let Err(status) = apply_migration_step(&transaction, step) {
                drop(transaction);
                return DatabaseResponse::status(if status == DatabaseStatus::Busy {
                    status
                } else {
                    DatabaseStatus::MigrationError
                });
            }
        }
        if transaction
            .pragma_update(None, "user_version", version)
            .is_err()
        {
            drop(transaction);
            return DatabaseResponse::status(DatabaseStatus::MigrationError);
        }
        match transaction.commit() {
            Ok(()) => {
                handle.version = version;
                DatabaseResponse::ok(Vec::new())
            }
            Err(error) => {
                DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::MigrationError))
            }
        }
    }

    fn export(&mut self, handle_id: u64) -> DatabaseResponse {
        let Some(handle) = self.handles.get(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if handle.transaction_active {
            return DatabaseResponse::status(DatabaseStatus::Busy);
        }
        let Some(connection) = handle.connection.as_ref() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        match connection.serialize(MAIN_DB) {
            Ok(image) if image.len() <= MAX_IMPORT_BYTES => {
                DatabaseResponse::ok(vec![DatabaseValue::Bytes(image.to_vec())])
            }
            Ok(_) => DatabaseResponse::status(DatabaseStatus::Unsupported),
            Err(error) => {
                DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::StorageError))
            }
        }
    }

    fn import(&mut self, handle_id: u64, args: Vec<DatabaseValue>) -> DatabaseResponse {
        if args.len() != 1 {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        }
        let Some(DatabaseValue::Bytes(bytes)) = args.first() else {
            return DatabaseResponse::status(DatabaseStatus::InvalidData);
        };
        if bytes.len() < 100
            || bytes.len() > MAX_IMPORT_BYTES
            || !bytes.starts_with(b"SQLite format 3\0")
        {
            return DatabaseResponse::status(DatabaseStatus::CorruptData);
        }
        let Some(handle) = self.handles.get_mut(&handle_id) else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        if handle.transaction_active {
            return DatabaseResponse::status(DatabaseStatus::Busy);
        }
        let (validated, image_version) = match validate_database_image(bytes) {
            Ok(value) => value,
            Err(status) => return DatabaseResponse::status(status),
        };
        if image_version != handle.version {
            return DatabaseResponse::status(DatabaseStatus::UnsupportedVersion);
        }
        match database_schema_matches(&validated, &handle.schema) {
            Ok(true) => {}
            Ok(false) | Err(_) => return DatabaseResponse::status(DatabaseStatus::CorruptData),
        }
        let Some(current) = handle.connection.as_ref() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        match database_physical_schema_matches(&validated, current) {
            Ok(true) => {}
            Ok(false) | Err(_) => return DatabaseResponse::status(DatabaseStatus::CorruptData),
        }
        if handle.path.is_none() {
            handle.connection = Some(validated);
            return DatabaseResponse::ok(Vec::new());
        }
        let Some(destination) = handle.connection.as_mut() else {
            return DatabaseResponse::status(DatabaseStatus::Closed);
        };
        let lock = match destination.transaction_with_behavior(TransactionBehavior::Immediate) {
            Ok(lock) => lock,
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(
                    &error,
                    DatabaseStatus::StorageError,
                ))
            }
        };
        if let Err(error) = lock.rollback() {
            return DatabaseResponse::status(map_sql_error(&error, DatabaseStatus::StorageError));
        }
        let backup = match Backup::new(&validated, destination) {
            Ok(backup) => backup,
            Err(error) => {
                return DatabaseResponse::status(map_sql_error(
                    &error,
                    DatabaseStatus::StorageError,
                ))
            }
        };
        loop {
            match backup.step(128) {
                Ok(StepResult::Done) => return DatabaseResponse::ok(Vec::new()),
                Ok(StepResult::More) => {}
                Ok(StepResult::Busy | StepResult::Locked) => {
                    return DatabaseResponse::status(DatabaseStatus::Busy)
                }
                Ok(_) => return DatabaseResponse::status(DatabaseStatus::Busy),
                Err(error) => {
                    return DatabaseResponse::status(map_sql_error(
                        &error,
                        DatabaseStatus::StorageError,
                    ))
                }
            }
        }
    }
}

fn configure_connection(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;")?;
    let _: String = connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
    Ok(())
}

fn integrity_check(connection: &Connection) -> rusqlite::Result<bool> {
    let result: String = connection.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
    Ok(result == "ok")
}

fn database_path(root: &Path, app_id: &str, name: &str) -> Result<PathBuf, DatabaseStatus> {
    if !root.is_absolute() {
        return Err(DatabaseStatus::StorageError);
    }
    fs::create_dir_all(root).map_err(|_| DatabaseStatus::StorageError)?;
    let canonical_root = fs::canonicalize(root).map_err(|_| DatabaseStatus::StorageError)?;
    let app_dir = root.join(app_id);
    fs::create_dir_all(&app_dir).map_err(|_| DatabaseStatus::StorageError)?;
    match fs::symlink_metadata(&app_dir) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        _ => return Err(DatabaseStatus::StorageError),
    }
    let canonical_app = fs::canonicalize(&app_dir).map_err(|_| DatabaseStatus::StorageError)?;
    if !canonical_app.starts_with(&canonical_root) {
        return Err(DatabaseStatus::StorageError);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&canonical_app, fs::Permissions::from_mode(0o700))
            .map_err(|_| DatabaseStatus::StorageError)?;
    }
    let path = canonical_app.join(format!("{name}.sqlite3"));
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err(DatabaseStatus::StorageError)
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(DatabaseStatus::StorageError),
    }
    Ok(path)
}

fn valid_handle(value: f64) -> bool {
    value.is_finite() && (1.0..=MAX_SAFE_INTEGER).contains(&value) && value.fract() == 0.0
}

fn valid_namespace(value: &str) -> bool {
    if value.is_empty() || value.len() > 128 || value.contains("..") {
        return false;
    }
    let bytes = value.as_bytes();
    bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn valid_identifier(value: &str) -> bool {
    if value.is_empty() || value.len() > 64 {
        return false;
    }
    let bytes = value.as_bytes();
    (bytes[0].is_ascii_alphabetic() || bytes[0] == b'_')
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
}

fn quote_identifier(value: &str) -> String {
    format!("\"{value}\"")
}

fn as_string(value: &DatabaseValue) -> Option<&str> {
    match value {
        DatabaseValue::String(value) => Some(value),
        _ => None,
    }
}

fn as_array(value: &DatabaseValue) -> Option<&[DatabaseValue]> {
    match value {
        DatabaseValue::Array(value) => Some(value),
        _ => None,
    }
}

fn as_object(value: &DatabaseValue) -> Option<&BTreeMap<String, DatabaseValue>> {
    match value {
        DatabaseValue::Object(value) => Some(value),
        _ => None,
    }
}

fn as_exact_i64(value: &DatabaseValue) -> Option<i64> {
    match value {
        DatabaseValue::Number(value)
            if value.is_finite() && value.fract() == 0.0 && value.abs() <= i32::MAX as f64 =>
        {
            Some(*value as i64)
        }
        _ => None,
    }
}

fn object_field<'a>(
    object: &'a BTreeMap<String, DatabaseValue>,
    key: &str,
) -> Option<&'a DatabaseValue> {
    object.get(key)
}

fn object_string<'a>(object: &'a BTreeMap<String, DatabaseValue>, key: &str) -> Option<&'a str> {
    object_field(object, key).and_then(as_string)
}

fn optional_bool(object: &BTreeMap<String, DatabaseValue>, key: &str) -> Result<bool, ()> {
    match object.get(key) {
        None => Ok(false),
        Some(DatabaseValue::Boolean(value)) => Ok(*value),
        _ => Err(()),
    }
}

fn parse_column(value: &DatabaseValue) -> Option<ColumnSchema> {
    let object = as_object(value)?;
    if object
        .keys()
        .any(|key| !matches!(key.as_str(), "kind" | "options"))
    {
        return None;
    }
    let kind = match object_string(object, "kind")? {
        "integer" => ColumnKind::Integer,
        "real" => ColumnKind::Real,
        "text" => ColumnKind::Text,
        "blob" => ColumnKind::Blob,
        "boolean" => ColumnKind::Boolean,
        _ => return None,
    };
    let options = as_object(object.get("options")?)?;
    if options.keys().any(|key| {
        !matches!(
            key.as_str(),
            "primaryKey" | "autoIncrement" | "notNull" | "nullable" | "unique" | "default"
        )
    }) {
        return None;
    }
    let primary_key = optional_bool(options, "primaryKey").ok()?;
    let auto_increment = optional_bool(options, "autoIncrement").ok()?;
    let not_null = optional_bool(options, "notNull").ok()?;
    let nullable = optional_bool(options, "nullable").ok()?;
    let unique = optional_bool(options, "unique").ok()?;
    if auto_increment && (!primary_key || kind != ColumnKind::Integer)
        || nullable && (not_null || primary_key)
    {
        return None;
    }
    let has_default = options.contains_key("default");
    let default = options.get("default").cloned();
    if let Some(default) = &default {
        if matches!(default, DatabaseValue::Null) {
            if not_null || primary_key {
                return None;
            }
        } else if !valid_column_value(&kind, default) {
            return None;
        }
    }
    Some(ColumnSchema {
        kind,
        primary_key,
        auto_increment,
        not_null,
        unique,
        default,
        has_default,
    })
}

fn parse_schema(value: &DatabaseValue) -> Option<DatabaseSchema> {
    let schema_object = as_object(value)?;
    if schema_object.is_empty() {
        return None;
    }
    let mut tables = BTreeMap::new();
    let mut all_indexes = Vec::new();
    for (table_name, table_value) in schema_object {
        if !valid_identifier(table_name) {
            return None;
        }
        let table = as_object(table_value)?;
        if table
            .keys()
            .any(|key| !matches!(key.as_str(), "columns" | "indexes"))
        {
            return None;
        }
        let columns_value = as_object(table.get("columns")?)?;
        if columns_value.is_empty() {
            return None;
        }
        let mut columns = BTreeMap::new();
        let mut primary_count = 0;
        for (column_name, descriptor) in columns_value {
            if !valid_identifier(column_name) {
                return None;
            }
            let column = parse_column(descriptor)?;
            if column.primary_key {
                primary_count += 1;
            }
            columns.insert(column_name.clone(), column);
        }
        if primary_count > 1 {
            return None;
        }
        match table.get("indexes") {
            None | Some(DatabaseValue::Null) => {}
            Some(DatabaseValue::Array(items)) => {
                for item in items {
                    let object = as_object(item)?;
                    let name = object_string(object, "name")?;
                    if !valid_identifier(name) {
                        return None;
                    }
                    if object
                        .keys()
                        .any(|key| !matches!(key.as_str(), "name" | "columns" | "unique"))
                    {
                        return None;
                    }
                    let unique = optional_bool(object, "unique").ok()?;
                    let columns_value = as_array(object.get("columns")?)?;
                    if columns_value.is_empty() {
                        return None;
                    }
                    for column in columns_value {
                        let column = as_string(column)?;
                        if !columns.contains_key(column) {
                            return None;
                        }
                    }
                    let _ = unique;
                    all_indexes.push(name.to_string());
                }
            }
            _ => return None,
        }
        tables.insert(table_name.clone(), TableSchema { columns });
    }
    all_indexes.sort();
    if all_indexes.windows(2).any(|pair| pair[0] == pair[1])
        || tables
            .keys()
            .any(|name| all_indexes.binary_search(name).is_ok())
    {
        return None;
    }
    Some(DatabaseSchema { tables })
}

fn valid_column_value(kind: &ColumnKind, value: &DatabaseValue) -> bool {
    match (kind, value) {
        (_, DatabaseValue::Null) => true,
        (ColumnKind::Integer, DatabaseValue::Number(value)) => {
            value.is_finite() && value.fract() == 0.0 && value.abs() <= MAX_SAFE_INTEGER
        }
        (ColumnKind::Real, DatabaseValue::Number(value)) => value.is_finite(),
        (ColumnKind::Text, DatabaseValue::String(_)) => true,
        (ColumnKind::Blob, DatabaseValue::Bytes(_)) => true,
        (ColumnKind::Boolean, DatabaseValue::Boolean(_)) => true,
        _ => false,
    }
}

fn validate_value_map(
    schema: &TableSchema,
    values: &BTreeMap<String, DatabaseValue>,
    require_required: bool,
) -> bool {
    for (name, value) in values {
        let Some(column) = schema.columns.get(name) else {
            return false;
        };
        if !valid_column_value(&column.kind, value)
            || matches!(value, DatabaseValue::Null) && (column.not_null || column.primary_key)
        {
            return false;
        }
    }
    if require_required {
        for (name, column) in &schema.columns {
            if !column.auto_increment
                && !column.has_default
                && (column.not_null || column.primary_key)
                && !values.contains_key(name)
            {
                return false;
            }
        }
    }
    true
}

fn parse_select_options(
    value: &DatabaseValue,
    schema: &TableSchema,
) -> Result<SelectOptions, DatabaseStatus> {
    let object = as_object(value).ok_or(DatabaseStatus::InvalidQuery)?;
    if object
        .keys()
        .any(|key| !matches!(key.as_str(), "where" | "orderBy" | "limit" | "offset"))
    {
        return Err(DatabaseStatus::InvalidQuery);
    }
    let limit = object
        .get("limit")
        .map(as_nonnegative_i64)
        .transpose()
        .map_err(|_| DatabaseStatus::InvalidQuery)?;
    let offset = object
        .get("offset")
        .map(as_nonnegative_i64)
        .transpose()
        .map_err(|_| DatabaseStatus::InvalidQuery)?;
    let mut order_by = Vec::new();
    if let Some(value) = object.get("orderBy") {
        let array = as_array(value).ok_or(DatabaseStatus::InvalidQuery)?;
        for item in array {
            let order = as_object(item).ok_or(DatabaseStatus::InvalidQuery)?;
            if order
                .keys()
                .any(|key| !matches!(key.as_str(), "column" | "direction"))
            {
                return Err(DatabaseStatus::InvalidQuery);
            }
            let column = object_string(order, "column").ok_or(DatabaseStatus::InvalidQuery)?;
            if !schema.columns.contains_key(column) {
                return Err(DatabaseStatus::InvalidQuery);
            }
            let descending = match order.get("direction") {
                None => false,
                Some(DatabaseValue::String(direction)) if direction == "asc" => false,
                Some(DatabaseValue::String(direction)) if direction == "desc" => true,
                _ => return Err(DatabaseStatus::InvalidQuery),
            };
            order_by.push((column.to_string(), descending));
        }
    }
    Ok(SelectOptions {
        where_value: object.get("where").cloned(),
        order_by,
        limit,
        offset,
    })
}

fn as_nonnegative_i64(value: &DatabaseValue) -> Result<i64, ()> {
    match value {
        DatabaseValue::Number(number)
            if number.is_finite()
                && number.fract() == 0.0
                && *number >= 0.0
                && *number <= MAX_SAFE_INTEGER =>
        {
            Ok(*number as i64)
        }
        _ => Err(()),
    }
}

struct SelectOptions {
    where_value: Option<DatabaseValue>,
    order_by: Vec<(String, bool)>,
    limit: Option<i64>,
    offset: Option<i64>,
}

struct BuiltFilter {
    sql: String,
    params: Vec<SqlValue>,
}

fn build_filter(
    value: Option<&DatabaseValue>,
    schema: &TableSchema,
    depth: usize,
) -> Result<BuiltFilter, DatabaseStatus> {
    let Some(value) = value else {
        return Ok(BuiltFilter {
            sql: String::new(),
            params: Vec::new(),
        });
    };
    if depth > MAX_WIRE_DEPTH {
        return Err(DatabaseStatus::InvalidQuery);
    }
    let object = as_object(value).ok_or(DatabaseStatus::InvalidQuery)?;
    let mut clauses = Vec::new();
    let mut params = Vec::new();
    for (key, condition) in object {
        if key == "and" || key == "or" {
            let children = as_array(condition).ok_or(DatabaseStatus::InvalidQuery)?;
            if children.is_empty() {
                return Err(DatabaseStatus::InvalidQuery);
            }
            let mut child_sql = Vec::with_capacity(children.len());
            for child in children {
                let built = build_filter(Some(child), schema, depth + 1)?;
                child_sql.push(format!(
                    "({})",
                    if built.sql.is_empty() {
                        "1"
                    } else {
                        &built.sql
                    }
                ));
                params.extend(built.params);
            }
            let joiner = if key == "and" { " AND " } else { " OR " };
            clauses.push(format!("({})", child_sql.join(joiner)));
            continue;
        }
        if key == "not" {
            let built = build_filter(Some(condition), schema, depth + 1)?;
            clauses.push(format!(
                "NOT ({})",
                if built.sql.is_empty() {
                    "1"
                } else {
                    &built.sql
                }
            ));
            params.extend(built.params);
            continue;
        }
        let column = schema
            .columns
            .get(key)
            .ok_or(DatabaseStatus::InvalidQuery)?;
        let comparisons = as_object(condition).ok_or(DatabaseStatus::InvalidQuery)?;
        if comparisons.len() != 1 {
            return Err(DatabaseStatus::InvalidQuery);
        }
        let (operator, value) = comparisons
            .iter()
            .next()
            .ok_or(DatabaseStatus::InvalidQuery)?;
        let identifier = quote_identifier(key);
        if operator == "isNull" {
            let DatabaseValue::Boolean(is_null) = value else {
                return Err(DatabaseStatus::InvalidQuery);
            };
            clauses.push(format!(
                "{identifier} IS {}NULL",
                if *is_null { "" } else { "NOT " }
            ));
            continue;
        }
        if operator == "in" {
            let values = as_array(value).ok_or(DatabaseStatus::InvalidQuery)?;
            if values.is_empty() {
                return Err(DatabaseStatus::InvalidQuery);
            }
            let mut placeholders = Vec::with_capacity(values.len());
            for item in values {
                if !valid_comparison(column, item) {
                    return Err(DatabaseStatus::InvalidQuery);
                }
                placeholders.push("?");
                params.push(to_sql_value(item, column).map_err(|_| DatabaseStatus::InvalidQuery)?);
            }
            clauses.push(format!("{identifier} IN ({})", placeholders.join(", ")));
            continue;
        }
        let sql_op = match operator.as_str() {
            "eq" => "=",
            "ne" => "!=",
            "gt" => ">",
            "gte" => ">=",
            "lt" => "<",
            "lte" => "<=",
            _ => return Err(DatabaseStatus::InvalidQuery),
        };
        if !valid_comparison(column, value) {
            return Err(DatabaseStatus::InvalidQuery);
        }
        if matches!(value, DatabaseValue::Null) && (operator == "eq" || operator == "ne") {
            clauses.push(format!(
                "{identifier} IS {}NULL",
                if operator == "ne" { "NOT " } else { "" }
            ));
        } else {
            clauses.push(format!("{identifier} {sql_op} ?"));
            params.push(to_sql_value(value, column).map_err(|_| DatabaseStatus::InvalidQuery)?);
        }
    }
    Ok(BuiltFilter {
        sql: clauses.join(" AND "),
        params,
    })
}

fn valid_comparison(column: &ColumnSchema, value: &DatabaseValue) -> bool {
    valid_column_value(&column.kind, value)
        && !(matches!(value, DatabaseValue::Null) && (column.not_null || column.primary_key))
}

fn to_sql_value(value: &DatabaseValue, column: &ColumnSchema) -> Result<SqlValue, DatabaseStatus> {
    if !valid_comparison(column, value) {
        return Err(DatabaseStatus::InvalidData);
    }
    match value {
        DatabaseValue::Null => Ok(SqlValue::Null),
        DatabaseValue::Number(value) if column.kind == ColumnKind::Integer => {
            Ok(SqlValue::Integer(*value as i64))
        }
        DatabaseValue::Number(value) => Ok(SqlValue::Real(*value)),
        DatabaseValue::String(value) => Ok(SqlValue::Text(value.clone())),
        DatabaseValue::Boolean(value) => Ok(SqlValue::Integer(i64::from(*value))),
        DatabaseValue::Bytes(value) => Ok(SqlValue::Blob(value.clone())),
        _ => Err(DatabaseStatus::InvalidData),
    }
}

fn build_insert_sql(
    table: &str,
    schema: &TableSchema,
    values: &BTreeMap<String, DatabaseValue>,
) -> Result<(String, Vec<SqlValue>), DatabaseStatus> {
    if values.is_empty() {
        return Ok((
            format!("INSERT INTO {} DEFAULT VALUES", quote_identifier(table)),
            Vec::new(),
        ));
    }
    let mut columns = Vec::with_capacity(values.len());
    let mut params = Vec::with_capacity(values.len());
    for (name, value) in values {
        let column = schema
            .columns
            .get(name)
            .ok_or(DatabaseStatus::InvalidData)?;
        columns.push(quote_identifier(name));
        params.push(to_sql_value(value, column)?);
    }
    let placeholders = vec!["?"; columns.len()].join(", ");
    Ok((
        format!(
            "INSERT INTO {} ({}) VALUES ({placeholders})",
            quote_identifier(table),
            columns.join(", ")
        ),
        params,
    ))
}

fn database_value_from_sql(
    value: ValueRef<'_>,
    column: &ColumnSchema,
) -> Result<DatabaseValue, DatabaseStatus> {
    match value {
        ValueRef::Null => {
            if column.not_null || column.primary_key {
                Err(DatabaseStatus::CorruptData)
            } else {
                Ok(DatabaseValue::Null)
            }
        }
        ValueRef::Integer(value) => match column.kind {
            ColumnKind::Integer if (value as f64).abs() <= MAX_SAFE_INTEGER => {
                Ok(DatabaseValue::Number(value as f64))
            }
            ColumnKind::Real => Ok(DatabaseValue::Number(value as f64)),
            ColumnKind::Boolean if value == 0 || value == 1 => {
                Ok(DatabaseValue::Boolean(value != 0))
            }
            _ => Err(DatabaseStatus::CorruptData),
        },
        ValueRef::Real(value) if value.is_finite() => match column.kind {
            ColumnKind::Real => Ok(DatabaseValue::Number(value)),
            ColumnKind::Integer if value.fract() == 0.0 && value.abs() <= MAX_SAFE_INTEGER => {
                Ok(DatabaseValue::Number(value))
            }
            _ => Err(DatabaseStatus::CorruptData),
        },
        ValueRef::Text(value) if column.kind == ColumnKind::Text => std::str::from_utf8(value)
            .map(|value| DatabaseValue::String(value.to_string()))
            .map_err(|_| DatabaseStatus::CorruptData),
        ValueRef::Blob(value) if column.kind == ColumnKind::Blob => {
            Ok(DatabaseValue::Bytes(value.to_vec()))
        }
        _ => Err(DatabaseStatus::CorruptData),
    }
}

fn map_sql_error(error: &SqlError, fallback: DatabaseStatus) -> DatabaseStatus {
    match error {
        SqlError::SqliteFailure(failure, message) => match failure.code {
            ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => DatabaseStatus::Busy,
            ErrorCode::ConstraintViolation => DatabaseStatus::ConstraintError,
            ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase => DatabaseStatus::CorruptData,
            ErrorCode::DiskFull => DatabaseStatus::QuotaExceeded,
            ErrorCode::ReadOnly
            | ErrorCode::PermissionDenied
            | ErrorCode::CannotOpen
            | ErrorCode::SystemIoFailure => DatabaseStatus::StorageError,
            ErrorCode::Unknown
                if message
                    .as_deref()
                    .is_some_and(|message| message.contains("no such table")) =>
            {
                DatabaseStatus::NotFound
            }
            _ => fallback,
        },
        SqlError::QueryReturnedNoRows => DatabaseStatus::NotFound,
        SqlError::ToSqlConversionFailure(_) | SqlError::InvalidParameterCount(_, _) => {
            DatabaseStatus::InvalidData
        }
        _ => fallback,
    }
}

fn apply_migration_step(
    connection: &Connection,
    value: &DatabaseValue,
) -> Result<(), DatabaseStatus> {
    let step = as_object(value).ok_or(DatabaseStatus::InvalidSchema)?;
    let op = object_string(step, "op").ok_or(DatabaseStatus::InvalidSchema)?;
    let table = object_string(step, "table").ok_or(DatabaseStatus::InvalidSchema)?;
    let name = object_string(step, "name").ok_or(DatabaseStatus::InvalidSchema)?;
    let values = as_object(step.get("values").ok_or(DatabaseStatus::InvalidSchema)?)
        .ok_or(DatabaseStatus::InvalidSchema)?;
    if !valid_identifier(table) || (!name.is_empty() && !valid_identifier(name)) {
        return Err(DatabaseStatus::InvalidSchema);
    }
    match op {
        "createTable" => {
            let columns = values
                .iter()
                .map(|(name, descriptor)| Some((name.clone(), parse_column(descriptor)?)))
                .collect::<Option<BTreeMap<_, _>>>()
                .ok_or(DatabaseStatus::InvalidSchema)?;
            validate_column_set(&columns)?;
            let schema = TableSchema { columns };
            connection
                .execute_batch(&create_table_sql(table, &schema))
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
            Ok(())
        }
        "dropTable" => connection
            .execute_batch(&format!("DROP TABLE {}", quote_identifier(table)))
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError)),
        "addColumn" => {
            let descriptor = values
                .get("descriptor")
                .ok_or(DatabaseStatus::InvalidSchema)?;
            let column = parse_column(descriptor).ok_or(DatabaseStatus::InvalidSchema)?;
            rebuild_table(connection, table, Some((name, column)), None)
        }
        "dropColumn" => rebuild_table(connection, table, None, Some(name)),
        "createIndex" => {
            let descriptor = as_object(
                values
                    .get("descriptor")
                    .ok_or(DatabaseStatus::InvalidSchema)?,
            )
            .ok_or(DatabaseStatus::InvalidSchema)?;
            let index_name =
                object_string(descriptor, "name").ok_or(DatabaseStatus::InvalidSchema)?;
            if index_name != name || !valid_identifier(index_name) {
                return Err(DatabaseStatus::InvalidSchema);
            }
            let unique =
                optional_bool(descriptor, "unique").map_err(|_| DatabaseStatus::InvalidSchema)?;
            let columns = as_array(
                descriptor
                    .get("columns")
                    .ok_or(DatabaseStatus::InvalidSchema)?,
            )
            .ok_or(DatabaseStatus::InvalidSchema)?;
            if columns.is_empty() {
                return Err(DatabaseStatus::InvalidSchema);
            }
            let mut index_columns = Vec::new();
            for column in columns {
                let column = as_string(column).ok_or(DatabaseStatus::InvalidSchema)?;
                if !valid_identifier(column) {
                    return Err(DatabaseStatus::InvalidSchema);
                }
                index_columns.push(quote_identifier(column));
            }
            let sql = format!(
                "CREATE {}INDEX {} ON {} ({})",
                if unique { "UNIQUE " } else { "" },
                quote_identifier(index_name),
                quote_identifier(table),
                index_columns.join(", ")
            );
            connection
                .execute_batch(&sql)
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))
        }
        "dropIndex" => {
            let owner: Option<String> = connection
                .query_row(
                    "SELECT tbl_name FROM sqlite_master WHERE type='index' AND name=?1",
                    [name],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
            if owner.as_deref() != Some(table) {
                return Err(DatabaseStatus::MigrationError);
            }
            connection
                .execute_batch(&format!("DROP INDEX {}", quote_identifier(name)))
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))
        }
        "transform" => {
            if values.is_empty() {
                return Err(DatabaseStatus::InvalidSchema);
            }
            let mut assignments = Vec::new();
            let mut params = Vec::new();
            for (column, value) in values {
                if !valid_identifier(column) {
                    return Err(DatabaseStatus::InvalidSchema);
                }
                assignments.push(format!("{} = ?", quote_identifier(column)));
                params.push(generic_sql_value(value).ok_or(DatabaseStatus::InvalidSchema)?);
            }
            let sql = format!(
                "UPDATE {} SET {}",
                quote_identifier(table),
                assignments.join(", ")
            );
            connection
                .execute(&sql, params_from_iter(params.iter()))
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
            Ok(())
        }
        _ => Err(DatabaseStatus::InvalidSchema),
    }
}

fn validate_column_set(columns: &BTreeMap<String, ColumnSchema>) -> Result<(), DatabaseStatus> {
    if columns.is_empty() {
        return Err(DatabaseStatus::InvalidSchema);
    }
    let mut primary_count = 0;
    for (name, column) in columns {
        if !valid_identifier(name) {
            return Err(DatabaseStatus::InvalidSchema);
        }
        if column.primary_key {
            primary_count += 1;
        }
    }
    if primary_count > 1 {
        return Err(DatabaseStatus::InvalidSchema);
    }
    Ok(())
}

fn generic_sql_value(value: &DatabaseValue) -> Option<SqlValue> {
    match value {
        DatabaseValue::Null => Some(SqlValue::Null),
        DatabaseValue::Number(value) if value.is_finite() => Some(SqlValue::Real(*value)),
        DatabaseValue::String(value) => Some(SqlValue::Text(value.clone())),
        DatabaseValue::Boolean(value) => Some(SqlValue::Integer(i64::from(*value))),
        DatabaseValue::Bytes(value) => Some(SqlValue::Blob(value.clone())),
        _ => None,
    }
}

fn create_table_sql(table_override: &str, schema: &TableSchema) -> String {
    let mut definitions = Vec::new();
    for (name, column) in &schema.columns {
        let mut definition = format!("{} {}", quote_identifier(name), sqlite_type(column.kind));
        if column.primary_key {
            definition.push_str(" PRIMARY KEY");
            if column.auto_increment {
                definition.push_str(" AUTOINCREMENT");
            }
        }
        if column.not_null || column.primary_key {
            definition.push_str(" NOT NULL");
        }
        if column.unique {
            definition.push_str(" UNIQUE");
        }
        if column.kind == ColumnKind::Boolean {
            definition.push_str(&format!(" CHECK ({} IN (0, 1))", quote_identifier(name)));
        }
        definitions.push(definition);
    }
    format!(
        "CREATE TABLE {} ({}) STRICT",
        quote_identifier(table_override),
        definitions.join(", ")
    )
}

fn sqlite_type(kind: ColumnKind) -> &'static str {
    match kind {
        ColumnKind::Integer | ColumnKind::Boolean => "INTEGER",
        ColumnKind::Real => "REAL",
        ColumnKind::Text => "TEXT",
        ColumnKind::Blob => "BLOB",
    }
}

fn rebuild_table(
    connection: &Connection,
    table: &str,
    add: Option<(&str, ColumnSchema)>,
    drop: Option<&str>,
) -> Result<(), DatabaseStatus> {
    let columns = read_physical_columns(connection, table)?;
    let previous_sequence = if columns.iter().any(|(_, column)| column.auto_increment) {
        connection
            .query_row(
                "SELECT seq FROM sqlite_sequence WHERE name = ?1",
                [table],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?
    } else {
        None
    };
    let mut rebuilt = columns.clone();
    if let Some((name, column)) = add.as_ref() {
        if !valid_identifier(name) || rebuilt.iter().any(|(existing, _)| existing == name) {
            return Err(DatabaseStatus::MigrationError);
        }
        rebuilt.push((name.to_string(), column.clone()));
    }
    if let Some(name) = drop {
        if rebuilt.len() <= 1 {
            return Err(DatabaseStatus::MigrationError);
        }
        let original_len = rebuilt.len();
        rebuilt.retain(|(existing, _)| existing != name);
        if rebuilt.len() == original_len {
            return Err(DatabaseStatus::MigrationError);
        }
    }
    let temp = format!("__bornengine_migrate_{}", table);
    let mut schema_columns = BTreeMap::new();
    for (name, column) in &rebuilt {
        schema_columns.insert(name.clone(), column.clone());
    }
    let create = create_table_sql(
        &temp,
        &TableSchema {
            columns: schema_columns,
        },
    );
    let indexes = read_physical_indexes(connection, table)?;
    connection
        .execute_batch(&create)
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    let old_columns: Vec<String> = columns
        .iter()
        .map(|(name, _)| name.clone())
        .filter(|name| drop != Some(name.as_str()))
        .collect();
    let mut select = old_columns
        .iter()
        .map(|name| quote_identifier(name))
        .collect::<Vec<_>>();
    let mut params = Vec::new();
    if let Some((new_name, column)) = add.as_ref() {
        let expression = if column.has_default {
            let default = column.default.as_ref().unwrap_or(&DatabaseValue::Null);
            params.push(generic_sql_value(default).ok_or(DatabaseStatus::MigrationError)?);
            "?".to_string()
        } else if column.not_null {
            let count: i64 = connection
                .query_row(
                    &format!("SELECT COUNT(*) FROM {}", quote_identifier(table)),
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
            if count > 0 {
                return Err(DatabaseStatus::MigrationError);
            }
            "NULL".to_string()
        } else {
            "NULL".to_string()
        };
        select.push(expression);
        let target_columns = old_columns
            .iter()
            .map(|name| quote_identifier(name))
            .chain(std::iter::once(quote_identifier(new_name)))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {} ({target_columns}) SELECT {} FROM {}",
            quote_identifier(&temp),
            select.join(", "),
            quote_identifier(table)
        );
        connection
            .execute(&sql, params_from_iter(params.iter()))
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    } else {
        if old_columns.is_empty() {
            return Err(DatabaseStatus::MigrationError);
        }
        let columns_sql = old_columns
            .iter()
            .map(|name| quote_identifier(name))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {} ({columns_sql}) SELECT {columns_sql} FROM {}",
            quote_identifier(&temp),
            quote_identifier(table)
        );
        connection
            .execute(&sql, [])
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    }
    connection
        .execute_batch(&format!(
            "DROP TABLE {}; ALTER TABLE {} RENAME TO {}",
            quote_identifier(table),
            quote_identifier(&temp),
            quote_identifier(table)
        ))
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    if let Some(previous_sequence) = previous_sequence {
        let current_sequence = connection
            .query_row(
                "SELECT seq FROM sqlite_sequence WHERE name = ?1",
                [table],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let sequence = current_sequence
            .map(|current| current.max(previous_sequence))
            .unwrap_or(previous_sequence);
        if current_sequence.is_some() {
            connection
                .execute(
                    "UPDATE sqlite_sequence SET seq = ?1 WHERE name = ?2",
                    (sequence, table),
                )
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        } else {
            connection
                .execute(
                    "INSERT INTO sqlite_sequence (name, seq) VALUES (?1, ?2)",
                    (table, sequence),
                )
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        }
    }
    for index in indexes {
        if index
            .columns
            .iter()
            .any(|column| !rebuilt.iter().any(|(name, _)| name == column))
        {
            continue;
        }
        let sql = format!(
            "CREATE {}INDEX {} ON {} ({})",
            if index.unique { "UNIQUE " } else { "" },
            quote_identifier(&index.name),
            quote_identifier(table),
            index
                .columns
                .iter()
                .map(|column| quote_identifier(column))
                .collect::<Vec<_>>()
                .join(", ")
        );
        connection
            .execute_batch(&sql)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    }
    Ok(())
}

fn read_physical_columns(
    connection: &Connection,
    table: &str,
) -> Result<Vec<(String, ColumnSchema)>, DatabaseStatus> {
    let table_sql: String = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get(0),
        )
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    let normalized_sql = table_sql.to_ascii_uppercase();
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({})", quote_identifier(table)))
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    let mut rows = statement
        .query([])
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    let mut columns = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?
    {
        let name: String = row
            .get(1)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let sql_type: String = row
            .get(2)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let not_null: i64 = row
            .get(3)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let primary: i64 = row
            .get(5)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let boolean_check = format!("CHECK (\"{}\" IN (0, 1))", name.to_ascii_uppercase());
        let kind = match sql_type.as_str() {
            "INTEGER" if normalized_sql.contains(&boolean_check) => ColumnKind::Boolean,
            "INTEGER" => ColumnKind::Integer,
            "REAL" => ColumnKind::Real,
            "TEXT" => ColumnKind::Text,
            "BLOB" => ColumnKind::Blob,
            _ => return Err(DatabaseStatus::CorruptData),
        };
        let auto_increment = if primary != 0 && kind == ColumnKind::Integer {
            let sql: Option<String> = connection
                .query_row(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
            sql.is_some_and(|sql| sql.to_ascii_uppercase().contains("AUTOINCREMENT"))
        } else {
            false
        };
        let column = ColumnSchema {
            kind,
            primary_key: primary != 0,
            auto_increment,
            not_null: not_null != 0,
            unique: false,
            default: None,
            has_default: false,
        };
        columns.push((name, column));
    }
    if columns.is_empty() {
        Err(DatabaseStatus::MigrationError)
    } else {
        Ok(columns)
    }
}

struct PhysicalIndex {
    name: String,
    columns: Vec<String>,
    unique: bool,
}

fn read_physical_indexes(
    connection: &Connection,
    table: &str,
) -> Result<Vec<PhysicalIndex>, DatabaseStatus> {
    let mut statement = connection
        .prepare(&format!("PRAGMA index_list({})", quote_identifier(table)))
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    let mut rows = statement
        .query([])
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
    let mut indexes = Vec::new();
    let mut generated_names = HashSet::new();
    while let Some(row) = rows
        .next()
        .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?
    {
        let name: String = row
            .get(1)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let unique: i64 = row
            .get(2)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let origin: String = row
            .get(3)
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        // Rebuilding the table declaration recreates primary-key constraints;
        // SQLite's implicit primary-key index is reserved and cannot be copied.
        if origin == "pk" {
            continue;
        }
        let mut index_columns = Vec::new();
        let mut info = connection
            .prepare(&format!("PRAGMA index_info({})", quote_identifier(&name)))
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        let mut info_rows = info
            .query([])
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
        while let Some(info_row) = info_rows
            .next()
            .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?
        {
            if let Some(column) = info_row
                .get::<_, Option<String>>(2)
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?
            {
                index_columns.push(column);
            }
        }
        if index_columns.is_empty() {
            continue;
        }
        // Inline UNIQUE constraints become autoindexes whose names cannot be
        // reused. Allocate an internal name unused anywhere in this database.
        let name = if origin == "u" {
            let name = fresh_unique_index_name(connection, &generated_names)?;
            generated_names.insert(name.clone());
            name
        } else {
            name
        };
        indexes.push(PhysicalIndex {
            name,
            columns: index_columns,
            unique: unique != 0,
        });
    }
    Ok(indexes)
}

fn fresh_unique_index_name(
    connection: &Connection,
    reserved: &HashSet<String>,
) -> Result<String, DatabaseStatus> {
    let mut serial = 0_u64;
    loop {
        let candidate = format!("__bornengine_unique_{serial}");
        if !reserved.contains(&candidate) {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = ?1)",
                    [&candidate],
                    |row| row.get(0),
                )
                .map_err(|error| map_sql_error(&error, DatabaseStatus::MigrationError))?;
            if !exists {
                return Ok(candidate);
            }
        }
        serial = serial
            .checked_add(1)
            .ok_or(DatabaseStatus::MigrationError)?;
    }
}
