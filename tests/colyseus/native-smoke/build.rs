#[path = "../../../native/shared/src/colyseus_targets.rs"]
mod colyseus_targets;

fn main() {
    println!("cargo:rustc-check-cfg=cfg(colyseus_native_sdk)");
    println!("cargo:rerun-if-changed=../../../native/shared/src/colyseus_targets.rs");

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
    let repo_root = manifest_dir.join("../../..");
    let lib_dir = repo_root
        .join("native/third_party/colyseus/lib")
        .join(artifact);
    let archive = if target_os == "windows" {
        lib_dir.join("colyseus_bundled.lib")
    } else {
        lib_dir.join("libcolyseus_bundled.a")
    };
    let core = if target_os == "windows" {
        lib_dir.join("colyseus.lib")
    } else {
        lib_dir.join("libcolyseus.a")
    };
    println!("cargo:rerun-if-changed={}", archive.display());
    println!("cargo:rerun-if-changed={}", core.display());
    if !archive.is_file() || !core.is_file() {
        println!("cargo:warning=Colyseus SDK archive is missing for {artifact}");
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
