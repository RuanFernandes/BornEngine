//! Typed retained GUI command, response, and event FFI.

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_ffi_gui {
    () => {
        #[no_mangle]
        /// # Safety
        /// `text_ptr` must reference a valid Perry string for this call.
        pub unsafe extern "C" fn bloom_gui_command(
            opcode: f64,
            id: f64,
            a: f64,
            b: f64,
            c: f64,
            d: f64,
            text_ptr: *const u8,
        ) -> f64 {
            $crate::ffi::guard("bloom_gui_command", move || {
                let Some(opcode) = $crate::gui::GuiOpcode::from_abi(opcode) else {
                    return 0.0;
                };
                let Some(id) = $crate::gui::id_from_abi_checked(id) else {
                    return 0.0;
                };
                // SAFETY: Perry keeps the string allocation alive across the FFI call.
                let text = unsafe { $crate::string_header::str_from_header(text_ptr) }.to_owned();
                if engine().gui.queue_command($crate::gui::GuiCommand::new(
                    opcode,
                    id,
                    [a, b, c, d],
                    text,
                )) {
                    1.0
                } else {
                    0.0
                }
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_scratch_reset() {
            $crate::ffi::guard("bloom_gui_scratch_reset", move || {
                engine().gui.reset_scratch()
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_scratch_push_f64(value: f64) {
            $crate::ffi::guard("bloom_gui_scratch_push_f64", move || {
                engine().gui.push_scratch(value);
            })
        }

        #[no_mangle]
        /// # Safety
        /// `text_ptr` must reference a valid Perry string for this call.
        pub unsafe extern "C" fn bloom_gui_scratch_command(
            opcode: f64,
            id: f64,
            count: f64,
            text_ptr: *const u8,
        ) -> f64 {
            $crate::ffi::guard("bloom_gui_scratch_command", move || {
                let Some(opcode) = $crate::gui::GuiOpcode::from_abi(opcode) else {
                    return 0.0;
                };
                let Some(id) = $crate::gui::id_from_abi_checked(id) else {
                    return 0.0;
                };
                let Some(count) = $crate::ui::id_from_abi(count) else {
                    return 0.0;
                };
                // SAFETY: Perry keeps the string allocation alive across the FFI call.
                let text = unsafe { $crate::string_header::str_from_header(text_ptr) }.to_owned();
                if engine()
                    .gui
                    .queue_scratch_command(opcode, id, count as usize, text)
                {
                    1.0
                } else {
                    0.0
                }
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_response(id: f64, field: f64) -> f64 {
            $crate::ffi::guard("bloom_gui_response", move || {
                let Some(id) = $crate::gui::id_from_abi_checked(id) else {
                    return 0.0;
                };
                let Some(field) = $crate::ui::id_from_abi(field) else {
                    return 0.0;
                };
                let gui = engine();
                let response = gui.gui.response(id);
                match field {
                    0..=5 | 7..=10 => response.field(field),
                    6 => gui.gui.has_response(id) as u8 as f64,
                    _ => 0.0,
                }
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_response_text(id: f64) -> *const u8 {
            $crate::ffi::guard("bloom_gui_response_text", move || {
                let Some(id) = $crate::gui::id_from_abi_checked(id) else {
                    return $crate::string_header::alloc_perry_string("");
                };
                let text = engine().gui.response_text(id);
                $crate::string_header::alloc_perry_string(&text)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_event_count() -> f64 {
            $crate::ffi::guard("bloom_gui_event_count", move || {
                engine().gui.event_count() as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_event_field(index: f64, field: f64) -> f64 {
            $crate::ffi::guard("bloom_gui_event_field", move || {
                let Some(index) = $crate::ui::id_from_abi(index) else {
                    return 0.0;
                };
                let Some(field) = $crate::ui::id_from_abi(field) else {
                    return 0.0;
                };
                engine().gui.event_field(index as usize, field)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_is_available() -> f64 {
            $crate::ffi::guard("bloom_gui_is_available", move || {
                engine().gui.is_available() as u8 as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_gui_wants_input(kind: f64) -> f64 {
            $crate::ffi::guard("bloom_gui_wants_input", move || {
                let Some(kind) = $crate::ui::id_from_abi(kind) else {
                    return 0.0;
                };
                engine().gui.wants_input(kind) as u8 as f64
            })
        }
    };
}
