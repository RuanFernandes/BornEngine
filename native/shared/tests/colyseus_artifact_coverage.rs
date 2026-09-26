use bloom_shared::colyseus_targets::artifact_for;
use std::{fs, path::PathBuf};

struct Target {
    os: &'static str,
    arch: &'static str,
    abi: &'static str,
    env: &'static str,
    directory: &'static str,
    windows: bool,
}

const TARGETS: &[Target] = &[
    Target {
        os: "linux",
        arch: "x86_64",
        abi: "",
        env: "gnu",
        directory: "linux-x86_64",
        windows: false,
    },
    Target {
        os: "linux",
        arch: "aarch64",
        abi: "",
        env: "gnu",
        directory: "linux-aarch64",
        windows: false,
    },
    Target {
        os: "macos",
        arch: "x86_64",
        abi: "",
        env: "",
        directory: "macos-x86_64",
        windows: false,
    },
    Target {
        os: "macos",
        arch: "aarch64",
        abi: "",
        env: "",
        directory: "macos-aarch64",
        windows: false,
    },
    Target {
        os: "windows",
        arch: "x86_64",
        abi: "",
        env: "msvc",
        directory: "windows-x86_64",
        windows: true,
    },
    Target {
        os: "ios",
        arch: "aarch64",
        abi: "",
        env: "",
        directory: "ios-aarch64",
        windows: false,
    },
    Target {
        os: "ios",
        arch: "aarch64",
        abi: "sim",
        env: "sim",
        directory: "ios-aarch64-sim",
        windows: false,
    },
    Target {
        os: "ios",
        arch: "x86_64",
        abi: "sim",
        env: "sim",
        directory: "ios-x86_64-sim",
        windows: false,
    },
    Target {
        os: "android",
        arch: "aarch64",
        abi: "",
        env: "",
        directory: "android-aarch64",
        windows: false,
    },
    Target {
        os: "android",
        arch: "x86_64",
        abi: "",
        env: "",
        directory: "android-x86_64",
        windows: false,
    },
    Target {
        os: "tvos",
        arch: "aarch64",
        abi: "",
        env: "",
        directory: "tvos-aarch64",
        windows: false,
    },
    Target {
        os: "tvos",
        arch: "aarch64",
        abi: "sim",
        env: "sim",
        directory: "tvos-aarch64-sim",
        windows: false,
    },
    Target {
        os: "visionos",
        arch: "aarch64",
        abi: "",
        env: "",
        directory: "visionos-aarch64",
        windows: false,
    },
    Target {
        os: "visionos",
        arch: "aarch64",
        abi: "sim",
        env: "sim",
        directory: "visionos-aarch64-sim",
        windows: false,
    },
    Target {
        os: "watchos",
        arch: "aarch64",
        abi: "",
        env: "",
        directory: "watchos-aarch64",
        windows: false,
    },
    Target {
        os: "watchos",
        arch: "aarch64",
        abi: "sim",
        env: "sim",
        directory: "watchos-aarch64-sim",
        windows: false,
    },
];

#[test]
fn colyseus_artifact_coverage_includes_complete_licensed_archives() {
    let artifacts = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../third_party/colyseus/lib");

    for target in TARGETS {
        let directory = artifact_for(target.os, target.arch, target.abi, target.env)
            .unwrap_or_else(|| panic!("missing Colyseus target mapping for {}", target.directory));
        assert_eq!(directory, target.directory);

        let target_dir = artifacts.join(directory);
        let (bundled_name, core_name) = if target.windows {
            ("colyseus_bundled.lib", "colyseus.lib")
        } else {
            ("libcolyseus_bundled.a", "libcolyseus.a")
        };
        let bundled = target_dir.join(bundled_name);
        let core = target_dir.join(core_name);
        let manifest = target_dir.join("BUILD-MANIFEST.txt");
        let licenses = target_dir.join("licenses");

        assert!(
            bundled.is_file(),
            "missing complete archive for {}: {}",
            target.directory,
            bundled.display()
        );
        assert!(
            core.is_file(),
            "missing upstream core archive for {}: {}",
            target.directory,
            core.display()
        );
        assert!(
            manifest.is_file(),
            "missing build manifest for {}",
            target.directory
        );
        assert!(
            licenses.is_dir(),
            "missing license directory for {}",
            target.directory
        );
        assert!(
            fs::read_dir(&licenses).unwrap().next().is_some(),
            "empty license directory for {}",
            target.directory
        );

        let manifest = fs::read_to_string(manifest).unwrap();
        assert!(
            manifest.contains("Colyseus Native SDK commit:"),
            "unproven SDK revision for {}",
            target.directory
        );
        assert!(
            manifest.contains("Zig version: 0.15.2"),
            "wrong build toolchain for {}",
            target.directory
        );
        assert!(
            manifest
                .lines()
                .filter(|line| line.starts_with("  "))
                .count()
                >= 2,
            "dependency closure not recorded for {}",
            target.directory
        );
        assert!(
            fs::metadata(bundled).unwrap().len() > fs::metadata(core).unwrap().len(),
            "bundled archive has no dependency closure for {}",
            target.directory
        );
    }
}
