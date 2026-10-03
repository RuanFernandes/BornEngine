//! FFI-compatible database fallback for native builds without SQLite.

#![allow(dead_code)]

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Clone, Debug, PartialEq)]
pub enum DatabaseValue {
    Null,
    Number(f64),
    String(String),
    Boolean(bool),
    Bytes(Vec<u8>),
    Array(Vec<DatabaseValue>),
    Object(std::collections::BTreeMap<String, DatabaseValue>),
}

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

#[derive(Default)]
pub struct DatabaseStore;

impl DatabaseStore {
    pub fn new() -> Self {
        Self
    }

    pub fn execute(
        &mut self,
        _: u32,
        _: f64,
        _: Vec<DatabaseValue>,
        _: Option<&std::path::Path>,
    ) -> DatabaseResponse {
        DatabaseResponse {
            status: DatabaseStatus::Unsupported,
            rows: 0,
            values: Vec::new(),
        }
    }
}

static NEXT_TICKET: AtomicU64 = AtomicU64::new(1);

fn unsupported_ticket() -> f64 {
    NEXT_TICKET.fetch_add(1, Ordering::Relaxed) as f64
}

pub fn scratch_reset() {}
pub fn scratch_push_number(_: f64) {}
pub fn scratch_push_byte(_: f64) {}
pub fn scratch_push_string(_: Option<&str>) {}

pub fn submit_scratch_args(_: f64) -> Result<Vec<DatabaseValue>, DatabaseStatus> {
    Err(DatabaseStatus::Unsupported)
}

pub fn submit_native(_: f64, _: f64, _: Vec<DatabaseValue>, _: Option<&std::path::Path>) -> f64 {
    unsupported_ticket()
}

pub fn submit_native_error(_: DatabaseStatus) -> f64 {
    unsupported_ticket()
}

pub fn native_poll(_: f64) -> f64 {
    1.0
}

pub fn native_status(_: f64) -> f64 {
    DatabaseStatus::Unsupported as u8 as f64
}

pub fn native_rows(_: f64) -> f64 {
    0.0
}

pub fn native_count(_: f64) -> f64 {
    0.0
}

pub fn native_kind(_: f64, _: f64) -> f64 {
    -1.0
}

pub fn native_number(_: f64, _: f64) -> f64 {
    0.0
}

pub fn native_string(_: f64, _: f64) -> Option<String> {
    None
}

pub fn native_byte_count(_: f64, _: f64) -> f64 {
    0.0
}

pub fn native_byte(_: f64, _: f64, _: f64) -> f64 {
    0.0
}

pub fn native_release(_: f64) {}

pub fn apple_app_data_root() -> Option<PathBuf> {
    None
}

pub fn linux_app_data_root() -> Option<PathBuf> {
    None
}

pub fn windows_app_data_root() -> Option<PathBuf> {
    None
}
