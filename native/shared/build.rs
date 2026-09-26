//! Build script for bloom-shared.
//!
//! Only does work when the `jolt` feature is enabled. In that case it builds
//! the `bloom_jolt` C++ shim (and JoltPhysics, via its own CMakeLists) via the
//! `cmake` crate and emits link directives so rustc picks up both archives.

#[path = "src/colyseus_targets.rs"]
mod colyseus_targets;

fn main() {
    // Always re-run when these change.
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_JOLT");
    println!("cargo:rustc-check-cfg=cfg(colyseus_native_sdk)");

    link_colyseus_sdk();

    if std::env::var_os("CARGO_FEATURE_JOLT").is_none() {
        return;
    }

    // The Jolt C++ shim cannot target WebAssembly via the normal cmake path —
    // Emscripten + Jolt is a separate build pipeline (see JoltPhysics.js).
    // On wasm32 the web crate routes bloom_physics_* FFI to JoltPhysics.js
    // directly via wasm_bindgen; no static library is needed here.
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("wasm32") {
        return;
    }

    build_jolt();
}

/// Link the upstream Colyseus C SDK when a complete archive exists for the
/// active Rust target. Missing artifacts retain the explicit FFI fallback.
fn link_colyseus_sdk() {
    use std::path::PathBuf;

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let repo_root = manifest_dir.parent().unwrap().parent().unwrap();
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    let target_abi = std::env::var("CARGO_CFG_TARGET_ABI").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    println!("cargo:rerun-if-changed=src/colyseus_targets.rs");
    println!(
        "cargo:rerun-if-changed={}",
        repo_root
            .join("native/third_party/colyseus/VERSION.md")
            .display()
    );
    let Some(target) =
        colyseus_targets::artifact_for(&target_os, &target_arch, &target_abi, &target_env)
    else {
        return;
    };

    let lib_dir = repo_root
        .join("native/third_party/colyseus/lib")
        .join(target);
    let archive_name = if target_os == "windows" {
        "colyseus_bundled.lib"
    } else {
        "libcolyseus_bundled.a"
    };
    let archive = lib_dir.join(archive_name);
    let core_archive = if target_os == "windows" {
        lib_dir.join("colyseus.lib")
    } else {
        lib_dir.join("libcolyseus.a")
    };
    println!("cargo:rerun-if-changed={}", archive.display());
    println!("cargo:rerun-if-changed={}", core_archive.display());
    if !archive.exists() || !core_archive.exists() {
        return;
    }

    println!("cargo:rustc-cfg=colyseus_native_sdk");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=colyseus_bundled");

    match target_os.as_str() {
        "linux" => {
            for library in ["pthread", "m", "dl"] {
                println!("cargo:rustc-link-lib=dylib={library}");
            }
        }
        "macos" => {
            println!("cargo:rustc-link-lib=dylib=pthread");
            for framework in ["CoreFoundation", "Security"] {
                println!("cargo:rustc-link-lib=framework={framework}");
            }
        }
        "ios" | "tvos" | "visionos" | "watchos" => {
            for framework in ["CoreFoundation", "Security"] {
                println!("cargo:rustc-link-lib=framework={framework}");
            }
        }
        "windows" => {
            for library in ["ws2_32", "bcrypt", "crypt32", "secur32", "iphlpapi"] {
                println!("cargo:rustc-link-lib=dylib={library}");
            }
        }
        "android" => {}
        _ => {}
    }
}

#[cfg(not(feature = "jolt"))]
fn build_jolt() {}

#[cfg(feature = "jolt")]
fn build_jolt() {
    use std::path::PathBuf;

    // Locate native/third_party/bloom_jolt relative to this crate.
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let shim_dir = manifest_dir
        .parent()
        .unwrap()
        .join("third_party")
        .join("bloom_jolt");

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();

    println!("cargo:rerun-if-env-changed=BLOOM_JOLT_PREBUILT_DIR");
    println!("cargo:rerun-if-env-changed=BLOOM_JOLT_FROM_SOURCE");

    // Prebuilt fast path — if `@bornengine/jolt-prebuilt` is available
    // (via env var or a node_modules sibling), link its archives and
    // skip the multi-minute cmake build of JoltPhysics entirely. The
    // env var BLOOM_JOLT_FROM_SOURCE=1 forces the cmake fallback even
    // when prebuilts are present, useful for hacking on the C++ shim.
    let from_source = std::env::var_os("BLOOM_JOLT_FROM_SOURCE").is_some();
    if !from_source {
        if let Some(prebuilt_dir) = find_prebuilt_dir(&manifest_dir, &target_os, &target_arch) {
            if target_os == "windows" {
                stage_windows_prebuilt_for_perry(&prebuilt_dir, &shim_dir, &target_arch);
            }
            link_prebuilt(&prebuilt_dir, &target_os);
            emit_cxx_runtime_link(&target_os);
            return;
        }
    }

    if !shim_dir.join("CMakeLists.txt").exists() {
        panic!(
            "bloom_jolt shim not found at {}; did the third_party submodules init?",
            shim_dir.display()
        );
    }

    println!(
        "cargo:rerun-if-changed={}",
        shim_dir.join("CMakeLists.txt").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        shim_dir.join("include/bloom_jolt.h").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        shim_dir.join("src/bloom_jolt.cpp").display()
    );

    // Build into a stable, short path next to the shim itself rather than the
    // per-build OUT_DIR. Two reasons:
    //   1. Cargo wraps OUT_DIR with the `\\?\` long-path prefix on Windows
    //      whenever the absolute path approaches MAX_PATH; MSBuild and cl.exe
    //      both choke on `\\?\`-prefixed paths in subtle ways (echo'd build
    //      events fail with MSB3073, cl.exe rewrites the file to `\\testfile`
    //      and reports C1083).
    //   2. The Jolt build is expensive and identical across every cargo target
    //      hash — caching it once per profile lets `cargo clean` not nuke a
    //      multi-minute compile.
    let dst = shim_dir
        .join("build")
        .join(format!("{}-{}", target_os, target_arch));

    let lib_ext = if target_os == "windows" { "lib" } else { "a" };
    let lib_prefix = if target_os == "windows" { "" } else { "lib" };
    let bloom_jolt_lib = dst
        .join("lib")
        .join(format!("{}bloom_jolt.{}", lib_prefix, lib_ext));
    let jolt_lib = dst
        .join("lib")
        .join(format!("{}Jolt.{}", lib_prefix, lib_ext));

    if !(bloom_jolt_lib.exists() && jolt_lib.exists()) {
        let mut cfg = cmake::Config::new(&shim_dir);
        cfg.out_dir(&dst)
            .profile("Release")
            .define("CMAKE_BUILD_TYPE", "Release");
        if target_os == "windows" {
            // perry links the prebuilt Jolt archive with lld-link, which
            // cannot read MSVC `/GL` (whole-program-optimization) object
            // files — they're LTCG intermediates, not native COFF, and the
            // link fails with "is not a native COFF file. Recompile without
            // /GL?". Turn off Jolt's interprocedural optimization so the
            // archive holds ordinary COFF objects perry can consume. (Costs
            // a little Jolt codegen perf; physics is not the bottleneck.)
            cfg.define("INTERPROCEDURAL_OPTIMIZATION", "OFF")
                .define("CMAKE_INTERPROCEDURAL_OPTIMIZATION", "OFF");
        }
        let _ = cfg.build();
    }

    println!(
        "cargo:rustc-link-search=native={}",
        dst.join("lib").display()
    );
    println!("cargo:rustc-link-lib=static=bloom_jolt");
    println!("cargo:rustc-link-lib=static=Jolt");

    emit_cxx_runtime_link(&target_os);
}

/// Locate a BornEngine or legacy Bloom Engine Jolt prebuilt package's lib dir for the
/// active build target. Returns `Some(dir)` only when both expected
/// archives are present — a half-shipped package falls through to the
/// cmake build instead of producing a confusing linker error.
///
/// Resolution order:
///   1. `BLOOM_JOLT_PREBUILT_DIR` env var — points at a directory
///      containing per-target subdirs (`<dir>/<os>-<arch>/lib*.a`).
///      Used for local spike testing and for CI matrix jobs that
///      stage archives outside `node_modules`.
///   2. Walk up from `CARGO_MANIFEST_DIR` looking for either
///      `node_modules/@bornengine/jolt-prebuilt/lib/<os>-<arch>/` or
///      its legacy `@bloomengine/jolt-prebuilt` equivalent. The BornEngine
///      scope is preferred, while existing Bloom Engine installs keep working.
#[cfg(feature = "jolt")]
fn find_prebuilt_dir(
    manifest_dir: &std::path::Path,
    target_os: &str,
    target_arch: &str,
) -> Option<std::path::PathBuf> {
    // Map Rust's target_arch to the npm/Node convention used in this
    // package's directory layout. Keep this in sync with the matrix in
    // npm/jolt-prebuilt/README.md.
    let arch_token = match target_arch {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        "arm" => "armv7",
        other => other,
    };
    // Apple simulator targets share `target_os`/`target_arch` with their
    // device counterpart (e.g. aarch64-apple-tvos-sim vs -tvos both report
    // os=tvos arch=aarch64) and are only distinguished by the "sim" ABI.
    // jolt-prebuilt ships a separate `<os>-<arch>-sim` archive built for the
    // simulator platform; without this suffix we'd link the device archive
    // into a simulator build and ld would reject the platform mismatch.
    let sim_suffix = if std::env::var("CARGO_CFG_TARGET_ABI").as_deref() == Ok("sim") {
        "-sim"
    } else {
        ""
    };
    let os_token = if target_os == "windows" {
        "win32"
    } else {
        target_os
    };
    let target_token = format!("{}-{}{}", os_token, arch_token, sim_suffix);

    let candidates = std::iter::empty::<std::path::PathBuf>()
        .chain(
            std::env::var_os("BLOOM_JOLT_PREBUILT_DIR")
                .map(|v| std::path::PathBuf::from(v).join(&target_token)),
        )
        .chain(walk_up_for_node_modules(manifest_dir).flat_map(|nm| {
            ["@bornengine", "@bloomengine"].map(|scope| {
                nm.join(scope)
                    .join("jolt-prebuilt")
                    .join("lib")
                    .join(&target_token)
            })
        }));

    let (lib_prefix, lib_ext) = if target_os == "windows" {
        ("", "lib")
    } else {
        ("lib", "a")
    };

    for dir in candidates {
        let bloom_jolt = dir.join(format!("{}bloom_jolt.{}", lib_prefix, lib_ext));
        let jolt = dir.join(format!("{}Jolt.{}", lib_prefix, lib_ext));
        if bloom_jolt.exists() && jolt.exists() {
            return Some(dir);
        }
    }
    None
}

/// Iterator over every ancestor `node_modules/` reachable from
/// `start`. Yields each directory once, parent-first, so a closer
/// prebuilt installation wins over a higher one (matching node's
/// resolution algorithm).
#[cfg(feature = "jolt")]
fn walk_up_for_node_modules(
    start: &std::path::Path,
) -> impl Iterator<Item = std::path::PathBuf> + '_ {
    let mut next: Option<&std::path::Path> = Some(start);
    std::iter::from_fn(move || {
        while let Some(cur) = next {
            next = cur.parent();
            let candidate = cur.join("node_modules");
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
        None
    })
}

#[cfg(feature = "jolt")]
fn stage_windows_prebuilt_for_perry(
    prebuilt_dir: &std::path::Path,
    shim_dir: &std::path::Path,
    target_arch: &str,
) {
    let lib_dir = shim_dir
        .join("build")
        .join(format!("windows-{target_arch}"))
        .join("lib");
    std::fs::create_dir_all(&lib_dir)
        .unwrap_or_else(|error| panic!("could not create {}: {error}", lib_dir.display()));
    for name in ["bloom_jolt.lib", "Jolt.lib"] {
        let source = prebuilt_dir.join(name);
        let destination = lib_dir.join(name);
        let same_file = source
            .canonicalize()
            .ok()
            .zip(destination.canonicalize().ok())
            .is_some_and(|(source, destination)| source == destination);
        if !same_file {
            std::fs::copy(&source, &destination).unwrap_or_else(|error| {
                panic!(
                    "could not stage {} to {}: {error}",
                    source.display(),
                    destination.display()
                )
            });
        }
    }
}

#[cfg(feature = "jolt")]
fn link_prebuilt(dir: &std::path::Path, target_os: &str) {
    // Rerun if any archive in the prebuilt dir changes — covers the
    // case where a new release of jolt-prebuilt drops in new bytes.
    let (lib_prefix, lib_ext) = if target_os == "windows" {
        ("", "lib")
    } else {
        ("lib", "a")
    };
    println!(
        "cargo:rerun-if-changed={}",
        dir.join(format!("{}bloom_jolt.{}", lib_prefix, lib_ext))
            .display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        dir.join(format!("{}Jolt.{}", lib_prefix, lib_ext))
            .display()
    );

    println!("cargo:rustc-link-search=native={}", dir.display());
    println!("cargo:rustc-link-lib=static=bloom_jolt");
    println!("cargo:rustc-link-lib=static=Jolt");
}

/// Emit the C++ standard library link directive that matches the
/// archives we just linked. Required because the static archives pull
/// in libc++ / libstdc++ symbols that the Rust toolchain doesn't
/// resolve on its own.
#[cfg(feature = "jolt")]
fn emit_cxx_runtime_link(target_os: &str) {
    match target_os {
        "macos" | "ios" | "tvos" | "watchos" => {
            println!("cargo:rustc-link-lib=dylib=c++");
        }
        "linux" | "android" => {
            println!("cargo:rustc-link-lib=dylib=stdc++");
        }
        "windows" => {
            // MSVC toolchain handles libc++ automatically; MinGW would need stdc++.
        }
        _ => {}
    }
}
