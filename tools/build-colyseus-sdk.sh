#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: tools/build-colyseus-sdk.sh <rust-target>

Builds Colyseus Native SDK 0.18.7 with Zig 0.15.2 and writes a complete
static archive plus the upstream core archive and license files under
native/third_party/colyseus/lib/<artifact>/.

Set ZIG to the Zig 0.15.2 executable, ANDROID_NDK_HOME for Android targets,
or COLYSEUS_SDK_SOURCE / COLYSEUS_ARTIFACT_ROOT to override repository paths.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

RUST_TARGET=$1
ZIG_TARGET=
ARTIFACT=
APPLE_SDK=
TARGET_OS=
ZIG_CPU=

case "$RUST_TARGET" in
  x86_64-unknown-linux-gnu|x86_64-linux-gnu)
    ZIG_TARGET=x86_64-linux-gnu; ARTIFACT=linux-x86_64; TARGET_OS=linux ;;
  aarch64-unknown-linux-gnu|aarch64-linux-gnu)
    ZIG_TARGET=aarch64-linux-gnu; ARTIFACT=linux-aarch64; TARGET_OS=linux ;;
  x86_64-apple-darwin)
    ZIG_TARGET=x86_64-macos; ARTIFACT=macos-x86_64; TARGET_OS=macos; APPLE_SDK=macosx ;;
  aarch64-apple-darwin)
    ZIG_TARGET=aarch64-macos; ARTIFACT=macos-aarch64; TARGET_OS=macos; APPLE_SDK=macosx ;;
  x86_64-pc-windows-msvc)
    ZIG_TARGET=x86_64-windows-msvc; ARTIFACT=windows-x86_64; TARGET_OS=windows ;;
  aarch64-apple-ios)
    ZIG_TARGET=aarch64-ios; ARTIFACT=ios-aarch64; TARGET_OS=ios; APPLE_SDK=iphoneos ;;
  aarch64-apple-ios-sim)
    ZIG_TARGET=aarch64-ios-simulator; ARTIFACT=ios-aarch64-sim; TARGET_OS=ios; APPLE_SDK=iphonesimulator; ZIG_CPU=apple_m1 ;;
  x86_64-apple-ios)
    ZIG_TARGET=x86_64-ios-simulator; ARTIFACT=ios-x86_64-sim; TARGET_OS=ios; APPLE_SDK=iphonesimulator ;;
  aarch64-apple-tvos)
    ZIG_TARGET=aarch64-tvos; ARTIFACT=tvos-aarch64; TARGET_OS=tvos; APPLE_SDK=appletvos ;;
  aarch64-apple-tvos-sim)
    ZIG_TARGET=aarch64-tvos-simulator; ARTIFACT=tvos-aarch64-sim; TARGET_OS=tvos; APPLE_SDK=appletvsimulator; ZIG_CPU=apple_m1 ;;
  aarch64-apple-visionos)
    ZIG_TARGET=aarch64-visionos; ARTIFACT=visionos-aarch64; TARGET_OS=visionos; APPLE_SDK=xros ;;
  aarch64-apple-visionos-sim)
    ZIG_TARGET=aarch64-visionos-simulator; ARTIFACT=visionos-aarch64-sim; TARGET_OS=visionos; APPLE_SDK=xrsimulator ;;
  aarch64-apple-watchos)
    ZIG_TARGET=aarch64-watchos; ARTIFACT=watchos-aarch64; TARGET_OS=watchos; APPLE_SDK=watchos ;;
  aarch64-apple-watchos-sim)
    ZIG_TARGET=aarch64-watchos-simulator; ARTIFACT=watchos-aarch64-sim; TARGET_OS=watchos; APPLE_SDK=watchsimulator; ZIG_CPU=apple_m1 ;;
  aarch64-linux-android)
    ZIG_TARGET=aarch64-linux-android.21; ARTIFACT=android-aarch64; TARGET_OS=android ;;
  x86_64-linux-android)
    ZIG_TARGET=x86_64-linux-android.21; ARTIFACT=android-x86_64; TARGET_OS=android ;;
  *)
    printf 'Unsupported Rust target for Colyseus SDK build: %s\n' "$RUST_TARGET" >&2
    exit 2
    ;;
esac

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
SDK_SOURCE=${COLYSEUS_SDK_SOURCE:-"$REPO_ROOT/native/third_party/colyseus-sdk-src"}
ARTIFACT_ROOT=${COLYSEUS_ARTIFACT_ROOT:-"$REPO_ROOT/native/third_party/colyseus/lib"}
ZIG_BIN=${ZIG:-zig}
if [[ "$ZIG_BIN" == */* ]]; then
  ZIG_BIN="$(cd -- "$(dirname -- "$ZIG_BIN")" && pwd)/$(basename -- "$ZIG_BIN")"
fi
if ! command -v "$ZIG_BIN" >/dev/null 2>&1; then
  printf 'Zig 0.15.2 executable not found: %s\n' "$ZIG_BIN" >&2
  exit 1
fi
ZIG_VERSION=$("$ZIG_BIN" version)

if [[ "$ZIG_VERSION" != "0.15.2" ]]; then
  printf 'Colyseus Native SDK requires Zig 0.15.2; found %s\n' "$ZIG_VERSION" >&2
  exit 1
fi

if [[ ! -f "$SDK_SOURCE/build.zig" || ! -f "$SDK_SOURCE/.git" && ! -d "$SDK_SOURCE/.git" ]]; then
  printf 'Pinned Colyseus SDK source submodule is missing at %s\n' "$SDK_SOURCE" >&2
  exit 1
fi

PINNED_COMMIT=$(sed -n 's/^- Upstream commit: `\([0-9a-f]*\)`$/\1/p' "$REPO_ROOT/native/third_party/colyseus/VERSION.md")
SOURCE_COMMIT=$(git -C "$SDK_SOURCE" rev-parse HEAD)
if [[ -z "$PINNED_COMMIT" || "$SOURCE_COMMIT" != "$PINNED_COMMIT" ]]; then
  printf 'Colyseus SDK source must be pinned at %s (found %s)\n' "${PINNED_COMMIT:-unset}" "$SOURCE_COMMIT" >&2
  exit 1
fi

if [[ -n "$APPLE_SDK" ]]; then
  if ! command -v xcrun >/dev/null 2>&1; then
    printf 'Building %s requires the Apple xcrun toolchain and SDK %s\n' "$RUST_TARGET" "$APPLE_SDK" >&2
    exit 1
  fi
  APPLE_SDK_PATH=$(xcrun --sdk "$APPLE_SDK" --show-sdk-path)
fi

ANDROID_NDK=${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}
ANDROID_NDK_SYSROOT=
if [[ "$TARGET_OS" == "android" && -z "$ANDROID_NDK" ]]; then
  printf 'Building %s requires ANDROID_NDK_HOME or ANDROID_NDK_ROOT\n' "$RUST_TARGET" >&2
  exit 1
fi
if [[ "$TARGET_OS" == "android" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) ANDROID_NDK_HOST=linux-x86_64 ;;
    Darwin-x86_64|Darwin-arm64) ANDROID_NDK_HOST=darwin-x86_64 ;;
    MINGW64_NT*-x86_64|MSYS_NT*-x86_64|CYGWIN_NT*-x86_64) ANDROID_NDK_HOST=windows-x86_64 ;;
    *)
      printf 'Unsupported host for Android NDK SDK build: %s-%s\n' "$(uname -s)" "$(uname -m)" >&2
      exit 1
      ;;
  esac
  ANDROID_NDK_SYSROOT="$ANDROID_NDK/toolchains/llvm/prebuilt/$ANDROID_NDK_HOST/sysroot"
  if [[ ! -d "$ANDROID_NDK_SYSROOT" ]]; then
    printf 'Android NDK sysroot not found: %s\n' "$ANDROID_NDK_SYSROOT" >&2
    exit 1
  fi
fi

git -C "$SDK_SOURCE" submodule update --init --recursive

WINDOWS_PATCH="$REPO_ROOT/tools/patches/colyseus-native-sdk-windows-msvc.patch"
if [[ ! -f "$WINDOWS_PATCH" ]]; then
  printf 'Required SDK compatibility patch is missing: %s\n' "$WINDOWS_PATCH" >&2
  exit 1
fi
PATCH_APPLIED_BY_SCRIPT=0
if git -C "$SDK_SOURCE" apply --check "$WINDOWS_PATCH"; then
  git -C "$SDK_SOURCE" apply "$WINDOWS_PATCH"
  PATCH_APPLIED_BY_SCRIPT=1
elif ! git -C "$SDK_SOURCE" apply --reverse --check "$WINDOWS_PATCH"; then
  printf 'Pinned SDK source does not match the compatibility patch: %s\n' "$WINDOWS_PATCH" >&2
  exit 1
fi

BUILD_TMP=
cleanup() {
  if [[ -n "$BUILD_TMP" && -d "$BUILD_TMP" ]]; then
    rm -rf "$BUILD_TMP"
  fi
  if [[ "$PATCH_APPLIED_BY_SCRIPT" == "1" ]]; then
    git -C "$SDK_SOURCE" apply --reverse "$WINDOWS_PATCH"
  fi
}
trap cleanup EXIT

GLOBAL_CACHE=${COLYSEUS_ZIG_GLOBAL_CACHE_DIR:-"${TMPDIR:-/tmp}/colyseus-zig-global-$PINNED_COMMIT"}
rm -rf "$SDK_SOURCE/zig-out"
BUILD_ARGS=(build "-Dtarget=$ZIG_TARGET" -Doptimize=ReleaseFast -Dexamples=false -Dskip-integration=true --global-cache-dir "$GLOBAL_CACHE")
if [[ -n "$ZIG_CPU" ]]; then
  BUILD_ARGS+=("-Dcpu=$ZIG_CPU")
fi
if [[ -n "$APPLE_SDK" ]]; then
  BUILD_ARGS+=("-Dapple-sdk=$APPLE_SDK_PATH")
fi
if [[ "$TARGET_OS" == "visionos" ]]; then
  # Zig 0.15.2's Darwin unwinder does not model visionOS ucontext; stripping
  # debug info avoids compiling the unsupported DWARF register lookup.
  BUILD_ARGS+=("-Dstrip=true")
fi
if [[ "$TARGET_OS" == "android" ]]; then
  BUILD_ARGS+=("-Dandroid-ndk=$ANDROID_NDK")
fi

printf 'Building Colyseus SDK %s for %s (%s) with Zig %s\n' "$PINNED_COMMIT" "$RUST_TARGET" "$ZIG_TARGET" "$ZIG_VERSION"
(cd "$SDK_SOURCE" && "$ZIG_BIN" "${BUILD_ARGS[@]}")

SDK_LIB_DIR="$SDK_SOURCE/zig-out/lib"
if [[ "$TARGET_OS" == "windows" ]]; then
  CORE_ARCHIVE="$SDK_LIB_DIR/colyseus.lib"
  BUNDLED_NAME=colyseus_bundled.lib
  shopt -s nullglob
  SDK_ARCHIVES=("$SDK_LIB_DIR"/*.lib)
else
  CORE_ARCHIVE="$SDK_LIB_DIR/libcolyseus.a"
  BUNDLED_NAME=libcolyseus_bundled.a
  shopt -s nullglob
  SDK_ARCHIVES=("$SDK_LIB_DIR"/*.a)
fi

if [[ ! -f "$CORE_ARCHIVE" || ${#SDK_ARCHIVES[@]} -lt 2 ]]; then
  printf 'SDK build did not produce the core archive and dependency closure under %s\n' "$SDK_LIB_DIR" >&2
  exit 1
fi

BUILD_TMP=$(mktemp -d "${TMPDIR:-/tmp}/colyseus-sdk-build.XXXXXX")
mkdir -p "$BUILD_TMP/objects"
OBJECTS=()
for archive in "${SDK_ARCHIVES[@]}"; do
  archive_tag=$(basename "$archive" | tr -c '[:alnum:]' '_')
  extraction="$BUILD_TMP/extract-$archive_tag"
  mkdir -p "$extraction"
  (cd "$extraction" && "$ZIG_BIN" ar x "$archive")
  for member in "$extraction"/*; do
    [[ -f "$member" ]] || continue
    chmod u+rw "$member"
    object="$BUILD_TMP/objects/${archive_tag}$(basename "$member")"
    cp "$member" "$object"
    OBJECTS+=("$object")
  done
done

if [[ ${#OBJECTS[@]} -eq 0 ]]; then
  printf 'No object members were found in the SDK static archives under %s\n' "$SDK_LIB_DIR" >&2
  exit 1
fi

if [[ "$TARGET_OS" == "android" ]]; then
  ANDROID_PREADV_SHIM_OBJECT="$BUILD_TMP/objects/android-preadv-compat.o"
  "$ZIG_BIN" cc -target "$ZIG_TARGET" --sysroot "$ANDROID_NDK_SYSROOT" -fPIC -c \
    "$REPO_ROOT/native/third_party/colyseus/android-preadv-compat.c" \
    -o "$ANDROID_PREADV_SHIM_OBJECT"
  OBJECTS+=("$ANDROID_PREADV_SHIM_OBJECT")
fi

mkdir -p "$ARTIFACT_ROOT/$ARTIFACT"
OUTPUT_ARCHIVE="$ARTIFACT_ROOT/$ARTIFACT/$BUNDLED_NAME"
rm -f "$OUTPUT_ARCHIVE"
"$ZIG_BIN" ar rcs "$OUTPUT_ARCHIVE" "${OBJECTS[@]}"
if [[ "$TARGET_OS" == "windows" ]]; then
  cp "$CORE_ARCHIVE" "$ARTIFACT_ROOT/$ARTIFACT/colyseus.lib"
else
  cp "$CORE_ARCHIVE" "$ARTIFACT_ROOT/$ARTIFACT/libcolyseus.a"
fi

LICENSES="$ARTIFACT_ROOT/$ARTIFACT/licenses"
mkdir -p "$LICENSES"
if [[ -f "$SDK_SOURCE/LICENSE" ]]; then
  mkdir -p "$LICENSES/colyseus-native-sdk"
  cp "$SDK_SOURCE/LICENSE" "$LICENSES/colyseus-native-sdk/LICENSE"
fi
find "$SDK_SOURCE/third_party" -type f \( -iname 'license*' -o -iname 'copying*' -o -iname 'notice*' \) -print0 |
  while IFS= read -r -d '' license; do
    relative=${license#"$SDK_SOURCE/"}
    mkdir -p "$LICENSES/$(dirname "$relative")"
    cp "$license" "$LICENSES/$relative"
  done
if [[ -d "$GLOBAL_CACHE/p" ]]; then
  find "$GLOBAL_CACHE/p" -type f \( -iname 'license*' -o -iname 'copying*' -o -iname 'notice*' \) -print0 |
    while IFS= read -r -d '' license; do
      relative=${license#"$GLOBAL_CACHE/p/"}
      mkdir -p "$LICENSES/zig-dependencies/$(dirname "$relative")"
      cp "$license" "$LICENSES/zig-dependencies/$relative"
    done
fi

MANIFEST="$ARTIFACT_ROOT/$ARTIFACT/BUILD-MANIFEST.txt"
{
  printf 'Colyseus Native SDK commit: %s\n' "$SOURCE_COMMIT"
  printf 'Zig version: %s\n' "$ZIG_VERSION"
  printf 'Rust target: %s\n' "$RUST_TARGET"
  printf 'Zig target: %s\n' "$ZIG_TARGET"
  printf 'Zig CPU: %s\n' "${ZIG_CPU:-baseline}"
  printf 'Bundled archive: %s\n' "$BUNDLED_NAME"
  printf 'Build patches: %s\n' "$(basename "$WINDOWS_PATCH")"
  if [[ "$TARGET_OS" == "android" ]]; then
    printf 'Android compatibility: android-preadv-compat.c (API 21)\n'
  fi
  printf 'Input archives:\n'
  for archive in "${SDK_ARCHIVES[@]}"; do printf '  %s\n' "$(basename "$archive")"; done
} > "$MANIFEST"

printf 'Wrote %s\n' "$OUTPUT_ARCHIVE"
