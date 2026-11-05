#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
/usr/bin/time -p node "$PROJECT_DIR/scripts/capture.mjs"
