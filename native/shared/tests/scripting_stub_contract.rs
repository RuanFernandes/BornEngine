#[path = "../src/scripting_stub.rs"]
mod scripting_stub;

#[test]
fn unsupported_script_runtime_fails_closed_and_keeps_the_ffi_shape() {
    let result = scripting_stub::create_script_vm(
        scripting_stub::ScriptLimits::default(),
        scripting_stub::ScriptPermissions::default(),
    );
    assert_eq!(
        result.err().as_deref(),
        Some(if cfg!(not(any(target_os = "linux", target_arch = "wasm32"))) {
            "Embedded JavaScript is not supported by this target."
        } else {
            "Embedded JavaScript is disabled for this build; enable the `scripting` native feature."
        })
    );
    assert_eq!(scripting_stub::runtime_unavailable_error(), expected_unsupported_error());
    assert_eq!(
        scripting_stub::with_script_vm(1, |vm| vm.load("export default {};")),
        None
    );
    assert_eq!(
        scripting_stub::script_start(1, scripting_stub::ScriptContextData::new("", [0.0; 3])),
        None
    );
    assert_eq!(
        scripting_stub::script_update(1, scripting_stub::ScriptContextData::new("", [0.0; 3]), 0.0),
        None
    );
    assert_eq!(
        scripting_stub::script_dispose(1, scripting_stub::ScriptContextData::new("", [0.0; 3])),
        None
    );
    assert_eq!(scripting_stub::script_command_count(1), None);
    assert_eq!(scripting_stub::script_command_kind(1, 0), None);
    assert_eq!(scripting_stub::script_command_number(1, 0, 0), None);
    assert_eq!(scripting_stub::script_command_text(1, 0), None);
    scripting_stub::clear_script_commands(1);
    assert_eq!(scripting_stub::script_status(1), None);
    assert_eq!(scripting_stub::script_error(1), None);
    assert_eq!(scripting_stub::script_memory_used(1), None);
    assert!(!scripting_stub::script_destroy(1));
}

fn expected_unsupported_error() -> String {
    if cfg!(not(any(target_os = "linux", target_arch = "wasm32"))) {
        "Embedded JavaScript is not supported by this target.".into()
    } else {
        "Embedded JavaScript is disabled for this build; enable the `scripting` native feature."
            .into()
    }
}
