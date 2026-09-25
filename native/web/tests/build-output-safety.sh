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

echo "Web build output safety checks passed."
