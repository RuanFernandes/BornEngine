#[path = "../shared/src/colyseus_targets.rs"]
mod colyseus_targets;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../shared/src/colyseus_targets.rs");
    println!("cargo:rustc-check-cfg=cfg(colyseus_native_sdk)");

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    let target_abi = std::env::var("CARGO_CFG_TARGET_ABI").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    let Some(artifact) =
        colyseus_targets::artifact_for(&target_os, &target_arch, &target_abi, &target_env)
    else {
        return;
    };

    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let repo_root = manifest_dir.parent().unwrap().parent().unwrap();
    let lib_dir = repo_root
        .join("native/third_party/colyseus/lib")
        .join(artifact);
    let bundled = lib_dir.join("libcolyseus_bundled.a");
    let core = lib_dir.join("libcolyseus.a");
    println!("cargo:rerun-if-changed={}", bundled.display());
    println!("cargo:rerun-if-changed={}", core.display());
    if !bundled.exists() || !core.exists() {
        return;
    }

    println!("cargo:rustc-cfg=colyseus_native_sdk");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=colyseus_bundled");
    for framework in ["CoreFoundation", "Security"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}
