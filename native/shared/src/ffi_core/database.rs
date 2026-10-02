//! Bounded SQLite request protocol shared by native platform crates.

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_ffi_database {
    () => {
        #[no_mangle]
        pub extern "C" fn bloom_database_scratch_reset() {
            $crate::database::scratch_reset();
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_scratch_push_f64(value: f64) {
            $crate::database::scratch_push_number(value);
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_scratch_push_string(value: *const u8) {
            let value = $crate::string_header::try_str_from_header(value);
            $crate::database::scratch_push_string(value.as_deref());
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_scratch_push_byte(value: f64) {
            $crate::database::scratch_push_byte(value);
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_submit(op: f64, handle: f64, argc: f64) -> f64 {
            match $crate::database::submit_scratch_args(argc) {
                Ok(args) => $crate::database::submit_native(
                    op,
                    handle,
                    args,
                    bloom_database_data_root().as_deref(),
                ),
                Err(status) => $crate::database::submit_native_error(status),
            }
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_poll(ticket: f64) -> f64 {
            $crate::database::native_poll(ticket)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_status(ticket: f64) -> f64 {
            $crate::database::native_status(ticket)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_result_rows(ticket: f64) -> f64 {
            $crate::database::native_rows(ticket)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_result_count(ticket: f64) -> f64 {
            $crate::database::native_count(ticket)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_result_kind(ticket: f64, index: f64) -> f64 {
            $crate::database::native_kind(ticket, index)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_result_number(ticket: f64, index: f64) -> f64 {
            $crate::database::native_number(ticket, index)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_result_string(ticket: f64, index: f64) -> *const u8 {
            match $crate::database::native_string(ticket, index) {
                Some(value) => $crate::string_header::alloc_perry_string(&value),
                None => $crate::string_header::alloc_perry_string(""),
            }
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_result_byte_count(ticket: f64, index: f64) -> f64 {
            $crate::database::native_byte_count(ticket, index)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_result_byte(ticket: f64, index: f64, offset: f64) -> f64 {
            $crate::database::native_byte(ticket, index, offset)
        }

        #[no_mangle]
        pub extern "C" fn bloom_database_release(ticket: f64) {
            $crate::database::native_release(ticket);
        }
    };
}
