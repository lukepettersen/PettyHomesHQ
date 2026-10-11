#!/usr/bin/env bash
# Wraps each mockup fragment in a full HTML document so the pages can be
# published together as one Artifact and linked from the top nav tabs.
# Usage: mockups/build.sh <out-dir>
set -euo pipefail
cd "$(dirname "$0")"
out="${1:?usage: build.sh <out-dir>}"
mkdir -p "$out"
for pair in deals-pipeline:deals tasks:tasks people:people messages:messages admin:admin; do
  src="${pair%%:*}"; dst="${pair##*:}"
  {
    printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>html{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%%}[hidden]{display:none!important}</style>\n'
    cat "$src.html"
    printf '\n</body></html>\n'
  } > "$out/$dst.html"
done
