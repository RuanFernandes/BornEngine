/// Resolve a Rust target to the directory containing its Colyseus static archive.
///
/// This table selects a layout for targets that can be built and validated.
/// Build scripts must still check that the archive exists before linking it.
pub fn artifact_for(
    target_os: &str,
    target_arch: &str,
    target_abi: &str,
    target_env: &str,
) -> Option<&'static str> {
    let simulator_abi = target_abi == "sim";
    let simulator_env = target_env == "sim";
    if simulator_abi != simulator_env {
        return None;
    }

    match (target_os, target_arch, target_abi, target_env) {
        ("linux", "x86_64", "", "gnu") => Some("linux-x86_64"),
        ("linux", "aarch64", "", "gnu") => Some("linux-aarch64"),
        ("macos", "x86_64", "", "") => Some("macos-x86_64"),
        ("macos", "aarch64", "", "") => Some("macos-aarch64"),
        ("windows", "x86_64", "", "msvc") => Some("windows-x86_64"),
        ("ios", "aarch64", "", "") => Some("ios-aarch64"),
        ("ios", "aarch64", "sim", "sim") => Some("ios-aarch64-sim"),
        ("ios", "x86_64", "sim", "sim") => Some("ios-x86_64-sim"),
        ("tvos", "aarch64", "", "") => Some("tvos-aarch64"),
        ("tvos", "aarch64", "sim", "sim") => Some("tvos-aarch64-sim"),
        ("visionos", "aarch64", "", "") => Some("visionos-aarch64"),
        ("visionos", "aarch64", "sim", "sim") => Some("visionos-aarch64-sim"),
        ("watchos", "aarch64", "", "") => Some("watchos-aarch64"),
        ("watchos", "aarch64", "sim", "sim") => Some("watchos-aarch64-sim"),
        ("android", "aarch64", "", "") => Some("android-aarch64"),
        ("android", "x86_64", "", "") => Some("android-x86_64"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::artifact_for;

    struct TargetCase {
        os: &'static str,
        arch: &'static str,
        abi: &'static str,
        env: &'static str,
        artifact: &'static str,
    }

    #[test]
    fn colyseus_target_artifact_paths_cover_native_platforms() {
        let supported = [
            TargetCase {
                os: "linux",
                arch: "x86_64",
                abi: "",
                env: "gnu",
                artifact: "linux-x86_64",
            },
            TargetCase {
                os: "linux",
                arch: "aarch64",
                abi: "",
                env: "gnu",
                artifact: "linux-aarch64",
            },
            TargetCase {
                os: "macos",
                arch: "x86_64",
                abi: "",
                env: "",
                artifact: "macos-x86_64",
            },
            TargetCase {
                os: "macos",
                arch: "aarch64",
                abi: "",
                env: "",
                artifact: "macos-aarch64",
            },
            TargetCase {
                os: "windows",
                arch: "x86_64",
                abi: "",
                env: "msvc",
                artifact: "windows-x86_64",
            },
            TargetCase {
                os: "ios",
                arch: "aarch64",
                abi: "",
                env: "",
                artifact: "ios-aarch64",
            },
            TargetCase {
                os: "ios",
                arch: "aarch64",
                abi: "sim",
                env: "sim",
                artifact: "ios-aarch64-sim",
            },
            TargetCase {
                os: "ios",
                arch: "x86_64",
                abi: "sim",
                env: "sim",
                artifact: "ios-x86_64-sim",
            },
            TargetCase {
                os: "tvos",
                arch: "aarch64",
                abi: "",
                env: "",
                artifact: "tvos-aarch64",
            },
            TargetCase {
                os: "tvos",
                arch: "aarch64",
                abi: "sim",
                env: "sim",
                artifact: "tvos-aarch64-sim",
            },
            TargetCase {
                os: "visionos",
                arch: "aarch64",
                abi: "",
                env: "",
                artifact: "visionos-aarch64",
            },
            TargetCase {
                os: "visionos",
                arch: "aarch64",
                abi: "sim",
                env: "sim",
                artifact: "visionos-aarch64-sim",
            },
            TargetCase {
                os: "watchos",
                arch: "aarch64",
                abi: "",
                env: "",
                artifact: "watchos-aarch64",
            },
            TargetCase {
                os: "watchos",
                arch: "aarch64",
                abi: "sim",
                env: "sim",
                artifact: "watchos-aarch64-sim",
            },
            TargetCase {
                os: "android",
                arch: "aarch64",
                abi: "",
                env: "",
                artifact: "android-aarch64",
            },
            TargetCase {
                os: "android",
                arch: "x86_64",
                abi: "",
                env: "",
                artifact: "android-x86_64",
            },
        ];

        for case in supported {
            assert_eq!(
                artifact_for(case.os, case.arch, case.abi, case.env),
                Some(case.artifact),
                "wrong Colyseus artifact for {}-{} (abi={}, env={})",
                case.os,
                case.arch,
                case.abi,
                case.env,
            );
        }
    }

    #[test]
    fn colyseus_target_resolver_rejects_unsupported_abi_and_architectures() {
        assert_eq!(artifact_for("linux", "x86_64", "", "musl"), None);
        assert_eq!(artifact_for("windows", "x86_64", "", "gnu"), None);
        assert_eq!(artifact_for("ios", "aarch64", "sim", ""), None);
        assert_eq!(artifact_for("freebsd", "x86_64", "", ""), None);
    }
}
