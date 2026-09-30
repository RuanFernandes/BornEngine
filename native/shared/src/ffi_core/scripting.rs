//! Shared FFI bindings for the embedded JavaScript runtime.

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_ffi_scripting {
    () => {
        #[no_mangle]
        pub extern "C" fn bloom_script_supported() -> f64 {
            1.0
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_create(
            permission_mask: f64,
            max_memory_bytes: f64,
            max_stack_bytes: f64,
            max_interrupt_checks: f64,
        ) -> f64 {
            $crate::ffi::guard("bloom_script_create", move || {
                let integer = |value: f64, default: usize| -> Option<usize> {
                    if value == 0.0 {
                        return Some(default);
                    }
                    if !value.is_finite() || value.fract() != 0.0 || value < 0.0 {
                        return None;
                    }
                    usize::try_from(value as u64).ok()
                };
                if !permission_mask.is_finite()
                    || permission_mask.fract() != 0.0
                    || permission_mask < 0.0
                    || permission_mask > 15.0
                {
                    return 0.0;
                }
                let defaults = $crate::scripting::ScriptLimits::default();
                let Some(max_memory_bytes) = integer(max_memory_bytes, defaults.max_memory_bytes)
                else {
                    return 0.0;
                };
                let Some(max_stack_bytes) = integer(max_stack_bytes, defaults.max_stack_bytes)
                else {
                    return 0.0;
                };
                let Some(max_interrupt_checks) =
                    integer(max_interrupt_checks, defaults.max_interrupt_checks)
                else {
                    return 0.0;
                };
                let permissions = permission_mask as u32;
                let limits = $crate::scripting::ScriptLimits {
                    max_memory_bytes,
                    max_stack_bytes,
                    max_interrupt_checks,
                };
                let permissions = $crate::scripting::ScriptPermissions {
                    log: permissions & 1 != 0,
                    self_read: permissions & 2 != 0,
                    self_transform_write: permissions & 4 != 0,
                    self_particles_emit: permissions & 8 != 0,
                };
                $crate::scripting::create_script_vm(limits, permissions)
                    .map(|handle| handle as f64)
                    .unwrap_or(0.0)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_load(handle: f64, source: *const u8) -> f64 {
            $crate::ffi::guard("bloom_script_load", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                let Some(source) = $crate::string_header::try_str_from_header(source) else {
                    return 0.0;
                };
                $crate::scripting::with_script_vm(handle, |vm| vm.load(source).is_ok())
                    .unwrap_or(false) as u8 as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_start(
            handle: f64,
            self_id: *const u8,
            x: f64,
            y: f64,
            z: f64,
        ) -> f64 {
            $crate::ffi::guard("bloom_script_start", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                let self_id = $crate::string_header::str_from_header(self_id);
                $crate::scripting::script_start(
                    handle,
                    $crate::scripting::ScriptContextData::new(self_id, [x, y, z]),
                )
                .unwrap_or(0) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_update(
            handle: f64,
            self_id: *const u8,
            x: f64,
            y: f64,
            z: f64,
            delta_time: f64,
        ) -> f64 {
            $crate::ffi::guard("bloom_script_update", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                let self_id = $crate::string_header::str_from_header(self_id);
                $crate::scripting::script_update(
                    handle,
                    $crate::scripting::ScriptContextData::new(self_id, [x, y, z]),
                    delta_time,
                )
                .unwrap_or(0) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_dispose(
            handle: f64,
            self_id: *const u8,
            x: f64,
            y: f64,
            z: f64,
        ) -> f64 {
            $crate::ffi::guard("bloom_script_dispose", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                let self_id = $crate::string_header::str_from_header(self_id);
                $crate::scripting::script_dispose(
                    handle,
                    $crate::scripting::ScriptContextData::new(self_id, [x, y, z]),
                )
                .unwrap_or(0) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_command_count(handle: f64) -> f64 {
            $crate::ffi::guard("bloom_script_command_count", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                $crate::scripting::script_command_count(handle).unwrap_or(0) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_command_kind(handle: f64, index: f64) -> f64 {
            $crate::ffi::guard("bloom_script_command_kind", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                let Some(index) = $crate::__bloom_script_parse_index!(index) else {
                    return 0.0;
                };
                $crate::scripting::script_command_kind(handle, index).unwrap_or(0) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_command_number(handle: f64, index: f64, slot: f64) -> f64 {
            $crate::ffi::guard("bloom_script_command_number", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                let Some(index) = $crate::__bloom_script_parse_index!(index) else {
                    return 0.0;
                };
                let Some(slot) = $crate::__bloom_script_parse_index!(slot) else {
                    return 0.0;
                };
                $crate::scripting::script_command_number(handle, index, slot).unwrap_or(0.0)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_command_text(handle: f64, index: f64) -> *const u8 {
            $crate::ffi::guard("bloom_script_command_text", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return $crate::string_header::alloc_perry_string("");
                };
                let Some(index) = $crate::__bloom_script_parse_index!(index) else {
                    return $crate::string_header::alloc_perry_string("");
                };
                let text =
                    $crate::scripting::script_command_text(handle, index).unwrap_or_default();
                $crate::string_header::alloc_perry_string(&text)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_clear_commands(handle: f64) {
            $crate::ffi::guard("bloom_script_clear_commands", move || {
                if let Some(handle) = $crate::__bloom_script_parse_handle!(handle) {
                    $crate::scripting::clear_script_commands(handle);
                }
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_status(handle: f64) -> f64 {
            $crate::ffi::guard("bloom_script_status", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                $crate::scripting::script_status(handle).unwrap_or(0) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_error(handle: f64) -> *const u8 {
            $crate::ffi::guard("bloom_script_error", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return $crate::string_header::alloc_perry_string("");
                };
                let text = $crate::scripting::script_error(handle).unwrap_or_default();
                $crate::string_header::alloc_perry_string(&text)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_memory_used(handle: f64) -> f64 {
            $crate::ffi::guard("bloom_script_memory_used", move || {
                let Some(handle) = $crate::__bloom_script_parse_handle!(handle) else {
                    return 0.0;
                };
                $crate::scripting::script_memory_used(handle).unwrap_or(0) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_script_destroy(handle: f64) {
            $crate::ffi::guard("bloom_script_destroy", move || {
                if let Some(handle) = $crate::__bloom_script_parse_handle!(handle) {
                    $crate::scripting::script_destroy(handle);
                }
            })
        }
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_script_parse_handle {
    ($handle:expr) => {{
        if !$handle.is_finite()
            || $handle.fract() != 0.0
            || $handle <= 0.0
            || $handle > u32::MAX as f64
        {
            None
        } else {
            Some($handle as u32)
        }
    }};
}

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_script_parse_index {
    ($index:expr) => {{
        if !$index.is_finite() || $index.fract() != 0.0 || $index < 0.0 || $index > 1_000_000.0 {
            None
        } else {
            Some($index as usize)
        }
    }};
}
