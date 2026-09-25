//! Typed UI command, input, response, and availability FFI.
//!
//! Section of [`define_core_ffi!`](crate::define_core_ffi) — see
//! `ffi_core/mod.rs` for the architecture and the invoking-crate contract.

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_ffi_ui {
    () => {
        #[no_mangle]
        pub extern "C" fn bloom_ui_command(
            backend: f64,
            opcode: f64,
            id: f64,
            a: f64,
            b: f64,
            c: f64,
            d: f64,
            text_ptr: *const u8,
        ) -> f64 {
            $crate::ffi::guard("bloom_ui_command", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return 0.0;
                };
                let Some(opcode) = $crate::ui::UiOpcode::from_abi(opcode) else {
                    return 0.0;
                };
                let Some(id) = $crate::ui::id_from_abi(id) else {
                    return 0.0;
                };
                let text = $crate::string_header::str_from_header(text_ptr).to_owned();
                let command = $crate::ui::UiCommand::new(backend, opcode, id, [a, b, c, d], text);
                if engine().ui.queue_command(command) {
                    1.0
                } else {
                    0.0
                }
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_scratch_reset(backend: f64) {
            $crate::ffi::guard("bloom_ui_scratch_reset", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return;
                };
                engine().ui.reset_scratch(backend);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_scratch_push_f64(backend: f64, value: f64) {
            $crate::ffi::guard("bloom_ui_scratch_push_f64", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return;
                };
                engine().ui.push_scratch(backend, value);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_scratch_command(
            backend: f64,
            opcode: f64,
            id: f64,
            count: f64,
            text_ptr: *const u8,
        ) -> f64 {
            $crate::ffi::guard("bloom_ui_scratch_command", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return 0.0;
                };
                let Some(opcode) = $crate::ui::UiOpcode::from_abi(opcode) else {
                    return 0.0;
                };
                let Some(id) = $crate::ui::id_from_abi(id) else {
                    return 0.0;
                };
                let Some(count) = $crate::ui::id_from_abi(count) else {
                    return 0.0;
                };
                let text = $crate::string_header::str_from_header(text_ptr).to_owned();
                if engine()
                    .ui
                    .queue_scratch_command(backend, opcode, id, count as usize, text)
                {
                    1.0
                } else {
                    0.0
                }
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_inject_text(text_ptr: *const u8) {
            $crate::ffi::guard("bloom_ui_inject_text", move || {
                let text = $crate::string_header::str_from_header(text_ptr).to_owned();
                engine().ui.inject_text(text);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_response(backend: f64, id: f64, field: f64) -> f64 {
            $crate::ffi::guard("bloom_ui_response", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return 0.0;
                };
                let Some(id) = $crate::ui::id_from_abi(id) else {
                    return 0.0;
                };
                let Some(field) = $crate::ui::id_from_abi(field) else {
                    return 0.0;
                };
                let response = engine().ui.response(backend, id);
                match field {
                    0 => response.clicked as u8 as f64,
                    1 => response.changed as u8 as f64,
                    2 => response.hovered as u8 as f64,
                    3 => response.focused as u8 as f64,
                    4 => response.dragged as u8 as f64,
                    5 => response.value,
                    6 => engine().ui.has_response(backend, id) as u8 as f64,
                    _ => 0.0,
                }
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_response_text(backend: f64, id: f64) -> *const u8 {
            $crate::ffi::guard("bloom_ui_response_text", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return $crate::string_header::alloc_perry_string("");
                };
                let Some(id) = $crate::ui::id_from_abi(id) else {
                    return $crate::string_header::alloc_perry_string("");
                };
                let text = engine().ui.response_text(backend, id);
                $crate::string_header::alloc_perry_string(&text)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_is_available(backend: f64) -> f64 {
            $crate::ffi::guard("bloom_ui_is_available", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return 0.0;
                };
                engine().ui.is_available(backend) as u8 as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_wants_input(backend: f64, kind: f64) -> f64 {
            $crate::ffi::guard("bloom_ui_wants_input", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return 0.0;
                };
                let Some(kind) = $crate::ui::id_from_abi(kind) else {
                    return 0.0;
                };
                engine().ui.wants_input(backend, kind) as u8 as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_ui_take_keyboard_request(backend: f64) -> f64 {
            $crate::ffi::guard("bloom_ui_take_keyboard_request", move || {
                let Some(backend) = $crate::ui::UiBackend::from_abi(backend) else {
                    return -1.0;
                };
                if backend != $crate::ui::UiBackend::Egui {
                    return -1.0;
                }
                match engine().ui.take_keyboard_request() {
                    Some(true) => 1.0,
                    Some(false) => 0.0,
                    None => -1.0,
                }
            })
        }
    };
}
