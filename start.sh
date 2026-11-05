#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
export PORT

# Keep the static preview and all generated project files within the project.
/usr/bin/time -p npm ci
/usr/bin/time -p npm run copy:web
/usr/bin/time -p mkdir -p "$PROJECT_DIR/dist/web"
/usr/bin/time -p cp -a "$PROJECT_DIR/www/." "$PROJECT_DIR/dist/web/"

# The deployment controller consumes this metadata; it is not application output.
WEB_METADATA_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$WEB_METADATA_DIR"
WEB_METADATA_DIR="$WEB_METADATA_DIR" /usr/bin/time -p node -e 'const fs=require("node:fs"); const path=require("node:path"); const project=process.cwd(); fs.writeFileSync(path.join(process.env.WEB_METADATA_DIR,"deployment-output.json"), JSON.stringify({project,directory:path.join(project,"dist","web")})+"\n")'

# This process intentionally remains in the foreground for the controller.
/usr/bin/time -p node "$PROJECT_DIR/scripts/serve-static.mjs" "$PROJECT_DIR/dist/web"
