use bloom_shared::database;

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
