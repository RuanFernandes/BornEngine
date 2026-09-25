#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENGINE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

STUB_BIN="$TEMP_DIR/bin"
GAME_DIR="$TEMP_DIR/game"
mkdir -p "$STUB_BIN" "$GAME_DIR/assets"

cat > "$STUB_BIN/wasm-pack" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p pkg
printf 'mock wasm' > pkg/bloom_web_bg.wasm
STUB

cat > "$STUB_BIN/perry" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
OUTPUT=""
while (($#)); do
  if [[ "$1" == "-o" ]]; then
    OUTPUT="$2"
    shift 2
  else
    shift
  fi
done
cat > "$OUTPUT" <<'HTML'
<div id="perry-root"></div>
<script>
window.__perryWasmB64 = "YQ==";
bootPerryWasm("YQ==").catch(() => {});
</script>
HTML
STUB

chmod +x "$STUB_BIN/wasm-pack" "$STUB_BIN/perry"
printf 'export function run() {}\n' > "$GAME_DIR/main.ts"
printf 'keep me\n' > "$GAME_DIR/assets/source.txt"

set +e
BUILD_OUTPUT="$(PATH="$STUB_BIN:$PATH" "$ENGINE_ROOT/native/web/build.sh" --dev "$GAME_DIR/main.ts" --output "$GAME_DIR" 2>&1)"
BUILD_STATUS=$?
set -e

if ((BUILD_STATUS == 0)); then
  echo "Expected build.sh to reject an output directory that contains game sources." >&2
  exit 1
fi

if [[ "$BUILD_OUTPUT" != *"overlaps with game source"* ]]; then
  echo "Expected a game-source overlap diagnostic, got:" >&2
  printf '%s\n' "$BUILD_OUTPUT" >&2
  exit 1
fi

if [[ ! -f "$GAME_DIR/assets/source.txt" ]]; then
  echo "build.sh removed the game's source assets." >&2
  exit 1
fi

LINKED_GAME_DIR="$TEMP_DIR/linked-game"
LINKED_OUTPUT="$TEMP_DIR/linked-output"
mkdir -p "$LINKED_GAME_DIR" "$LINKED_OUTPUT/pkg"
printf 'export function run() {}\n' > "$LINKED_GAME_DIR/main.ts"
ln -s "$LINKED_GAME_DIR/main.ts" "$LINKED_OUTPUT/pkg/main.ts"

set +e
BUILD_OUTPUT="$(PATH="$STUB_BIN:$PATH" "$ENGINE_ROOT/native/web/build.sh" --dev "$LINKED_OUTPUT/pkg/main.ts" --output "$LINKED_OUTPUT" 2>&1)"
BUILD_STATUS=$?
set -e

if ((BUILD_STATUS == 0)) || [[ "$BUILD_OUTPUT" != *"overlaps with game source"* ]]; then
  echo "Expected build.sh to reject an output directory containing a symlinked game entry." >&2
  printf '%s\n' "$BUILD_OUTPUT" >&2
  exit 1
fi

if [[ ! -L "$LINKED_OUTPUT/pkg/main.ts" ]]; then
  echo "build.sh removed the symlink to the game's TypeScript entry." >&2
  exit 1
fi

ASSET_GAME_DIR="$TEMP_DIR/asset-game"
SHARED_ASSETS="$TEMP_DIR/shared-assets"
mkdir -p "$ASSET_GAME_DIR" "$SHARED_ASSETS"
printf 'export function run() {}\n' > "$ASSET_GAME_DIR/main.ts"
printf 'keep me\n' > "$SHARED_ASSETS/source.txt"
ln -s "$SHARED_ASSETS" "$ASSET_GAME_DIR/assets"

set +e
BUILD_OUTPUT="$(PATH="$STUB_BIN:$PATH" "$ENGINE_ROOT/native/web/build.sh" --dev "$ASSET_GAME_DIR/main.ts" --output "$ASSET_GAME_DIR" 2>&1)"
BUILD_STATUS=$?
set -e

if ((BUILD_STATUS == 0)) || [[ "$BUILD_OUTPUT" != *"overlaps with game source"* ]]; then
  echo "Expected build.sh to reject an output directory containing a symlinked assets source." >&2
  printf '%s\n' "$BUILD_OUTPUT" >&2
  exit 1
fi

if [[ ! -L "$ASSET_GAME_DIR/assets" || ! -f "$SHARED_ASSETS/source.txt" ]]; then
  echo "build.sh removed the game's assets symlink or its target file." >&2
  exit 1
fi

echo "Web build output safety checks passed."
