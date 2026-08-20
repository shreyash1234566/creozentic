#!/usr/bin/env bash
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
source_root="$root/third_party/temporal"
corpus_root="$root/docs/graphify-batches/corpora/temporal-modules"
out_root="$root/docs/graphify-batches/outputs/temporal-modules"
mkdir -p "$corpus_root" "$out_root"
modules=(api chasm client cmd common components config docker proto schema service temporal temporaltest tools tests)
for module in "${modules[@]}"; do
  src="$source_root/$module"
  [ -e "$src" ] || continue
  dst="$corpus_root/$module"
  out="$out_root/$module"
  rm -rf "$dst" "$out"
  mkdir -p "$dst"
  cp -al "$src"/. "$dst"/ 2>/dev/null || cp -a "$src"/. "$dst"/
  find "$dst" -type d \( -name .git -o -name node_modules -o -name __pycache__ -o -name .venv -o -name dist -o -name build \) -prune -exec rm -rf {} + 2>/dev/null || true
  echo "START $module"
  timeout 240s graphify "$dst" --code-only --out "$out" --no-cluster --max-concurrency 1 --workers 2 >"$out.log" 2>&1
  code=$?
  echo "END $module exit=$code"
  tail -5 "$out.log" || true
done
