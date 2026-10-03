//! Perry scratch protocol and native database FFI facade.

use super::*;
use std::sync::{Mutex, OnceLock};

// Perry's native database scratch frame is thread-local, so simultaneous game
// threads cannot mix request values between reset and submit.
#[derive(Clone, Debug)]
enum ScratchAtom {
    Number(f64),
    String(String),
    ByteRun(Vec<u8>),
}

thread_local! {
    static SCRATCH: std::cell::RefCell<(Vec<ScratchAtom>, bool, usize)> = const { std::cell::RefCell::new((Vec::new(), false, 0)) };
}

pub fn scratch_reset() {
    SCRATCH.with(|scratch| {
        let mut scratch = scratch.borrow_mut();
        scratch.0.clear();
        scratch.1 = false;
        scratch.2 = 0;
    });
}
pub fn scratch_push_number(value: f64) {
    SCRATCH.with(|scratch| scratch.borrow_mut().0.push(ScratchAtom::Number(value)));
}
pub fn scratch_push_byte(value: f64) {
    SCRATCH.with(|scratch| {
        let mut scratch = scratch.borrow_mut();
        if !value.is_finite() || value.fract() != 0.0 || !(0.0..=255.0).contains(&value) || scratch.2 >= MAX_IMPORT_BYTES {
            scratch.1 = true;
        } else if let Some(ScratchAtom::ByteRun(bytes)) = scratch.0.last_mut() {
            bytes.push(value as u8);
            scratch.2 += 1;
        } else {
            scratch.0.push(ScratchAtom::ByteRun(vec![value as u8]));
            scratch.2 += 1;
        }
    });
}
pub fn scratch_push_string(value: Option<&str>) {
    SCRATCH.with(|scratch| {
        let mut scratch = scratch.borrow_mut();
        match value {
            Some(value) => scratch.0.push(ScratchAtom::String(value.to_string())),
            None => scratch.1 = true,
        }
    });
}

pub fn submit_scratch_args(argc: f64) -> Result<Vec<DatabaseValue>, DatabaseStatus> {
    if !argc.is_finite() || argc.fract() != 0.0 || argc < 0.0 || argc > 16.0 {
        return Err(DatabaseStatus::InvalidData);
    }
    SCRATCH.with(|scratch| {
        let (atoms, invalid) = {
            let mut scratch = scratch.borrow_mut();
            let atoms = std::mem::take(&mut scratch.0);
            let invalid = scratch.1;
            scratch.1 = false;
            scratch.2 = 0;
            (atoms, invalid)
        };
        if invalid {
            return Err(DatabaseStatus::InvalidData);
        }
        let mut parser = ScratchParser {
            atoms,
            index: 0,
            values: 0,
        };
        let mut args = Vec::with_capacity(argc as usize);
        for _ in 0..argc as usize {
            args.push(parser.read_value(0)?);
        }
        if parser.index != parser.atoms.len() {
            return Err(DatabaseStatus::InvalidData);
        }
        Ok(args)
    })
}

struct ScratchParser {
    atoms: Vec<ScratchAtom>,
    index: usize,
    values: usize,
}

impl ScratchParser {
    fn atom(&mut self) -> Result<&ScratchAtom, DatabaseStatus> {
        let value = self
            .atoms
            .get(self.index)
            .ok_or(DatabaseStatus::InvalidData)?;
        self.index += 1;
        Ok(value)
    }

    fn number(&mut self) -> Result<f64, DatabaseStatus> {
        match self.atom()? {
            ScratchAtom::Number(value) if value.is_finite() => Ok(*value),
            _ => Err(DatabaseStatus::InvalidData),
        }
    }

    fn length(&mut self, maximum: usize) -> Result<usize, DatabaseStatus> {
        let value = self.number()?;
        if value.fract() != 0.0 || value < 0.0 || value > maximum as f64 {
            return Err(DatabaseStatus::InvalidData);
        }
        let value = value as usize;
        if value > maximum {
            return Err(DatabaseStatus::InvalidData);
        }
        Ok(value)
    }

    fn byte_run(&mut self, length: usize) -> Result<Vec<u8>, DatabaseStatus> {
        let atom = self
            .atoms
            .get_mut(self.index)
            .ok_or(DatabaseStatus::InvalidData)?;
        self.index += 1;
        match atom {
            ScratchAtom::ByteRun(bytes) if bytes.len() == length => Ok(std::mem::take(bytes)),
            _ => Err(DatabaseStatus::InvalidData),
        }
    }

    fn read_value(&mut self, depth: usize) -> Result<DatabaseValue, DatabaseStatus> {
        if depth > MAX_WIRE_DEPTH || self.values >= MAX_WIRE_VALUES {
            return Err(DatabaseStatus::InvalidData);
        }
        self.values += 1;
        let tag = self.number()?;
        if tag.fract() != 0.0 {
            return Err(DatabaseStatus::InvalidData);
        }
        match tag as u8 {
            0 if tag == 0.0 => Ok(DatabaseValue::Null),
            1 if tag == 1.0 => {
                let number = self.number()?;
                if number.is_finite() {
                    Ok(DatabaseValue::Number(number))
                } else {
                    Err(DatabaseStatus::InvalidData)
                }
            }
            2 if tag == 2.0 => match self.atom()? {
                ScratchAtom::String(value) => Ok(DatabaseValue::String(value.clone())),
                _ => Err(DatabaseStatus::InvalidData),
            },
            3 if tag == 3.0 => Ok(DatabaseValue::Boolean(false)),
            4 if tag == 4.0 => Ok(DatabaseValue::Boolean(true)),
            5 if tag == 5.0 => {
                let length = self.length(MAX_IMPORT_BYTES)?;
                let bytes = if length == 0 {
                    Vec::new()
                } else {
                    self.byte_run(length)?
                };
                Ok(DatabaseValue::Bytes(bytes))
            }
            6 if tag == 6.0 => {
                let length = self.length(MAX_WIRE_VALUES)?;
                let mut items = Vec::with_capacity(length);
                for _ in 0..length {
                    items.push(self.read_value(depth + 1)?);
                }
                Ok(DatabaseValue::Array(items))
            }
            7 if tag == 7.0 => {
                let length = self.length(MAX_WIRE_VALUES)?;
                let mut object = BTreeMap::new();
                for _ in 0..length {
                    let key = match self.atom()? {
                        ScratchAtom::String(value)
                            if valid_identifier(value) || valid_namespace(value) =>
                        {
                            value.clone()
                        }
                        _ => return Err(DatabaseStatus::InvalidData),
                    };
                    if object.insert(key, self.read_value(depth + 1)?).is_some() {
                        return Err(DatabaseStatus::InvalidData);
                    }
                }
                Ok(DatabaseValue::Object(object))
            }
            _ => Err(DatabaseStatus::InvalidData),
        }
    }
}

struct NativeRuntime {
    store: DatabaseStore,
    tickets: HashMap<u64, DatabaseResponse>,
    next_ticket: u64,
}

impl NativeRuntime {
    fn new() -> Self {
        Self {
            store: DatabaseStore::new(),
            tickets: HashMap::new(),
            next_ticket: 0,
        }
    }
}

fn native_runtime() -> &'static Mutex<NativeRuntime> {
    static RUNTIME: OnceLock<Mutex<NativeRuntime>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(NativeRuntime::new()))
}

pub fn submit_native(
    op: f64,
    handle: f64,
    args: Vec<DatabaseValue>,
    app_data_root: Option<&Path>,
) -> f64 {
    if !op.is_finite() || op.fract() != 0.0 || !(1.0..=12.0).contains(&op) {
        return issue_ticket(DatabaseResponse::status(DatabaseStatus::Unsupported));
    }
    let mut runtime = match native_runtime().lock() {
        Ok(runtime) => runtime,
        Err(poisoned) => poisoned.into_inner(),
    };
    if runtime.next_ticket >= 9_007_199_254_740_990 || runtime.tickets.len() >= 4096 {
        return 0.0;
    }
    runtime.next_ticket += 1;
    let ticket = runtime.next_ticket;
    let response = runtime
        .store
        .execute(op as u32, handle, args, app_data_root);
    runtime.tickets.insert(ticket, response);
    ticket as f64
}

pub fn submit_native_error(status: DatabaseStatus) -> f64 {
    issue_ticket(DatabaseResponse::status(status))
}

fn issue_ticket(response: DatabaseResponse) -> f64 {
    let mut runtime = match native_runtime().lock() {
        Ok(runtime) => runtime,
        Err(poisoned) => poisoned.into_inner(),
    };
    if runtime.next_ticket >= 9_007_199_254_740_990 || runtime.tickets.len() >= 4096 {
        return 0.0;
    }
    runtime.next_ticket += 1;
    let ticket = runtime.next_ticket;
    runtime.tickets.insert(ticket, response);
    ticket as f64
}

pub fn native_poll(_ticket: f64) -> f64 {
    1.0
}

pub fn native_status(ticket: f64) -> f64 {
    with_native_response(ticket, |response| response.status as u8 as f64)
        .unwrap_or(DatabaseStatus::StorageError as u8 as f64)
}
pub fn native_rows(ticket: f64) -> f64 {
    with_native_response(ticket, |response| response.rows as f64).unwrap_or(0.0)
}
pub fn native_count(ticket: f64) -> f64 {
    with_native_response(ticket, |response| response.values.len() as f64).unwrap_or(0.0)
}
pub fn native_kind(ticket: f64, index: f64) -> f64 {
    with_native_value(ticket, index, |value| value_kind(value) as f64).unwrap_or(-1.0)
}
pub fn native_number(ticket: f64, index: f64) -> f64 {
    with_native_value(ticket, index, |value| match value {
        DatabaseValue::Number(value) => Some(*value),
        _ => None,
    })
    .flatten()
    .unwrap_or(0.0)
}
pub fn native_string(ticket: f64, index: f64) -> Option<String> {
    with_native_value(ticket, index, |value| match value {
        DatabaseValue::String(value) => Some(value.clone()),
        _ => None,
    })
    .flatten()
}
pub fn native_byte_count(ticket: f64, index: f64) -> f64 {
    with_native_value(ticket, index, |value| match value {
        DatabaseValue::Bytes(value) => Some(value.len() as f64),
        _ => None,
    })
    .flatten()
    .unwrap_or(0.0)
}
pub fn native_byte(ticket: f64, index: f64, offset: f64) -> f64 {
    if !offset.is_finite() || offset.fract() != 0.0 || offset < 0.0 {
        return 0.0;
    }
    with_native_value(ticket, index, |value| match value {
        DatabaseValue::Bytes(value) => value.get(offset as usize).copied(),
        _ => None,
    })
    .flatten()
    .map(|value| value as f64)
    .unwrap_or(0.0)
}
pub fn native_release(ticket: f64) {
    if !valid_ticket(ticket) {
        return;
    }
    let mut runtime = match native_runtime().lock() {
        Ok(runtime) => runtime,
        Err(poisoned) => poisoned.into_inner(),
    };
    runtime.tickets.remove(&(ticket as u64));
}

fn with_native_response<R>(ticket: f64, read: impl FnOnce(&DatabaseResponse) -> R) -> Option<R> {
    if !valid_ticket(ticket) {
        return None;
    }
    let runtime = match native_runtime().lock() {
        Ok(runtime) => runtime,
        Err(poisoned) => poisoned.into_inner(),
    };
    runtime.tickets.get(&(ticket as u64)).map(read)
}

fn with_native_value<R>(
    ticket: f64,
    index: f64,
    read: impl FnOnce(&DatabaseValue) -> R,
) -> Option<R> {
    if !index.is_finite() || index.fract() != 0.0 || index < 0.0 {
        return None;
    }
    with_native_response(ticket, |response| {
        response.values.get(index as usize).map(read)
    })
    .flatten()
}

fn valid_ticket(ticket: f64) -> bool {
    ticket.is_finite() && (1.0..=MAX_SAFE_INTEGER).contains(&ticket) && ticket.fract() == 0.0
}

fn value_kind(value: &DatabaseValue) -> u8 {
    match value {
        DatabaseValue::Null => 0,
        DatabaseValue::Number(_) => 1,
        DatabaseValue::String(_) => 2,
        DatabaseValue::Boolean(false) => 3,
        DatabaseValue::Boolean(true) => 4,
        DatabaseValue::Bytes(_) => 5,
        DatabaseValue::Array(_) | DatabaseValue::Object(_) => 0,
    }
}

/// Apple app containers expose HOME as the application's sandbox root.
pub fn apple_app_data_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let home = PathBuf::from(home);
    if !home.is_absolute() {
        return None;
    }
    Some(home.join("Library").join("Application Support"))
}

/// XDG's data root is used when valid; otherwise follow the Linux home layout.
pub fn linux_app_data_root() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from) {
        if path.is_absolute() {
            return Some(path);
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    if !home.is_absolute() {
        return None;
    }
    Some(home.join(".local").join("share"))
}

/// Windows game saves are local machine data; no cwd fallback is provided.
pub fn windows_app_data_root() -> Option<PathBuf> {
    for variable in ["LOCALAPPDATA", "APPDATA"] {
        if let Some(path) = std::env::var_os(variable).map(PathBuf::from) {
            if path.is_absolute() {
                return Some(path);
            }
        }
    }
    None
}
