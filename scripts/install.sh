#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js / npm required: https://nodejs.org/"
  exit 1
fi

echo "Installing dependencies..."
npm install
echo "Done. On Windows, run install.bat and use the desktop shortcut."
