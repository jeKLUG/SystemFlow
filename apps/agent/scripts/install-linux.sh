#!/usr/bin/env bash
set -euo pipefail
# Nur für lokale Builds. Produktion: Skript aus den Konto-Einstellungen kopieren.
# Usage: ./install-linux.sh --server https://ess.example.de --key enr_…
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${ROOT}/systemhaus-agent"
if [[ ! -x "$BIN" ]]; then
  echo "Binary $BIN nicht gefunden. Zuerst: GOOS=linux GOARCH=amd64 go build -o systemhaus-agent ."
  exit 1
fi
exec "$BIN" install "$@"
