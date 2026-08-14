#!/bin/sh
# dsh-better-launcher one-line installer (macOS / Linux)
#
#   curl -fsSL https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.sh | sh
#
# Overrides:
#   DSH_LAUNCHER_VERSION  git ref (tag/branch/sha); default is the default branch
#   DSH_LAUNCHER_REPO     GitHub repo, default mocchh/dsh-better-launcher
#   DSH_LAUNCHER_BASE     if set, download dsh-better-launcher-<ver>.tgz from this URL
#   DSH_LAUNCHER_SHA256   required for integrity when DSH_LAUNCHER_BASE is used
set -e

VERSION="${DSH_LAUNCHER_VERSION:-}"
BASE="${DSH_LAUNCHER_BASE:-}"
BASE="${BASE%/}"
REPO="${DSH_LAUNCHER_REPO:-mocchh/dsh-better-launcher}"

info() { printf 'dsh: %s\n' "$*"; }
fail() { printf 'dsh: error: %s\n' "$*" >&2; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  fail 'Node.js not found. Install Node.js ^22.19.0 or >=24: https://nodejs.org/'
fi
node -e "const v=process.versions.node.split('.').map(Number); if(!(v[0]>=24||(v[0]===22&&v[1]>=19))) process.exit(1)" \
  || fail "Node.js ^22.19.0 || >=24.0.0 required (found $(node --version))"
command -v npm >/dev/null 2>&1 || fail 'npm not found'

install_tarball() {
  vername="${VERSION:-1.0.1}"
  tmp="$(mktemp -d)" || fail 'cannot create temp directory'
  trap 'rm -rf "$tmp"' EXIT
  tgz="$tmp/dsh-better-launcher-$vername.tgz"
  url="$BASE/dsh-better-launcher-$vername.tgz"
  info "downloading $url ..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$tgz"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$tgz"
  else
    fail 'neither curl nor wget found'
  fi
  if [ -z "$DSH_LAUNCHER_SHA256" ]; then
    fail 'DSH_LAUNCHER_BASE requires DSH_LAUNCHER_SHA256 to verify the tarball'
  fi
  expected="$(printf '%s' "$DSH_LAUNCHER_SHA256" | tr 'A-F' 'a-f')"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tgz" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$tgz" | awk '{print $1}')"
  else
    fail 'sha256 tool not found (needed for DSH_LAUNCHER_SHA256)'
  fi
  if [ "$actual" != "$expected" ]; then
    fail "sha256 mismatch (got $actual)"
  fi
  info 'installing (npm install -g) ...'
  if ! npm install -g "$tgz"; then
    fail 'npm install -g failed (if it is a permission error, retry with: sudo npm install -g)'
  fi
}

install_github() {
  spec="$REPO"
  if [ -n "$VERSION" ]; then spec="$REPO#$VERSION"; fi
  info "installing $spec (npm install -g) ..."
  if ! npm install -g "$spec"; then
    fail 'npm install -g failed (if it is a permission error, retry with: sudo npm install -g)'
  fi
}

if [ -n "$BASE" ]; then
  install_tarball
else
  install_github
fi

info 'done.'
info 'try: dsh status'
