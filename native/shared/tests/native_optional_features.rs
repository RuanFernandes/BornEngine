use bloom_shared::database;
use bloom_shared::scripting::{self, ScriptLimits, ScriptPermissions};

#[cfg(all(not(target_arch = "wasm32"), not(feature = "sqlite")))]
#[test]
fn database_ffi_reports_unsupported_without_sqlite() {
    let ticket = database::submit_native(1.0, 0.0, Vec::new(), None);

    assert_eq!(database::native_status(ticket), 9.0);
    let mut store = database::DatabaseStore::new();
    let response = store.execute(1, 0.0, Vec::new(), None);

    assert_eq!(response.status, database::DatabaseStatus::Unsupported);
}

#[cfg(all(not(target_arch = "wasm32"), feature = "sqlite"))]
#[test]
fn database_implementation_remains_enabled_when_sqlite_is_selected() {
    let ticket = database::submit_native(1.0, 0.0, Vec::new(), None);

    assert!(ticket > 0.0);
    assert_ne!(database::native_status(ticket), 9.0);
}

#[cfg(all(target_os = "linux", not(feature = "scripting")))]
#[test]
fn quickjs_reports_disabled_without_scripting_feature() {
    let error = scripting::create_script_vm(ScriptLimits::default(), ScriptPermissions::default())
        .expect_err("QuickJS must be absent from a build without the scripting feature");

    assert!(error.to_ascii_lowercase().contains("disabled"), "{error}");
}

#[cfg(all(target_os = "linux", feature = "scripting"))]
#[test]
fn quickjs_remains_available_when_scripting_is_selected() {
    let handle = scripting::create_script_vm(ScriptLimits::default(), ScriptPermissions::default())
        .expect("QuickJS should be initialized when the scripting feature is selected");

    assert!(scripting::script_destroy(handle));
}
