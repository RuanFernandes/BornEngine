use super::*;

#[test]
fn scratch_byte_payload_accepts_an_exportable_sqlite_image_over_one_megabyte() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let source = open_and_migrate(&mut store, root.path(), "large-scratch-source");
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            source,
            vec![
                string("saves"),
                object([
                    ("slot", string("large-image")),
                    ("score", number(1.0)),
                    ("payload", DatabaseValue::Bytes(vec![0x5a; 1_100_000])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    let (status, exported, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let image = match exported.into_iter().next().unwrap() {
        DatabaseValue::Bytes(image) => image,
        _ => panic!("database export did not return bytes"),
    };
    assert!(image.len() > 1_000_000);

    bloom_shared::database::scratch_reset();
    bloom_shared::database::scratch_push_number(5.0);
    bloom_shared::database::scratch_push_number(image.len() as f64);
    for byte in &image {
        bloom_shared::database::scratch_push_byte(*byte as f64);
    }
    let arguments = bloom_shared::database::submit_scratch_args(1.0)
        .expect("the frozen byte-tag scratch protocol must accept the export limit");
    assert!(matches!(arguments.as_slice(), [DatabaseValue::Bytes(bytes)] if bytes == &image));

    let target = open_and_migrate(&mut store, root.path(), "large-scratch-target");
    assert_eq!(
        execute(&mut store, IMPORT, target, arguments, Some(root.path())).0,
        DatabaseStatus::Ok
    );
}

#[test]
fn scratch_array_and_object_count_limits_remain_one_million() {
    for tag in [6.0, 7.0] {
        bloom_shared::database::scratch_reset();
        bloom_shared::database::scratch_push_number(tag);
        bloom_shared::database::scratch_push_number(1_000_001.0);
        assert_eq!(
            bloom_shared::database::submit_scratch_args(1.0),
            Err(DatabaseStatus::InvalidData)
        );
    }
}

#[cfg(target_os = "linux")]
#[test]
fn import_fault_injection_child() {
    let Ok(root) = std::env::var("BLOOM_DATABASE_IMPORT_CHILD_ROOT") else {
        return;
    };
    let Ok(image_path) = std::env::var("BLOOM_DATABASE_IMPORT_CHILD_IMAGE") else {
        return;
    };
    let root = PathBuf::from(root);
    let image = std::fs::read(image_path).unwrap();
    let mut store = DatabaseStore::new();
    let handle = open_existing(&mut store, &root, "crash-safe-import");
    let (status, _, _) = execute(
        &mut store,
        IMPORT,
        handle,
        vec![DatabaseValue::Bytes(image)],
        Some(&root),
    );
    assert_eq!(status, DatabaseStatus::Ok);
}

#[cfg(target_os = "linux")]
#[test]
fn import_crash_during_database_write_recovers_a_valid_old_or_new_image() {
    let root = TempDir::new();
    let mut store = DatabaseStore::new();
    let old = open_and_migrate(&mut store, root.path(), "crash-safe-import");
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            old,
            vec![
                string("saves"),
                object([
                    ("slot", string("old")),
                    ("score", number(1.0)),
                    ("payload", DatabaseValue::Bytes(vec![1])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    assert_eq!(
        execute(&mut store, CLOSE, old, vec![], Some(root.path())).0,
        DatabaseStatus::Ok
    );
    let source = open_and_migrate(&mut store, root.path(), "crash-safe-source");
    assert_eq!(
        execute(
            &mut store,
            INSERT,
            source,
            vec![
                string("saves"),
                object([
                    ("slot", string("new")),
                    ("score", number(2.0)),
                    ("payload", DatabaseValue::Bytes(vec![2])),
                ]),
            ],
            Some(root.path()),
        )
        .0,
        DatabaseStatus::Ok
    );
    let (status, image, _) = execute(&mut store, EXPORT, source, vec![], Some(root.path()));
    assert_eq!(status, DatabaseStatus::Ok);
    let image = match image.into_iter().next().unwrap() {
        DatabaseValue::Bytes(image) => image,
        _ => panic!("database export did not return bytes"),
    };
    let image_path = root.path().join("incoming.sqlite3");
    std::fs::write(&image_path, image).unwrap();
    let _ = execute(&mut store, CLOSE, source, vec![], Some(root.path()));

    let interceptor_source = root.path().join("rename_fault.c");
    let interceptor = root.path().join("rename_fault.so");
    std::fs::write(
        &interceptor_source,
        r#"#define _GNU_SOURCE
#include <dlfcn.h>
#include <limits.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>
static void inject_crash(int fd, ssize_t written) {
    if (written <= 0) return;
    const char *target = getenv("BLOOM_DATABASE_IMPORT_FAULT_PATH");
    if (!target) return;
    char link_path[64];
    char actual_path[PATH_MAX + 1];
    snprintf(link_path, sizeof(link_path), "/proc/self/fd/%d", fd);
    ssize_t length = readlink(link_path, actual_path, PATH_MAX);
    if (length < 0) return;
    actual_path[length] = '\0';
    size_t target_length = strlen(target);
    if (strcmp(actual_path, target) == 0 ||
        (strncmp(actual_path, target, target_length) == 0 &&
         strncmp(actual_path + target_length, "-journal", 8) == 0)) {
        _exit(86);
    }
}
ssize_t write(int fd, const void *buffer, size_t count) {
    static ssize_t (*real_write)(int, const void *, size_t);
    if (!real_write) real_write = dlsym(RTLD_NEXT, "write");
    ssize_t result = real_write(fd, buffer, count);
    inject_crash(fd, result);
    return result;
}
ssize_t pwrite64(int fd, const void *buffer, size_t count, off64_t offset) {
    static ssize_t (*real_pwrite64)(int, const void *, size_t, off64_t);
    if (!real_pwrite64) real_pwrite64 = dlsym(RTLD_NEXT, "pwrite64");
    ssize_t result = real_pwrite64(fd, buffer, count, offset);
    inject_crash(fd, result);
    return result;
}
"#,
    )
    .unwrap();
    let compile = Command::new("cc")
        .args(["-shared", "-fPIC", "-o"])
        .arg(&interceptor)
        .arg(&interceptor_source)
        .arg("-ldl")
        .status()
        .expect("Linux fault-injection test requires cc");
    assert!(
        compile.success(),
        "failed to compile the rename fault injector"
    );

    let target = root
        .path()
        .join("org.example.native-tests")
        .join("crash-safe-import.sqlite3");
    let child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "import_recovery::import_fault_injection_child",
            "--nocapture",
        ])
        .env("BLOOM_DATABASE_IMPORT_CHILD_ROOT", root.path())
        .env("BLOOM_DATABASE_IMPORT_CHILD_IMAGE", &image_path)
        .env("BLOOM_DATABASE_IMPORT_FAULT_PATH", &target)
        .env("LD_PRELOAD", &interceptor)
        .status()
        .unwrap();
    assert_eq!(
        child.code(),
        Some(86),
        "fault injection must terminate the child during a live database write"
    );
    assert!(
        target.is_file(),
        "import process termination left the live database path missing"
    );
    let recovered = rusqlite::Connection::open(target).unwrap();
    let integrity: String = recovered
        .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    let rows: i64 = recovered
        .query_row("SELECT COUNT(*) FROM saves", [], |row| row.get(0))
        .unwrap();
    assert_eq!(rows, 1, "recovery must expose exactly the old or new image");
    let slot: String = recovered
        .query_row("SELECT slot FROM saves", [], |row| row.get(0))
        .unwrap();
    assert!(slot == "old" || slot == "new");
}
