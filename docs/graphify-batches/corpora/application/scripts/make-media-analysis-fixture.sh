#!/usr/bin/env bash
set -euo pipefail
out="${1:?output path required}"
ffmpeg -hide_banner -loglevel error -f lavfi -i "testsrc2=size=320x180:rate=24" -t 2 -c:v libx264 -pix_fmt yuv420p -an -y "$out"
