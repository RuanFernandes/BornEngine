//! Perry string ABI: the header layout strings carry across the FFI.
//!
//! This mirrors `perry_runtime::string::StringHeader` (see
//! `perry/crates/perry-runtime/src/string/mod.rs`) — defined locally so the
//! engine doesn't pull the whole perry-runtime crate in as a dependency.
//!
//! ## Upgrade protocol
//!
//! Perry owns this layout and has changed it before (0.5.18 added `flags`;
//! engines built against the old 16-byte header read a 4-byte garbage
//! prefix on every string). There is no version symbol exported by the
//! Perry runtime to handshake against, so the defenses are:
//!
//!   1. Compile-time size/offset assertions below — any local edit that
//!      diverges from the documented layout fails the build.
//!   2. [`header_looks_valid`] — invariant checks on every incoming
//!      header. A Perry-side layout change makes these fire on the first
//!      string the engine receives (typically the window title in
//!      `bloom_init_window`), turning silent corruption into a loud
//!      log-once diagnostic.
//!   3. Header invariants and checked UTF-8 conversion reject malformed
//!      readable values with an empty string + diagnostic. They cannot prove
//!      that an arbitrary pointer or claimed payload length is readable;
//!      the FFI caller must uphold that part of the contract.
//!
//! When bumping Perry across a runtime-ABI change: update the struct,
//! the assertions, and the doc reference above in the same commit.

/// Header for heap-allocated Perry strings. UTF-8 payload follows
/// immediately after the header.
#[repr(C)]
pub struct StringHeader {
    /// Length in UTF-16 code units (JS `.length` semantics). At offset 0
    /// for Perry's inline codegen.
    pub utf16_len: u32,
    /// Length in UTF-8 bytes.
    pub byte_len: u32,
    /// Capacity in bytes (allocated space for data).
    pub capacity: u32,
    /// Reference hint: 0=shared, 1=unique (in-place append OK).
    pub refcount: u32,
    /// Bit flags (STRING_FLAG_HAS_LONE_SURROGATES = 1). Added in Perry
    /// 0.5.18.
    pub flags: u32,
}

// Layout is an ABI contract — fail the build if the struct drifts from the
// documented Perry layout.
const _: () = {
    assert!(std::mem::size_of::<StringHeader>() == 20);
    assert!(std::mem::offset_of!(StringHeader, utf16_len) == 0);
    assert!(std::mem::offset_of!(StringHeader, byte_len) == 4);
    assert!(std::mem::offset_of!(StringHeader, capacity) == 8);
    assert!(std::mem::offset_of!(StringHeader, refcount) == 12);
    assert!(std::mem::offset_of!(StringHeader, flags) == 16);
};

/// All flag bits Perry currently defines.
const KNOWN_FLAGS: u32 = 1; // STRING_FLAG_HAS_LONE_SURROGATES

/// Sanity-check a header against invariants that hold for every string the
/// current Perry runtime produces. A failed check means either a corrupt
/// pointer or — the case this exists for — a Perry-side layout change
/// shifting which u32 lands in which field.
fn header_looks_valid(h: &StringHeader) -> bool {
    h.byte_len <= h.capacity
        && h.capacity < (1 << 31)
        // utf16 length is never larger than the utf8 byte length
        && h.utf16_len <= h.byte_len
        && (h.flags & !KNOWN_FLAGS) == 0
}

fn abi_mismatch_warn_once(what: &str) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static WARNED: AtomicBool = AtomicBool::new(false);
    if !WARNED.swap(true, Ordering::Relaxed) {
        crate::ffi::log_error(&format!(
            "bloom: incoming Perry string failed ABI validation ({what}). \
             This usually means the Perry runtime's StringHeader layout \
             changed — see native/shared/src/string_header.rs for the \
             upgrade protocol. Returning empty strings instead of reading \
             garbage; further occurrences are suppressed."
        ));
    }
}

/// Decode a Perry string passed through the native FFI.
///
/// Heap strings arrive as a pointer to `StringHeader`. Perry may also pass a
/// short string inline as its bytes in the low 32 bits of the argument value.
/// Copy both forms so the result remains valid after the FFI call.
/// Like [`str_from_header`], but says whether it FAILED rather than papering over it
/// with an empty string.
///
/// The distinction is not academic. `bloom_write_file` used `str_from_header`, got
/// `""` back when a string failed ABI validation, wrote a ZERO-BYTE FILE, and
/// returned SUCCESS. The editor's save path therefore destroyed every world it
/// saved and reported that it had saved it. An empty string and a failed string are
/// not the same thing, and any FFI that *persists* its input has to know which it
/// is holding.
///
/// # Safety
///
/// For a heap string, `ptr` must point to a readable Perry `StringHeader`
/// followed by at least `byte_len` readable bytes, and remain valid for this
/// call. Null and Perry's 32-bit inline-string representations are also valid.
/// Header checks detect malformed readable data; they cannot establish that
/// an arbitrary address is mapped or that its claimed payload is allocated.
pub unsafe fn try_str_from_header(ptr: *const u8) -> Option<String> {
    let address = ptr as usize;
    if address == 0 {
        return Some(String::new());
    }

    #[cfg(target_pointer_width = "64")]
    if address <= u32::MAX as usize {
        let bytes = address.to_le_bytes();
        let inline_bytes = &bytes[..4];
        let len = inline_bytes.iter().position(|byte| *byte == 0).unwrap_or(4);
        return match std::str::from_utf8(&inline_bytes[..len]) {
            Ok(value) if value.chars().any(char::is_control) => Some(String::new()),
            Ok(value) => Some(value.to_owned()),
            _ => {
                abi_mismatch_warn_once("invalid inline string");
                None
            }
        };
    }

    if address < 0x1000 || !address.is_multiple_of(std::mem::align_of::<StringHeader>()) {
        abi_mismatch_warn_once("invalid or unaligned header pointer");
        return None;
    }
    unsafe {
        let header = &*(ptr as *const StringHeader);
        if !header_looks_valid(header) {
            abi_mismatch_warn_once("header invariants violated");
            return None;
        }
        let len = header.byte_len as usize;
        let data = ptr.add(std::mem::size_of::<StringHeader>());
        match std::str::from_utf8(std::slice::from_raw_parts(data, len)) {
            Ok(s) => Some(s.to_owned()),
            Err(_) => {
                abi_mismatch_warn_once("payload is not UTF-8");
                None
            }
        }
    }
}

/// Decode a Perry string, returning an empty string if validation fails.
///
/// # Safety
///
/// The same pointer validity requirements as [`try_str_from_header`] apply.
pub unsafe fn str_from_header(ptr: *const u8) -> String {
    unsafe { try_str_from_header(ptr) }.unwrap_or_default()
}

/// Allocate a Perry heap string suitable for returning across the FFI
/// boundary (declared as `returns: "string"` in package.json).
///
/// Older engine code allocated the 12-byte Perry 0.4.x header by hand and
/// Perry's 0.5.x runtime read 8 bytes into the payload. Always go through
/// this helper — the layout comes from the `StringHeader` type, which the
/// compile-time assertions above pin to the documented ABI.
/// EN-020 — Perry's string scanners (`split`, `indexOf`, …) step
/// word-at-a-time and may read up to a word past `byte_len`. With an
/// exactly-sized allocation that lands flush against an unmapped page,
/// that overread is an access violation (observed 3/3 in the shooter as
/// `perry_fn_…getProfilerOverlay` / `…getProfilerFrameHistory`, faulting
/// reads at page ends; historical EN-020 signature `main.exe+0xe8e5`,
/// read at `0x…FFF8`). Every string this function returns is scanned by
/// Perry, so keep a zeroed tail pad behind the payload — `capacity`
/// still reports `byte_len`, so Perry never writes into the pad.
const TAIL_PAD: usize = 16;

pub fn alloc_perry_string(s: &str) -> *const u8 {
    let bytes = s.as_bytes();
    let byte_len = bytes.len();
    // ASCII fast path: utf16_len == byte_len when every byte is < 0x80.
    let utf16_len = if bytes.iter().all(|&b| b < 0x80) {
        byte_len
    } else {
        s.encode_utf16().count()
    };
    let total = std::mem::size_of::<StringHeader>() + byte_len + TAIL_PAD;
    let layout = std::alloc::Layout::from_size_align(total, 4).unwrap();
    unsafe {
        let ptr = std::alloc::alloc(layout);
        if ptr.is_null() {
            return std::ptr::null();
        }
        (ptr as *mut StringHeader).write(StringHeader {
            utf16_len: utf16_len as u32,
            byte_len: byte_len as u32,
            capacity: byte_len as u32,
            refcount: 1, // unique
            flags: 0,
        });
        std::ptr::copy_nonoverlapping(
            bytes.as_ptr(),
            ptr.add(std::mem::size_of::<StringHeader>()),
            byte_len,
        );
        std::ptr::write_bytes(
            ptr.add(std::mem::size_of::<StringHeader>() + byte_len),
            0,
            TAIL_PAD,
        );
        ptr
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_ascii() {
        let p = alloc_perry_string("hello bloom");
        assert_eq!(unsafe { str_from_header(p) }, "hello bloom");
    }

    #[test]
    fn round_trip_multibyte() {
        let p = alloc_perry_string("héllo 🌸");
        assert_eq!(unsafe { str_from_header(p) }, "héllo 🌸");
        // utf16_len: 'héllo ' = 6 units, emoji = 2 (surrogate pair)
        let h = unsafe { &*(p as *const StringHeader) };
        assert_eq!(h.utf16_len, 8);
        assert_eq!(h.byte_len, "héllo 🌸".len() as u32);
    }

    #[test]
    fn rejects_null_and_low_pointers() {
        assert_eq!(
            unsafe { try_str_from_header(std::ptr::null()) },
            Some(String::new())
        );
        assert_eq!(unsafe { str_from_header(0x10 as *const u8) }, "");
    }

    #[test]
    fn decodes_inline_short_strings() {
        assert_eq!(unsafe { str_from_header(0x6c6c756e as *const u8) }, "null");
        assert_eq!(unsafe { str_from_header(0x7d7b as *const u8) }, "{}");
        assert_eq!(unsafe { str_from_header(b'x' as *const u8) }, "x");
    }

    #[test]
    fn rejects_unaligned_header_pointers() {
        assert_eq!(
            unsafe { try_str_from_header(0x1_0000_0001 as *const u8) },
            None
        );
    }

    #[test]
    fn rejects_implausible_header() {
        // byte_len > capacity — the signature of a shifted layout.
        let bogus = StringHeader {
            utf16_len: 7,
            byte_len: 100,
            capacity: 8,
            refcount: 1,
            flags: 0,
        };
        let ptr = alloc_perry_string("payload");
        unsafe {
            (ptr as *mut StringHeader).write(bogus);
        }
        assert_eq!(unsafe { try_str_from_header(ptr) }, None);
    }

    #[test]
    fn rejects_unknown_header_flags() {
        let ptr = alloc_perry_string("payload");
        unsafe {
            (*(ptr as *mut StringHeader)).flags = 2;
        }
        assert_eq!(unsafe { try_str_from_header(ptr) }, None);
    }

    #[test]
    fn tail_pad_present_and_zeroed() {
        // EN-020 regression guard: a word-stepping scanner may read past
        // byte_len; the pad must exist and read as NULs.
        let p = alloc_perry_string("abc");
        let payload_end = std::mem::size_of::<StringHeader>() + 3;
        for i in 0..TAIL_PAD {
            assert_eq!(
                unsafe { *p.add(payload_end + i) },
                0,
                "pad byte {i} not zero"
            );
        }
    }

    #[test]
    fn rejects_invalid_utf8() {
        let p = alloc_perry_string("abcd") as *mut u8;
        unsafe {
            // stomp the payload with a bare continuation byte
            *p.add(std::mem::size_of::<StringHeader>()) = 0xFF;
        }
        assert_eq!(unsafe { try_str_from_header(p) }, None);
    }
}
