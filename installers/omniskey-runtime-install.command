#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_DIR="$ROOT_DIR/.omniskey-runtime"
ENV_FILE="$ENV_DIR/omniskey-runtime.env"
ENV_EXAMPLE="$ROOT_DIR/installers/omniskey-runtime.env.example"

cd "$ROOT_DIR"
mkdir -p "$ENV_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required before OMNIS KEY Runtime can install."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE from template. Add one model key when you want live replies."
fi

set -a
source "$ENV_FILE"
set +a

npm install
npm run build
node dist/src/cli.js init "$ROOT_DIR" >/dev/null

echo "OMNIS KEY Runtime installed."
echo "Try: node dist/src/cli.js status"
echo "Ask: node dist/src/cli.js ask \"hello\""
echo "Telegram: node dist/src/cli.js telegram-poll \"$ROOT_DIR\" --json"
