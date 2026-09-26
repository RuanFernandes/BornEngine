//! Native Colyseus client bridge backed by the upstream C SDK.
//!
//! The SDK is kept in polled mode so all room callbacks are copied into a
//! queue on the game's polling thread and delivered to Perry from TypeScript.

use std::collections::{HashMap, VecDeque};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};
use std::sync::{Mutex, MutexGuard, OnceLock};

#[cfg(colyseus_native_sdk)]
mod sdk {
    use super::*;

    pub enum Settings {}
    pub enum Client {}
    pub enum Room {}
    pub enum Message {}
    pub enum Reader {}

    #[repr(C)]
    pub struct MapIterator {
        pub map_reader: *mut Reader,
        pub current_index: usize,
        pub total_size: usize,
    }

    pub type RoomCallback = Option<unsafe extern "C" fn(*mut Room, *mut c_void)>;
    pub type ClientErrorCallback = Option<unsafe extern "C" fn(c_int, *const c_char, *mut c_void)>;
    pub type RoomEventCallback = Option<unsafe extern "C" fn(*mut c_void)>;
    pub type RoomErrorCallback = Option<unsafe extern "C" fn(c_int, *const c_char, *mut c_void)>;
    pub type RoomLeaveCallback = Option<unsafe extern "C" fn(c_int, *const c_char, *mut c_void)>;
    pub type RoomDropCallback = Option<unsafe extern "C" fn(c_int, *const c_char, *mut c_void)>;
    pub type MessageCallback =
        Option<unsafe extern "C" fn(*const c_char, *mut Reader, *mut c_void)>;
    pub type RequestCallback =
        Option<unsafe extern "C" fn(c_int, *const u8, usize, *const c_char, *mut c_void)>;

    #[link(name = "colyseus", kind = "static")]
    unsafe extern "C" {
        pub fn colyseus_settings_create() -> *mut Settings;
        pub fn colyseus_settings_free(settings: *mut Settings);
        pub fn colyseus_settings_set_address(settings: *mut Settings, address: *const c_char);
        pub fn colyseus_settings_set_port(settings: *mut Settings, port: *const c_char);
        pub fn colyseus_settings_set_secure(settings: *mut Settings, secure: bool);
        pub fn colyseus_client_create(settings: *mut Settings) -> *mut Client;
        pub fn colyseus_client_free(client: *mut Client);
        pub fn colyseus_client_join_or_create(
            client: *mut Client,
            room_name: *const c_char,
            options: *const c_char,
            success: RoomCallback,
            error: ClientErrorCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_client_create_room(
            client: *mut Client,
            room_name: *const c_char,
            options: *const c_char,
            success: RoomCallback,
            error: ClientErrorCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_client_join(
            client: *mut Client,
            room_name: *const c_char,
            options: *const c_char,
            success: RoomCallback,
            error: ClientErrorCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_client_join_by_id(
            client: *mut Client,
            room_id: *const c_char,
            options: *const c_char,
            success: RoomCallback,
            error: ClientErrorCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_client_reconnect(
            client: *mut Client,
            token: *const c_char,
            success: RoomCallback,
            error: ClientErrorCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_set_polled(polled: bool);
        pub fn colyseus_poll();
        pub fn colyseus_room_free(room: *mut Room);
        pub fn colyseus_room_leave(room: *mut Room, consented: bool);
        pub fn colyseus_room_get_id(room: *const Room) -> *const c_char;
        pub fn colyseus_room_get_session_id(room: *const Room) -> *const c_char;
        pub fn colyseus_room_get_reconnection_token(room: *const Room) -> *const c_char;
        pub fn colyseus_room_is_connected(room: *const Room) -> bool;
        pub fn colyseus_room_is_reconnecting(room: *const Room) -> bool;
        pub fn colyseus_room_get_state(room: *mut Room) -> *mut c_void;
        pub fn colyseus_room_on_join(
            room: *mut Room,
            callback: RoomEventCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_room_on_state_change(
            room: *mut Room,
            callback: RoomEventCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_room_on_error(
            room: *mut Room,
            callback: RoomErrorCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_room_on_leave(
            room: *mut Room,
            callback: RoomLeaveCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_room_on_drop(
            room: *mut Room,
            callback: RoomDropCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_room_on_reconnect(
            room: *mut Room,
            callback: RoomEventCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_room_on_message_any_with_type(
            room: *mut Room,
            callback: MessageCallback,
            userdata: *mut c_void,
        );
        pub fn colyseus_room_send(
            room: *mut Room,
            message_type: *const c_char,
            payload: *mut Message,
        );
        pub fn colyseus_room_send_int(room: *mut Room, message_type: c_int, payload: *mut Message);
        pub fn colyseus_room_send_bytes(
            room: *mut Room,
            message_type: *const c_char,
            bytes: *const u8,
            length: usize,
        );
        pub fn colyseus_room_send_int_bytes(
            room: *mut Room,
            message_type: c_int,
            bytes: *const u8,
            length: usize,
        );
        pub fn colyseus_room_request_encoded_reply(
            room: *mut Room,
            message_type: *const c_char,
            payload: *const u8,
            length: usize,
            callback: RequestCallback,
            userdata: *mut c_void,
        ) -> u32;
        pub fn colyseus_room_cancel_request(room: *mut Room, request_id: u32);
        pub fn colyseus_message_map_create() -> *mut Message;
        pub fn colyseus_message_array_create() -> *mut Message;
        pub fn colyseus_message_nil_create() -> *mut Message;
        pub fn colyseus_message_bool_create(value: bool) -> *mut Message;
        pub fn colyseus_message_int_create(value: i64) -> *mut Message;
        pub fn colyseus_message_uint_create(value: u64) -> *mut Message;
        pub fn colyseus_message_float_create(value: f64) -> *mut Message;
        pub fn colyseus_message_str_create(value: *const c_char) -> *mut Message;
        pub fn colyseus_message_map_put_msg(
            map: *mut Message,
            key: *const c_char,
            value: *mut Message,
        );
        pub fn colyseus_message_map_put_nil(map: *mut Message, key: *const c_char);
        pub fn colyseus_message_map_put_bool(map: *mut Message, key: *const c_char, value: bool);
        pub fn colyseus_message_map_put_int(map: *mut Message, key: *const c_char, value: i64);
        pub fn colyseus_message_map_put_uint(map: *mut Message, key: *const c_char, value: u64);
        pub fn colyseus_message_map_put_float(map: *mut Message, key: *const c_char, value: f64);
        pub fn colyseus_message_map_put_str(
            map: *mut Message,
            key: *const c_char,
            value: *const c_char,
        );
        pub fn colyseus_message_array_push_msg(array: *mut Message, value: *mut Message);
        pub fn colyseus_message_encode(message: *mut Message, length: *mut usize) -> *mut u8;
        pub fn colyseus_message_encoded_free(data: *mut u8, length: usize);
        pub fn colyseus_message_free(message: *mut Message);
        pub fn colyseus_message_reader_create(data: *const u8, length: usize) -> *mut Reader;
        pub fn colyseus_message_reader_get_type(reader: *mut Reader) -> c_int;
        pub fn colyseus_message_reader_get_bool(reader: *mut Reader) -> bool;
        pub fn colyseus_message_reader_get_int(reader: *mut Reader) -> i64;
        pub fn colyseus_message_reader_get_uint(reader: *mut Reader) -> u64;
        pub fn colyseus_message_reader_get_float(reader: *mut Reader) -> f64;
        pub fn colyseus_message_reader_get_str(
            reader: *mut Reader,
            length: *mut usize,
        ) -> *const c_char;
        pub fn colyseus_message_reader_get_bin(
            reader: *mut Reader,
            length: *mut usize,
        ) -> *const u8;
        pub fn colyseus_message_reader_get_array_size(reader: *mut Reader) -> usize;
        pub fn colyseus_message_reader_get_array_element(
            reader: *mut Reader,
            index: usize,
        ) -> *mut Reader;
        pub fn colyseus_message_reader_map_iterator(reader: *mut Reader) -> MapIterator;
        pub fn colyseus_message_map_iterator_next(
            iterator: *mut MapIterator,
            key: *mut *mut Reader,
            value: *mut *mut Reader,
        ) -> bool;
        pub fn colyseus_message_reader_free(reader: *mut Reader);
        pub fn colyseus_dynamic_schema_foreach(
            schema: *mut c_void,
            callback: Option<
                unsafe extern "C" fn(c_int, *const c_char, *mut DynamicValue, *mut c_void),
            >,
            userdata: *mut c_void,
        );
        pub fn colyseus_vtable_is_dynamic(vtable: *const SchemaVtable) -> bool;
        pub fn colyseus_map_schema_foreach(
            map: *mut MapSchema,
            callback: Option<unsafe extern "C" fn(*const c_char, *mut c_void, *mut c_void)>,
            userdata: *mut c_void,
        );
    }

    #[repr(C)]
    pub struct SchemaBase {
        pub ref_id: c_int,
        pub vtable: *const SchemaVtable,
    }
    #[repr(C)]
    pub struct SchemaVtable {
        pub name: *const c_char,
        pub size: usize,
        pub create: Option<unsafe extern "C" fn() -> *mut SchemaBase>,
        pub destroy: Option<unsafe extern "C" fn(*mut SchemaBase)>,
        pub fields: *const SchemaField,
        pub field_count: c_int,
    }
    #[repr(C)]
    pub struct SchemaField {
        pub index: c_int,
        pub name: *const c_char,
        pub field_type: c_int,
        pub type_str: *const c_char,
        pub offset: usize,
        pub child_vtable: *const SchemaVtable,
        pub child_primitive_type: *const c_char,
        pub quantized: *const c_void,
    }
    #[repr(C)]
    pub union DynamicData {
        pub string: *const c_char,
        pub number: f64,
        pub float32: f32,
        pub boolean: bool,
        pub int8: i8,
        pub uint8: u8,
        pub int16: i16,
        pub uint16: u16,
        pub int32: i32,
        pub uint32: u32,
        pub int64: i64,
        pub uint64: u64,
        pub reference: *mut c_void,
        pub array: *mut ArraySchema,
        pub map: *mut MapSchema,
    }
    #[repr(C)]
    pub struct DynamicValue {
        pub field_type: c_int,
        pub data: DynamicData,
    }
    #[repr(C)]
    pub struct ArrayItem {
        pub index: c_int,
        pub value: *mut c_void,
        pub next: *mut ArrayItem,
    }
    #[repr(C)]
    pub struct ArraySchema {
        pub ref_id: c_int,
        pub items: *mut ArrayItem,
        pub count: c_int,
        pub capacity: c_int,
        pub has_schema_child: bool,
        pub child_primitive_type: *const c_char,
        pub child_vtable: *const SchemaVtable,
        pub deleted_keys: *mut c_int,
        pub deleted_count: c_int,
        pub deleted_capacity: c_int,
    }
    #[repr(C)]
    pub struct MapSchema {
        pub ref_id: c_int,
        pub items: *mut c_void,
        pub indexes: *mut c_void,
        pub count: c_int,
        pub has_schema_child: bool,
        pub child_primitive_type: *const c_char,
        pub child_vtable: *const SchemaVtable,
    }
}

#[derive(Default)]
struct Registry {
    next_handle: u64,
    clients: HashMap<u64, ClientEntry>,
    rooms: HashMap<u64, RoomEntry>,
    pending_joins: HashMap<u64, usize>,
    events: VecDeque<String>,
}

#[derive(Clone, Copy)]
struct ClientEntry {
    client: usize,
    settings: usize,
}

struct RoomEntry {
    room: usize,
    client: u64,
    join_context: usize,
    requests: HashMap<u64, RequestMeta>,
}

#[derive(Clone, Copy)]
struct RequestMeta {
    sdk_id: u32,
    context: usize,
}

struct JoinContext {
    client: u64,
    room: u64,
}
struct RequestContext {
    room: u64,
    request: u64,
}

static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();

fn registry() -> MutexGuard<'static, Registry> {
    REGISTRY
        .get_or_init(|| Mutex::new(Registry::default()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn allocate_handle(registry: &mut Registry) -> u64 {
    registry.next_handle = registry.next_handle.wrapping_add(1).max(1);
    registry.next_handle
}

fn push_event(value: serde_json::Value) {
    if let Ok(encoded) = serde_json::to_string(&value) {
        registry().events.push_back(encoded);
    }
}

fn c_string(value: &str) -> Result<CString, String> {
    CString::new(value).map_err(|_| "Colyseus values cannot contain a NUL character".to_string())
}

fn parse_endpoint(endpoint: &str) -> Result<(String, String, bool), String> {
    let (secure, rest) = if let Some(value) = endpoint
        .strip_prefix("wss://")
        .or_else(|| endpoint.strip_prefix("https://"))
    {
        (true, value)
    } else if let Some(value) = endpoint
        .strip_prefix("ws://")
        .or_else(|| endpoint.strip_prefix("http://"))
    {
        (false, value)
    } else {
        return Err("Colyseus URL must start with ws://, wss://, http://, or https://".into());
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() {
        return Err("Colyseus URL is missing a host".into());
    }
    let (host, port) = if authority.starts_with('[') {
        let end = authority.find(']').ok_or("Invalid bracketed IPv6 host")?;
        let host = &authority[1..end];
        let suffix = &authority[end + 1..];
        if suffix.is_empty() {
            (host, if secure { "443" } else { "2567" })
        } else if let Some(port) = suffix.strip_prefix(':') {
            (host, port)
        } else {
            return Err("Invalid characters after IPv6 host".into());
        }
    } else if let Some((host, port)) = authority.rsplit_once(':') {
        if host.contains(':') {
            return Err("IPv6 hosts must be enclosed in brackets".into());
        }
        (host, port)
    } else {
        (authority, if secure { "443" } else { "2567" })
    };
    if host.is_empty() || port.is_empty() || !port.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Invalid Colyseus host or port".into());
    }
    Ok((host.to_string(), port.to_string(), secure))
}

#[cfg(colyseus_native_sdk)]
pub fn client_create(endpoint: &str) -> u64 {
    use sdk::*;
    let (host, port, secure) = match parse_endpoint(endpoint) {
        Ok(parsed) => parsed,
        Err(error) => {
            push_event(serde_json::json!({"kind":"clientError","message":error}));
            return 0;
        }
    };
    let (host, port) = match (c_string(&host), c_string(&port)) {
        (Ok(host), Ok(port)) => (host, port),
        _ => return 0,
    };
    unsafe {
        colyseus_set_polled(true);
        let settings = colyseus_settings_create();
        if settings.is_null() {
            return 0;
        }
        colyseus_settings_set_address(settings, host.as_ptr());
        colyseus_settings_set_port(settings, port.as_ptr());
        colyseus_settings_set_secure(settings, secure);
        let client = colyseus_client_create(settings);
        if client.is_null() {
            colyseus_settings_free(settings);
            return 0;
        }
        let mut state = registry();
        let handle = allocate_handle(&mut state);
        state.clients.insert(
            handle,
            ClientEntry {
                client: client as usize,
                settings: settings as usize,
            },
        );
        handle
    }
}

#[cfg(not(colyseus_native_sdk))]
pub fn client_create(_endpoint: &str) -> u64 {
    unsupported();
    0
}

#[cfg(colyseus_native_sdk)]
pub fn client_join(client_handle: u64, method: u32, target: &str, options: &str) -> u64 {
    use sdk::*;
    let (target, options) = match (
        c_string(target),
        c_string(if options.is_empty() { "{}" } else { options }),
    ) {
        (Ok(target), Ok(options)) => (target, options),
        (Err(error), _) | (_, Err(error)) => {
            push_event(serde_json::json!({"kind":"clientError","message":error}));
            return 0;
        }
    };
    let mut state = registry();
    let Some(client_entry) = state.clients.get(&client_handle).copied() else {
        return 0;
    };
    let room_handle = allocate_handle(&mut state);
    let context = Box::into_raw(Box::new(JoinContext {
        client: client_handle,
        room: room_handle,
    }));
    state.pending_joins.insert(room_handle, context as usize);
    drop(state);
    unsafe {
        let client = client_entry.client as *mut Client;
        let userdata = context as *mut c_void;
        match method {
            0 => colyseus_client_join_or_create(
                client,
                target.as_ptr(),
                options.as_ptr(),
                Some(matchmake_success),
                Some(matchmake_error),
                userdata,
            ),
            1 => colyseus_client_create_room(
                client,
                target.as_ptr(),
                options.as_ptr(),
                Some(matchmake_success),
                Some(matchmake_error),
                userdata,
            ),
            2 => colyseus_client_join(
                client,
                target.as_ptr(),
                options.as_ptr(),
                Some(matchmake_success),
                Some(matchmake_error),
                userdata,
            ),
            3 => colyseus_client_join_by_id(
                client,
                target.as_ptr(),
                options.as_ptr(),
                Some(matchmake_success),
                Some(matchmake_error),
                userdata,
            ),
            4 => colyseus_client_reconnect(
                client,
                target.as_ptr(),
                Some(matchmake_success),
                Some(matchmake_error),
                userdata,
            ),
            _ => {
                registry().pending_joins.remove(&room_handle);
                drop(Box::from_raw(context));
                push_event(
                    serde_json::json!({"kind":"error","room":room_handle,"code":-1,"message":"Unsupported matchmaking operation"}),
                );
                return 0;
            }
        }
    }
    room_handle
}

#[cfg(not(colyseus_native_sdk))]
pub fn client_join(_client: u64, _method: u32, _target: &str, _options: &str) -> u64 {
    unsupported();
    0
}

#[cfg(colyseus_native_sdk)]
pub fn client_dispose(client_handle: u64) {
    use sdk::*;
    let rooms = {
        let state = registry();
        let rooms: Vec<(u64, usize)> = state
            .rooms
            .iter()
            .filter(|(_, room)| room.client == client_handle)
            .map(|(&handle, room)| (handle, room.room))
            .collect();
        rooms
    };
    for (_, room) in &rooms {
        unsafe {
            colyseus_room_leave(*room as *mut Room, true);
        }
    }
    unsafe {
        colyseus_poll();
    }
    let (client_entry, room_entries, pending) = {
        let mut state = registry();
        let room_handles: Vec<u64> = state
            .rooms
            .iter()
            .filter(|(_, room)| room.client == client_handle)
            .map(|(&handle, _)| handle)
            .collect();
        let mut entries = Vec::new();
        for handle in room_handles {
            if let Some(entry) = state.rooms.remove(&handle) {
                entries.push(entry);
            }
        }
        let pending_handles: Vec<u64> = state
            .pending_joins
            .iter()
            .filter_map(|(&handle, &context)| {
                let ctx = unsafe { &*(context as *const JoinContext) };
                if ctx.client == client_handle {
                    Some(handle)
                } else {
                    None
                }
            })
            .collect();
        let pending = pending_handles
            .into_iter()
            .filter_map(|handle| state.pending_joins.remove(&handle))
            .collect::<Vec<_>>();
        (state.clients.remove(&client_handle), entries, pending)
    };
    for entry in room_entries {
        for (_, request) in entry.requests {
            unsafe {
                colyseus_room_cancel_request(entry.room as *mut Room, request.sdk_id);
                drop(Box::from_raw(request.context as *mut RequestContext));
            }
        }
        unsafe {
            colyseus_room_free(entry.room as *mut Room);
            if entry.join_context != 0 {
                drop(Box::from_raw(entry.join_context as *mut JoinContext));
            }
        }
    }
    for context in pending {
        unsafe {
            drop(Box::from_raw(context as *mut JoinContext));
        }
    }
    if let Some(entry) = client_entry {
        unsafe {
            colyseus_client_free(entry.client as *mut Client);
            colyseus_settings_free(entry.settings as *mut Settings);
        }
    }
}

#[cfg(not(colyseus_native_sdk))]
pub fn client_dispose(_client: u64) {
    unsupported();
}

#[cfg(colyseus_native_sdk)]
pub fn poll() {
    unsafe {
        sdk::colyseus_poll();
    }
}
#[cfg(not(colyseus_native_sdk))]
pub fn poll() {}

pub fn next_event() -> String {
    registry().events.pop_front().unwrap_or_default()
}

#[cfg(colyseus_native_sdk)]
pub fn room_send(room_handle: u64, message_type: &str, payload_json: &str) {
    use sdk::*;
    let (room_ptr, _) = match room_entry(room_handle) {
        Some(value) => value,
        None => return,
    };
    let message_type = match c_string(message_type) {
        Ok(value) => value,
        Err(error) => {
            room_error(room_handle, error);
            return;
        }
    };
    let value = match serde_json::from_str::<serde_json::Value>(if payload_json.is_empty() {
        "null"
    } else {
        payload_json
    }) {
        Ok(value) => value,
        Err(error) => {
            room_error(
                room_handle,
                format!("Invalid Colyseus message JSON: {error}"),
            );
            return;
        }
    };
    let mut conversion_error = None;
    let message = unsafe { json_to_message(&value, 0, &mut conversion_error) };
    let Some(message) = message else {
        room_error(
            room_handle,
            conversion_error.unwrap_or_else(|| "Unable to encode Colyseus message".into()),
        );
        return;
    };
    unsafe {
        if let Some(number) = message_type
            .to_str()
            .ok()
            .and_then(|kind| kind.strip_prefix('i'))
            .and_then(|number| number.parse::<i32>().ok())
        {
            colyseus_room_send_int(room_ptr as *mut Room, number, message);
        } else {
            colyseus_room_send(room_ptr as *mut Room, message_type.as_ptr(), message);
        }
        colyseus_message_free(message);
    }
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_send(_room: u64, _message_type: &str, _payload: &str) {
    unsupported();
}

#[cfg(colyseus_native_sdk)]
pub fn room_send_bytes(room_handle: u64, message_type: &str, bytes_json: &str) {
    use sdk::*;
    let (room_ptr, _) = match room_entry(room_handle) {
        Some(value) => value,
        None => return,
    };
    let message_type = match c_string(message_type) {
        Ok(value) => value,
        Err(error) => {
            room_error(room_handle, error);
            return;
        }
    };
    let bytes: Vec<u8> = match serde_json::from_str::<Vec<u8>>(bytes_json) {
        Ok(value) => value,
        Err(error) => {
            room_error(
                room_handle,
                format!("sendBytes expects a JSON array of byte values: {error}"),
            );
            return;
        }
    };
    unsafe {
        if let Some(number) = message_type
            .to_str()
            .ok()
            .and_then(|kind| kind.strip_prefix('i'))
            .and_then(|number| number.parse::<i32>().ok())
        {
            colyseus_room_send_int_bytes(
                room_ptr as *mut Room,
                number,
                bytes.as_ptr(),
                bytes.len(),
            );
        } else {
            colyseus_room_send_bytes(
                room_ptr as *mut Room,
                message_type.as_ptr(),
                bytes.as_ptr(),
                bytes.len(),
            );
        }
    }
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_send_bytes(_room: u64, _message_type: &str, _bytes: &str) {
    unsupported();
}

#[cfg(colyseus_native_sdk)]
pub fn room_request(room_handle: u64, message_type: &str, payload_json: &str) -> u64 {
    use sdk::*;
    let (room_ptr, _) = match room_entry(room_handle) {
        Some(value) => value,
        None => return 0,
    };
    let message_type = match c_string(message_type) {
        Ok(value) => value,
        Err(error) => {
            room_error(room_handle, error);
            return 0;
        }
    };
    let value = match serde_json::from_str::<serde_json::Value>(if payload_json.is_empty() {
        "null"
    } else {
        payload_json
    }) {
        Ok(value) => value,
        Err(error) => {
            room_error(
                room_handle,
                format!("Invalid Colyseus request JSON: {error}"),
            );
            return 0;
        }
    };
    let mut conversion_error = None;
    let Some(message) = (unsafe { json_to_message(&value, 0, &mut conversion_error) }) else {
        room_error(
            room_handle,
            conversion_error.unwrap_or_else(|| "Unable to encode Colyseus request".into()),
        );
        return 0;
    };
    let mut length = 0usize;
    let encoded = unsafe { colyseus_message_encode(message, &mut length) };
    unsafe {
        colyseus_message_free(message);
    }
    if encoded.is_null() || length == 0 {
        return 0;
    }
    let request_handle = {
        let mut state = registry();
        allocate_handle(&mut state)
    };
    let context = Box::into_raw(Box::new(RequestContext {
        room: room_handle,
        request: request_handle,
    }));
    let sdk_request = unsafe {
        colyseus_room_request_encoded_reply(
            room_ptr as *mut Room,
            message_type.as_ptr(),
            encoded,
            length,
            Some(request_complete),
            context as *mut c_void,
        )
    };
    unsafe {
        colyseus_message_encoded_free(encoded, length);
    }
    if sdk_request == 0 {
        unsafe {
            drop(Box::from_raw(context));
        }
        room_error(room_handle, "Colyseus request could not be sent".into());
        return 0;
    }
    if let Some(entry) = registry().rooms.get_mut(&room_handle) {
        entry.requests.insert(
            request_handle,
            RequestMeta {
                sdk_id: sdk_request,
                context: context as usize,
            },
        );
        request_handle
    } else {
        unsafe {
            colyseus_room_cancel_request(room_ptr as *mut Room, sdk_request);
            drop(Box::from_raw(context));
        }
        0
    }
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_request(_room: u64, _message_type: &str, _payload: &str) -> u64 {
    unsupported();
    0
}

#[cfg(colyseus_native_sdk)]
pub fn room_cancel_request(room_handle: u64, request_handle: u64) {
    use sdk::*;
    let (room_ptr, request) = {
        let mut state = registry();
        let Some(entry) = state.rooms.get_mut(&room_handle) else {
            return;
        };
        let Some(request) = entry.requests.remove(&request_handle) else {
            return;
        };
        (entry.room, request)
    };
    unsafe {
        colyseus_room_cancel_request(room_ptr as *mut Room, request.sdk_id);
        drop(Box::from_raw(request.context as *mut RequestContext));
    }
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_cancel_request(_room: u64, _request: u64) {
    unsupported();
}

#[cfg(colyseus_native_sdk)]
pub fn room_leave(room_handle: u64, consented: bool) {
    let Some((room_ptr, _)) = room_entry(room_handle) else {
        return;
    };
    if !consented && unsafe { sdk::colyseus_room_is_connected(room_ptr as *const sdk::Room) } {
        // The C SDK reports a locally initiated unconsented close as a normal
        // leave (1000/"Leave"). The TypeScript SDK reports the same operation
        // through onDrop so callers can manually reconnect from the token.
        push_event(
            serde_json::json!({"kind":"drop","room":room_handle,"code":1006,"reason":"Unconsented leave"}),
        );
    }
    unsafe {
        sdk::colyseus_room_leave(room_ptr as *mut sdk::Room, consented);
    }
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_leave(_room: u64, _consented: bool) {
    unsupported();
}

#[cfg(colyseus_native_sdk)]
pub fn room_is_connected(room_handle: u64) -> bool {
    let Some((room_ptr, _)) = room_entry(room_handle) else {
        return false;
    };
    unsafe { sdk::colyseus_room_is_connected(room_ptr as *const sdk::Room) }
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_is_connected(_room: u64) -> bool {
    false
}

#[cfg(colyseus_native_sdk)]
pub fn room_is_reconnecting(room_handle: u64) -> bool {
    let Some((room_ptr, _)) = room_entry(room_handle) else {
        return false;
    };
    unsafe { sdk::colyseus_room_is_reconnecting(room_ptr as *const sdk::Room) }
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_is_reconnecting(_room: u64) -> bool {
    false
}

#[cfg(colyseus_native_sdk)]
pub fn room_id(room_handle: u64) -> String {
    room_string(room_handle, |room| unsafe {
        sdk::colyseus_room_get_id(room as *const sdk::Room)
    })
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_id(_room: u64) -> String {
    String::new()
}

#[cfg(colyseus_native_sdk)]
pub fn room_session_id(room_handle: u64) -> String {
    room_string(room_handle, |room| unsafe {
        sdk::colyseus_room_get_session_id(room as *const sdk::Room)
    })
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_session_id(_room: u64) -> String {
    String::new()
}

#[cfg(colyseus_native_sdk)]
pub fn room_reconnection_token(room_handle: u64) -> String {
    room_string(room_handle, |room| unsafe {
        sdk::colyseus_room_get_reconnection_token(room as *const sdk::Room)
    })
}
#[cfg(not(colyseus_native_sdk))]
pub fn room_reconnection_token(_room: u64) -> String {
    String::new()
}

fn room_error(room: u64, message: String) {
    push_event(serde_json::json!({"kind":"error","room":room,"code":-1,"message":message}));
}

#[cfg(not(colyseus_native_sdk))]
fn unsupported() {
    push_event(
        serde_json::json!({"kind":"clientError","message":"The Colyseus Native SDK is currently bundled for Linux x86_64 GNU only."}),
    );
}

#[cfg(colyseus_native_sdk)]
fn room_entry(room_handle: u64) -> Option<(usize, u64)> {
    let state = registry();
    state
        .rooms
        .get(&room_handle)
        .map(|entry| (entry.room, entry.client))
}

#[cfg(colyseus_native_sdk)]
fn room_string(room_handle: u64, getter: impl FnOnce(usize) -> *const c_char) -> String {
    let Some((room_ptr, _)) = room_entry(room_handle) else {
        return String::new();
    };
    let ptr = getter(room_ptr);
    if ptr.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() }
    }
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn matchmake_success(room: *mut sdk::Room, userdata: *mut c_void) {
    let context = &*(userdata as *const JoinContext);
    let room_handle = context.room;
    {
        let mut state = registry();
        state.pending_joins.remove(&room_handle);
        state.rooms.insert(
            room_handle,
            RoomEntry {
                room: room as usize,
                client: context.client,
                join_context: userdata as usize,
                requests: HashMap::new(),
            },
        );
    }
    let handle = room_handle as usize as *mut c_void;
    sdk::colyseus_room_on_join(room, Some(room_joined), handle);
    sdk::colyseus_room_on_state_change(room, Some(room_state_changed), handle);
    sdk::colyseus_room_on_error(room, Some(room_error_event), userdata);
    sdk::colyseus_room_on_leave(room, Some(room_left), handle);
    sdk::colyseus_room_on_drop(room, Some(room_dropped), handle);
    sdk::colyseus_room_on_reconnect(room, Some(room_reconnected), handle);
    sdk::colyseus_room_on_message_any_with_type(room, Some(room_message), handle);
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn matchmake_error(code: c_int, message: *const c_char, userdata: *mut c_void) {
    let context = Box::from_raw(userdata as *mut JoinContext);
    let text = if message.is_null() {
        "Colyseus matchmaking failed".to_string()
    } else {
        CStr::from_ptr(message).to_string_lossy().into_owned()
    };
    registry().pending_joins.remove(&context.room);
    push_event(serde_json::json!({"kind":"error","room":context.room,"code":code,"message":text}));
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn room_joined(userdata: *mut c_void) {
    let handle = userdata as usize as u64;
    let Some((room, _)) = room_entry(handle) else {
        return;
    };
    let id = room_string(handle, |ptr| {
        sdk::colyseus_room_get_id(ptr as *const sdk::Room)
    });
    let session = room_string(handle, |ptr| {
        sdk::colyseus_room_get_session_id(ptr as *const sdk::Room)
    });
    let token = room_string(handle, |ptr| {
        sdk::colyseus_room_get_reconnection_token(ptr as *const sdk::Room)
    });
    let state = unsafe { state_to_json(sdk::colyseus_room_get_state(room as *mut sdk::Room)) };
    push_event(
        serde_json::json!({"kind":"join","room":handle,"roomId":id,"sessionId":session,"reconnectionToken":token,"state":state}),
    );
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn room_state_changed(userdata: *mut c_void) {
    let handle = userdata as usize as u64;
    let Some((room, _)) = room_entry(handle) else {
        return;
    };
    let state = state_to_json(sdk::colyseus_room_get_state(room as *mut sdk::Room));
    push_event(serde_json::json!({"kind":"state","room":handle,"state":state}));
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn room_error_event(code: c_int, message: *const c_char, userdata: *mut c_void) {
    let context = &*(userdata as *const JoinContext);
    let text = if message.is_null() {
        String::new()
    } else {
        CStr::from_ptr(message).to_string_lossy().into_owned()
    };
    push_event(serde_json::json!({"kind":"error","room":context.room,"code":code,"message":text}));
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn room_left(code: c_int, reason: *const c_char, userdata: *mut c_void) {
    let handle = userdata as usize as u64;
    let text = if reason.is_null() {
        String::new()
    } else {
        CStr::from_ptr(reason).to_string_lossy().into_owned()
    };
    push_event(serde_json::json!({"kind":"leave","room":handle,"code":code,"reason":text}));
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn room_dropped(code: c_int, reason: *const c_char, userdata: *mut c_void) {
    let handle = userdata as usize as u64;
    let text = if reason.is_null() {
        String::new()
    } else {
        CStr::from_ptr(reason).to_string_lossy().into_owned()
    };
    push_event(serde_json::json!({"kind":"drop","room":handle,"code":code,"reason":text}));
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn room_reconnected(userdata: *mut c_void) {
    let handle = userdata as usize as u64;
    push_event(serde_json::json!({"kind":"reconnect","room":handle}));
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn room_message(
    message_type: *const c_char,
    reader: *mut sdk::Reader,
    userdata: *mut c_void,
) {
    let handle = userdata as usize as u64;
    let message_type = if message_type.is_null() {
        String::new()
    } else {
        CStr::from_ptr(message_type).to_string_lossy().into_owned()
    };
    let value = reader_to_json(reader, 0);
    push_event(
        serde_json::json!({"kind":"message","room":handle,"type":message_type,"data":value}),
    );
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn request_complete(
    outcome: c_int,
    data: *const u8,
    length: usize,
    reason: *const c_char,
    userdata: *mut c_void,
) {
    let context = Box::from_raw(userdata as *mut RequestContext);
    if let Some(entry) = registry().rooms.get_mut(&context.room) {
        entry.requests.remove(&context.request);
    }
    let value = if data.is_null() || length == 0 {
        serde_json::Value::Null
    } else {
        let reader = sdk::colyseus_message_reader_create(data, length);
        if reader.is_null() {
            serde_json::Value::Null
        } else {
            let value = reader_to_json(reader, 0);
            sdk::colyseus_message_reader_free(reader);
            value
        }
    };
    let reason = if reason.is_null() {
        String::new()
    } else {
        CStr::from_ptr(reason).to_string_lossy().into_owned()
    };
    push_event(
        serde_json::json!({"kind":"request","room":context.room,"request":context.request,"outcome":outcome,"data":value,"reason":reason}),
    );
}

#[cfg(colyseus_native_sdk)]
unsafe fn json_to_message(
    value: &serde_json::Value,
    depth: usize,
    error: &mut Option<String>,
) -> Option<*mut sdk::Message> {
    use sdk::*;
    if depth > 64 {
        *error = Some("Colyseus message nesting exceeded 64 levels".into());
        return None;
    }
    match value {
        serde_json::Value::Null => Some(colyseus_message_nil_create()),
        serde_json::Value::Bool(value) => Some(colyseus_message_bool_create(*value)),
        serde_json::Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Some(colyseus_message_int_create(value))
            } else if let Some(value) = value.as_u64() {
                Some(colyseus_message_uint_create(value))
            } else {
                value
                    .as_f64()
                    .map(|number| colyseus_message_float_create(number))
            }
        }
        serde_json::Value::String(value) => match c_string(value) {
            Ok(value) => Some(colyseus_message_str_create(value.as_ptr())),
            Err(message) => {
                *error = Some(message);
                None
            }
        },
        serde_json::Value::Array(values) => {
            let array = colyseus_message_array_create();
            for value in values {
                let Some(child) = json_to_message(value, depth + 1, error) else {
                    colyseus_message_free(array);
                    return None;
                };
                colyseus_message_array_push_msg(array, child);
                colyseus_message_free(child);
            }
            Some(array)
        }
        serde_json::Value::Object(values) => {
            let map = colyseus_message_map_create();
            for (key, value) in values {
                let key = match c_string(key) {
                    Ok(key) => key,
                    Err(message) => {
                        *error = Some(message);
                        colyseus_message_free(map);
                        return None;
                    }
                };
                if value.is_null() {
                    colyseus_message_map_put_nil(map, key.as_ptr());
                    continue;
                }
                match value {
                    serde_json::Value::Bool(value) => {
                        colyseus_message_map_put_bool(map, key.as_ptr(), *value)
                    }
                    serde_json::Value::Number(value) if value.as_i64().is_some() => {
                        colyseus_message_map_put_int(map, key.as_ptr(), value.as_i64().unwrap())
                    }
                    serde_json::Value::Number(value) if value.as_u64().is_some() => {
                        colyseus_message_map_put_uint(map, key.as_ptr(), value.as_u64().unwrap())
                    }
                    serde_json::Value::Number(value) => colyseus_message_map_put_float(
                        map,
                        key.as_ptr(),
                        value.as_f64().unwrap_or(0.0),
                    ),
                    serde_json::Value::String(value) => {
                        let Ok(value) = c_string(value) else {
                            *error = Some("Colyseus string cannot contain a NUL character".into());
                            colyseus_message_free(map);
                            return None;
                        };
                        colyseus_message_map_put_str(map, key.as_ptr(), value.as_ptr());
                    }
                    _ => {
                        let Some(child) = json_to_message(value, depth + 1, error) else {
                            colyseus_message_free(map);
                            return None;
                        };
                        colyseus_message_map_put_msg(map, key.as_ptr(), child);
                        colyseus_message_free(child);
                    }
                }
            }
            Some(map)
        }
    }
}

#[cfg(colyseus_native_sdk)]
unsafe fn reader_to_json(reader: *mut sdk::Reader, depth: usize) -> serde_json::Value {
    use sdk::*;
    if reader.is_null() || depth > 64 {
        return serde_json::Value::Null;
    }
    match colyseus_message_reader_get_type(reader) {
        0 => serde_json::Value::Null,
        1 => serde_json::Value::Bool(colyseus_message_reader_get_bool(reader)),
        2 => serde_json::json!(colyseus_message_reader_get_int(reader)),
        3 => serde_json::json!(colyseus_message_reader_get_uint(reader)),
        4 => serde_json::json!(colyseus_message_reader_get_float(reader)),
        5 => {
            let mut length = 0usize;
            let data = colyseus_message_reader_get_str(reader, &mut length);
            if data.is_null() {
                serde_json::Value::String(String::new())
            } else {
                let bytes = std::slice::from_raw_parts(data as *const u8, length);
                serde_json::Value::String(String::from_utf8_lossy(bytes).into_owned())
            }
        }
        6 => {
            let mut length = 0usize;
            let data = colyseus_message_reader_get_bin(reader, &mut length);
            if data.is_null() {
                serde_json::Value::Array(Vec::new())
            } else {
                serde_json::Value::Array(
                    std::slice::from_raw_parts(data, length)
                        .iter()
                        .map(|byte| serde_json::json!(*byte))
                        .collect(),
                )
            }
        }
        7 => {
            let length = colyseus_message_reader_get_array_size(reader).min(65536);
            let mut values = Vec::with_capacity(length);
            for index in 0..length {
                let child = colyseus_message_reader_get_array_element(reader, index);
                values.push(reader_to_json(child, depth + 1));
                if !child.is_null() {
                    colyseus_message_reader_free(child);
                }
            }
            serde_json::Value::Array(values)
        }
        8 => {
            let mut object = serde_json::Map::new();
            let mut iterator = colyseus_message_reader_map_iterator(reader);
            for _ in 0..iterator.total_size.min(65536) {
                let mut key = std::ptr::null_mut();
                let mut value = std::ptr::null_mut();
                if !colyseus_message_map_iterator_next(&mut iterator, &mut key, &mut value) {
                    break;
                }
                let key_value = if key.is_null() {
                    String::new()
                } else {
                    let mut length = 0usize;
                    let data = colyseus_message_reader_get_str(key, &mut length);
                    if data.is_null() {
                        String::new()
                    } else {
                        String::from_utf8_lossy(std::slice::from_raw_parts(
                            data as *const u8,
                            length,
                        ))
                        .into_owned()
                    }
                };
                object.insert(key_value, reader_to_json(value, depth + 1));
                if !key.is_null() {
                    colyseus_message_reader_free(key);
                }
                if !value.is_null() {
                    colyseus_message_reader_free(value);
                }
            }
            serde_json::Value::Object(object)
        }
        _ => serde_json::Value::Null,
    }
}

#[cfg(colyseus_native_sdk)]
unsafe fn state_to_json(state: *mut c_void) -> serde_json::Value {
    use sdk::*;
    if state.is_null() {
        return serde_json::Value::Null;
    }
    let base = state as *mut SchemaBase;
    if (*base).vtable.is_null() {
        return serde_json::Value::Null;
    }
    if colyseus_vtable_is_dynamic((*base).vtable) {
        let mut object = serde_json::Map::new();
        colyseus_dynamic_schema_foreach(
            state,
            Some(dynamic_field_to_json),
            &mut object as *mut _ as *mut c_void,
        );
        serde_json::Value::Object(object)
    } else {
        let vtable = &*(*base).vtable;
        let mut object = serde_json::Map::new();
        for index in 0..vtable.field_count.max(0) as usize {
            let field = &*vtable.fields.add(index);
            if field.name.is_null() {
                continue;
            }
            let name = CStr::from_ptr(field.name).to_string_lossy().into_owned();
            let field_ptr = (state as *const u8).add(field.offset);
            let value = static_field_to_json(
                field.field_type,
                field_ptr,
                field.child_primitive_type,
                field.child_vtable,
                0,
            );
            object.insert(name, value);
        }
        serde_json::Value::Object(object)
    }
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn dynamic_field_to_json(
    _index: c_int,
    name: *const c_char,
    value: *mut sdk::DynamicValue,
    userdata: *mut c_void,
) {
    if name.is_null() || value.is_null() || userdata.is_null() {
        return;
    }
    let name = CStr::from_ptr(name).to_string_lossy().into_owned();
    let object = &mut *(userdata as *mut serde_json::Map<String, serde_json::Value>);
    let value = dynamic_value_to_json(&*value, 0);
    object.insert(name, value);
}

#[cfg(colyseus_native_sdk)]
unsafe fn dynamic_value_to_json(value: &sdk::DynamicValue, depth: usize) -> serde_json::Value {
    if depth > 64 {
        return serde_json::Value::Null;
    }
    match value.field_type {
        0 => {
            if value.data.string.is_null() {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(
                    CStr::from_ptr(value.data.string)
                        .to_string_lossy()
                        .into_owned(),
                )
            }
        }
        1 => serde_json::json!(value.data.number),
        2 => serde_json::Value::Bool(value.data.boolean),
        3 => serde_json::json!(value.data.int8),
        4 => serde_json::json!(value.data.uint8),
        5 => serde_json::json!(value.data.int16),
        6 => serde_json::json!(value.data.uint16),
        7 => serde_json::json!(value.data.int32),
        8 => serde_json::json!(value.data.uint32),
        9 => serde_json::json!(value.data.int64),
        10 => serde_json::json!(value.data.uint64),
        11 => serde_json::json!(value.data.float32),
        12 => serde_json::json!(value.data.number),
        13 => schema_to_json(value.data.reference, depth + 1),
        14 => array_to_json(value.data.array, depth + 1),
        15 => map_to_json(value.data.map, depth + 1),
        _ => serde_json::Value::Null,
    }
}

#[cfg(colyseus_native_sdk)]
unsafe fn schema_to_json(schema: *mut c_void, depth: usize) -> serde_json::Value {
    if schema.is_null() || depth > 64 {
        return serde_json::Value::Null;
    }
    let base = schema as *mut sdk::SchemaBase;
    if (*base).vtable.is_null() {
        return serde_json::Value::Null;
    }
    if sdk::colyseus_vtable_is_dynamic((*base).vtable) {
        let mut object = serde_json::Map::new();
        sdk::colyseus_dynamic_schema_foreach(
            schema,
            Some(dynamic_field_to_json),
            &mut object as *mut _ as *mut c_void,
        );
        serde_json::Value::Object(object)
    } else {
        state_to_json(schema)
    }
}

#[cfg(colyseus_native_sdk)]
#[cfg(colyseus_native_sdk)]
unsafe fn array_to_json(array: *mut sdk::ArraySchema, depth: usize) -> serde_json::Value {
    if array.is_null() || depth > 64 {
        return serde_json::Value::Null;
    }
    let schema_child = (*array).has_schema_child;
    let primitive = (*array).child_primitive_type;
    let mut values = Vec::<(usize, serde_json::Value)>::new();
    // The callback needs collection metadata to decode primitive pointers; build
    // directly from the linked list so it remains local to this call.
    let mut item = (*array).items;
    while !item.is_null() && values.len() < 65536 {
        let current = &*item;
        let value = if schema_child {
            schema_to_json(current.value, depth + 1)
        } else {
            primitive_pointer_to_json(current.value, primitive)
        };
        values.push((current.index.max(0) as usize, value));
        item = current.next;
    }
    values.sort_by_key(|pair| pair.0);
    serde_json::Value::Array(values.into_iter().map(|pair| pair.1).collect())
}

#[cfg(colyseus_native_sdk)]
unsafe extern "C" fn map_item_to_json(
    key: *const c_char,
    value: *mut c_void,
    userdata: *mut c_void,
) {
    if key.is_null() || userdata.is_null() {
        return;
    }
    let context = &mut *(userdata as *mut MapCallbackContext);
    let key = CStr::from_ptr(key).to_string_lossy().into_owned();
    let json = if context.schema_child {
        schema_to_json(value, context.depth + 1)
    } else {
        primitive_pointer_to_json(value, context.primitive)
    };
    context.object.insert(key, json);
}

#[cfg(colyseus_native_sdk)]
struct MapCallbackContext {
    object: serde_json::Map<String, serde_json::Value>,
    schema_child: bool,
    primitive: *const c_char,
    depth: usize,
}

#[cfg(colyseus_native_sdk)]
unsafe fn map_to_json(map: *mut sdk::MapSchema, depth: usize) -> serde_json::Value {
    if map.is_null() || depth > 64 {
        return serde_json::Value::Null;
    }
    let mut context = MapCallbackContext {
        object: serde_json::Map::new(),
        schema_child: (*map).has_schema_child,
        primitive: (*map).child_primitive_type,
        depth,
    };
    sdk::colyseus_map_schema_foreach(
        map,
        Some(map_item_to_json),
        &mut context as *mut _ as *mut c_void,
    );
    serde_json::Value::Object(context.object)
}

#[cfg(colyseus_native_sdk)]
unsafe fn primitive_pointer_to_json(
    value: *mut c_void,
    primitive: *const c_char,
) -> serde_json::Value {
    if value.is_null() {
        return serde_json::Value::Null;
    }
    let type_name = if primitive.is_null() {
        ""
    } else {
        CStr::from_ptr(primitive).to_str().unwrap_or("")
    };
    match type_name {
        "string" => serde_json::Value::String(
            CStr::from_ptr(value as *const c_char)
                .to_string_lossy()
                .into_owned(),
        ),
        "boolean" => serde_json::Value::Bool(*(value as *const bool)),
        "int8" => serde_json::json!(*(value as *const i8)),
        "uint8" => serde_json::json!(*(value as *const u8)),
        "int16" => serde_json::json!(*(value as *const i16)),
        "uint16" => serde_json::json!(*(value as *const u16)),
        "int32" => serde_json::json!(*(value as *const i32)),
        "uint32" => serde_json::json!(*(value as *const u32)),
        "int64" => serde_json::json!(*(value as *const i64)),
        "uint64" => serde_json::json!(*(value as *const u64)),
        "float32" => serde_json::json!(*(value as *const f32)),
        "number" | "float64" => serde_json::json!(*(value as *const f64)),
        _ => serde_json::Value::Null,
    }
}

#[cfg(colyseus_native_sdk)]
#[cfg(colyseus_native_sdk)]
unsafe fn static_field_to_json(
    field_type: c_int,
    value: *const u8,
    child_primitive_type: *const c_char,
    child_vtable: *const sdk::SchemaVtable,
    depth: usize,
) -> serde_json::Value {
    match field_type {
        0 => {
            let ptr = *(value as *const *const c_char);
            if ptr.is_null() {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(CStr::from_ptr(ptr).to_string_lossy().into_owned())
            }
        }
        1 => serde_json::json!(*(value as *const f64)),
        2 => serde_json::Value::Bool(*(value as *const bool)),
        3 => serde_json::json!(*(value as *const i8)),
        4 => serde_json::json!(*(value as *const u8)),
        5 => serde_json::json!(*(value as *const i16)),
        6 => serde_json::json!(*(value as *const u16)),
        7 => serde_json::json!(*(value as *const i32)),
        8 => serde_json::json!(*(value as *const u32)),
        9 => serde_json::json!(*(value as *const i64)),
        10 => serde_json::json!(*(value as *const u64)),
        11 => serde_json::json!(*(value as *const f32)),
        12 => serde_json::json!(*(value as *const f64)),
        13 => schema_to_json(*(value as *const *mut c_void), depth + 1),
        14 => array_to_json(*(value as *const *mut sdk::ArraySchema), depth + 1),
        15 => map_to_json(*(value as *const *mut sdk::MapSchema), depth + 1),
        _ => {
            let _ = (child_primitive_type, child_vtable);
            serde_json::Value::Null
        }
    }
}
