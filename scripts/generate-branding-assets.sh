#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANDING_DIR="$ROOT_DIR/assets/branding"

MASTER_PNG="$BRANDING_DIR/master-icon.png"
ICON_SVG="$BRANDING_DIR/icon.svg"
SPLASH_SVG="$BRANDING_DIR/splash-logo.svg"

ICON_PNG="$BRANDING_DIR/icon.png"
ADAPTIVE_ICON_PNG="$BRANDING_DIR/adaptive-icon.png"
FAVICON_PNG="$BRANDING_DIR/favicon.png"
SPLASH_PNG="$BRANDING_DIR/splash-logo.png"

render_svg() {
  local input="$1"
  local size="$2"
  local output="$3"
  local temp_dir

  temp_dir="$(mktemp -d)"
  qlmanage -t -s "$size" -o "$temp_dir" "$input" >/dev/null 2>&1
  mv "$temp_dir/$(basename "$input").png" "$output"
  rmdir "$temp_dir"
}

if [[ -f "$MASTER_PNG" ]]; then
  sips -z 1024 1024 "$MASTER_PNG" --out "$ICON_PNG" >/dev/null
  cp "$ICON_PNG" "$ADAPTIVE_ICON_PNG"
  cp "$ICON_PNG" "$SPLASH_PNG"
else
  render_svg "$ICON_SVG" 1024 "$ICON_PNG"
  cp "$ICON_PNG" "$ADAPTIVE_ICON_PNG"
  render_svg "$SPLASH_SVG" 1600 "$SPLASH_PNG"
fi

sips -z 256 256 "$ICON_PNG" --out "$FAVICON_PNG" >/dev/null

echo "Generated branding assets:"
[[ -f "$MASTER_PNG" ]] && echo "- source: $MASTER_PNG"
echo "- $ICON_PNG"
echo "- $ADAPTIVE_ICON_PNG"
echo "- $FAVICON_PNG"
echo "- $SPLASH_PNG"
