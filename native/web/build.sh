#!/bin/bash
# Build Bloom Engine for Web
#
# Usage:
#   ./native/web/build.sh [--dev | --release] [game.ts] [--output dist/]
#
# Steps:
#   1. Build bloom_web.wasm via wasm-pack
#   2. Compile game TypeScript via perry --target wasm (if provided)
#   3. Assemble output directory with all files needed to serve
#
# Prerequisites:
#   - wasm-pack: cargo install wasm-pack
#   - perry: ../../../perry/perry/target/release/perry (or in PATH)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENGINE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WEB_CRATE="$SCRIPT_DIR"
BUILD_PROFILE="--release"
PROFILE_SET=0
OUTPUT_DIR=""
GAME_FILE=""

usage() {
  cat <<'USAGE'
Usage: ./native/web/build.sh [--dev | --release] [game.ts] [--output dist/]

Profiles:
  --dev       Faster iterative build; skips wasm-opt.
  --release   Optimized build (default); runs wasm-opt once with -Oz.

Options:
  --output DIR  Write the assembled site to DIR (default: dist/web).
  -h, --help    Show this help.
USAGE
}

usage_error() {
  echo "ERROR: $1" >&2
  usage >&2
  exit 2
}

while (($#)); do
  case "$1" in
    --dev|--release)
      if ((PROFILE_SET)) && [[ "$BUILD_PROFILE" != "$1" ]]; then
        usage_error "--dev and --release cannot be used together"
      fi
      BUILD_PROFILE="$1"
      PROFILE_SET=1
      shift
      ;;
    --output)
      (($# >= 2)) || usage_error "--output requires a directory"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --output=*)
      OUTPUT_DIR="${1#*=}"
      [[ -n "$OUTPUT_DIR" ]] || usage_error "--output requires a directory"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -* )
      usage_error "unknown option: $1"
      ;;
    *)
      [[ -z "$GAME_FILE" ]] || usage_error "only one game file may be provided"
      GAME_FILE="$1"
      shift
      ;;
  esac
done

OUTPUT_DIR="${OUTPUT_DIR:-$ENGINE_DIR/dist/web}"
if [[ "$OUTPUT_DIR" != /* ]]; then
  OUTPUT_DIR="$PWD/$OUTPUT_DIR"
fi

# Resolve the game file to an absolute path NOW, while still in the caller's
# working directory — the build cd's into the web crate before compiling, so a
# relative path like `examples/pong/main.ts` would otherwise no longer resolve.
if [ -n "$GAME_FILE" ]; then
  if [ -f "$GAME_FILE" ]; then
    GAME_FILE="$(cd "$(dirname "$GAME_FILE")" && pwd)/$(basename "$GAME_FILE")"
  else
    echo "ERROR: game file not found: $GAME_FILE"
    exit 1
  fi
fi

PERRY_TMP=""
cleanup() {
  if [[ -n "$PERRY_TMP" ]]; then
    rm -rf "$PERRY_TMP"
  fi
}
trap cleanup EXIT

echo "=== Bloom Web Build ==="
echo "  Profile: $BUILD_PROFILE"
echo ""

# 1. Build Bloom WASM via wasm-pack
echo "[1/3] Building bloom_web.wasm..."
cd "$WEB_CRATE"
wasm-pack build --target web --out-dir pkg --no-typescript "$BUILD_PROFILE" 2>&1 | tail -3
echo "  Output: $WEB_CRATE/pkg/"

# 2. Compile game (if provided)
PERRY_HTML=""
if [ -n "$GAME_FILE" ] && [ -f "$GAME_FILE" ]; then
  echo "[2/3] Compiling game: $GAME_FILE"

  # Find perry compiler
  PERRY=""
  if command -v perry &> /dev/null; then
    PERRY="perry"
  elif [ -f "$ENGINE_DIR/../../perry/perry/target/release/perry" ]; then
    PERRY="$ENGINE_DIR/../../perry/perry/target/release/perry"
  else
    echo "  ERROR: perry compiler not found. Install it or add to PATH."
    exit 1
  fi

  # Perry emits a self-contained HTML carrying the game WASM (base64) plus its
  # full runtime bridge (the ~280 `rt`-namespace host functions + NaN-boxing +
  # closure dispatch). build.sh later splices the Bloom engine bootstrap into it.
  # Use a temp dir (portable across GNU/BSD mktemp) so cleanup is a single rm.
  PERRY_TMP="$(mktemp -d)"
  PERRY_HTML="$PERRY_TMP/game.html"
  "$PERRY" "$GAME_FILE" --target wasm -o "$PERRY_HTML"
  echo "  Game compiled to WASM ($PERRY_HTML)"
else
  echo "[2/3] No game file specified, skipping game compilation"
fi

# 3. Assemble output directory
echo "[3/3] Assembling output..."
mkdir -p "$OUTPUT_DIR"

# Copy Bloom WASM package
cp -r "$WEB_CRATE/pkg" "$OUTPUT_DIR/pkg"

# Engine bootstrap + Jolt bridge are needed by both the game and engine-only pages.
cp "$WEB_CRATE/bloom_glue.js" "$OUTPUT_DIR/bloom_glue.js"
cp "$WEB_CRATE/jolt_bridge.js" "$OUTPUT_DIR/jolt_bridge.js"

if [ -n "$PERRY_HTML" ]; then
  # Game build: splice the Bloom bootstrap into Perry's HTML and gate the game's
  # bootPerryWasm() call on engine readiness → dist/web/index.html.
  python3 "$WEB_CRATE/splice_game.py" "$PERRY_HTML" "$OUTPUT_DIR/index.html"
  echo "  Spliced game + engine into index.html"
else
  # No game: ship the engine-only standalone page.
  cp "$WEB_CRATE/index.html" "$OUTPUT_DIR/index.html"
  echo "  Copied engine-only index.html (no game compiled)"
fi

# Copy game assets (if game directory has an assets/ folder)
if [ -n "$GAME_FILE" ]; then
  GAME_DIR="$(dirname "$(realpath "$GAME_FILE")")"
  if [ -d "$GAME_DIR/assets" ]; then
    cp -r "$GAME_DIR/assets" "$OUTPUT_DIR/assets"
    echo "  Copied assets/ directory"
  fi
fi

# Calculate total size
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
WASM_SIZE=$(wc -c < "$OUTPUT_DIR/pkg/bloom_web_bg.wasm" 2>/dev/null || echo "0")

echo ""
echo "=== Build Complete ==="
echo "  Output: $OUTPUT_DIR"
echo "  WASM size: $((WASM_SIZE / 1024))KB"
echo "  Total size: $TOTAL_SIZE"
echo ""
echo "To serve locally:"
echo "  cd $OUTPUT_DIR && python3 -m http.server 8080"
echo "  Open http://localhost:8080"
