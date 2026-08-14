#!/bin/sh
# dsh-better-launcher one-line installer (macOS / Linux)
#
#   curl -fsSL https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.sh | sh
#
# Overrides (mirrors / intranet):
#   DSH_LAUNCHER_VERSION  package version, default 1.0.0
#   DSH_LAUNCHER_BASE     base URL hosting the tarball
set -e

VERSION="${DSH_LAUNCHER_VERSION:-1.0.0}"
BASE="${DSH_LAUNCHER_BASE:-https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main}"
BASE="${BASE%/}"

info() { printf 'dsh: %s\n' "$*"; }
fail() { printf 'dsh: error: %s\n' "$*" >&2; exit 1; }

# Node.js >= 18
if ! command -v node >/dev/null 2>&1; then
  fail 'Node.js not found. Install Node.js >= 18 first: https://nodejs.org/'
fi
maj="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$maj" -lt 18 ]; then
  fail "Node.js >= 18 required (found $(node --version))"
fi
command -v npm >/dev/null 2>&1 || fail 'npm not found'

tmp="$(mktemp -d)" || fail 'cannot create temp directory'
trap 'rm -rf "$tmp"' EXIT
tgz="$tmp/dsh-better-launcher-$VERSION.tgz"

info "downloading dsh-better-launcher $VERSION ..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$BASE/dsh-better-launcher-$VERSION.tgz" -o "$tgz"
elif command -v wget >/dev/null 2>&1; then
  wget -q "$BASE/dsh-better-launcher-$VERSION.tgz" -O "$tgz"
else
  fail 'neither curl nor wget found'
fi

info 'installing (npm install -g) ...'
if ! npm install -g "$tgz"; then
  fail 'npm install -g failed (if it is a permission error, retry with: sudo npm install -g)'
fi

info 'done.'
info 'try: dsh status'
