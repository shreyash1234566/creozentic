#!/usr/bin/env bash
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
corpus="$root/docs/graphify-batches/corpora/workers-real"
outroot="$root/docs/graphify-batches/outputs/workers"
mkdir -p "$corpus" "$outroot"

run_one() {
  repo="$1"
  src="$root/third_party/$repo"
  dst="$corpus/$repo"
  out="$outroot/$repo"
  rm -rf "$dst" "$out"
  mkdir -p "$dst"
  cp -al "$src"/. "$dst"/ 2>/dev/null || cp -a "$src"/. "$dst"/
  find "$dst" -type d \( -name .git -o -name node_modules -o -name __pycache__ -o -name .venv -o -name dist -o -name build \) -prune -exec rm -rf {} + 2>/dev/null || true
  echo "START $repo"
  timeout 240s graphify "$dst" --code-only --out "$out" --no-cluster --max-concurrency 1 --workers 3 >"$out.log" 2>&1
  code=$?
  echo "END $repo exit=$code"
  tail -6 "$out.log" || true
}

repos=(ai-broll ave comfyui cutscript funclip openchatcut openmontage openshorts pixeltable temporal twick videoagent videoclipper videodb-director vimax)
for repo in "${repos[@]}"; do
  run_one "$repo"
done
