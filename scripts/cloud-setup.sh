#!/usr/bin/env bash
set -euo pipefail

# Existing cloud checkouts are isolated already; use this checkout without a worktree. The repository was renamed
# Armin-terminal on 31 October 2026, so the checkout is found from this script rather than by its folder's name.
cd "$(dirname "$0")/.."
export npm_config_cache=/workspace/.npm-cache
export electron_config_cache=/workspace/.cache/electron
export NODE_USE_ENV_PROXY=1
mkdir -p /workspace/.cache

# Keep lockfile integrity and Electron's published checksum verification enabled.
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund
node node_modules/electron/install.js

# The cloud image provides Chromium and its shared libraries, but not Xvfb.
# Install a user-local Xvfb from APT's signed Debian indexes; no system files need changing.
if ! command -v Xvfb >/dev/null && [[ ! -x /workspace/.cache/xvfb/usr/bin/Xvfb ]]; then
  if ! [[ -f /usr/share/keyrings/debian-archive-keyring.gpg ]] || ! rg -q '^VERSION_CODENAME=trixie$' /etc/os-release; then
    printf '%s\n' "Install Xvfb using the image's signed package manager before desktop tests." >&2
    exit 1
  fi
  task_apt=/workspace/.cache/armin-apt
  mkdir -p "$task_apt/lists/partial" "$task_apt/cache/archives/partial" "$task_apt/empty" /workspace/.cache/xvfb
  cat > "$task_apt/apt.conf" <<'APT'
Dir::Etc::Parts "/workspace/.cache/armin-apt/empty";
Dir::Etc::main "/dev/null";
Dir::Etc::sourcelist "/workspace/.cache/armin-apt/debian.sources";
Dir::Etc::sourceparts "/workspace/.cache/armin-apt/empty";
Dir::State::lists "/workspace/.cache/armin-apt/lists";
Dir::Cache "/workspace/.cache/armin-apt/cache";
APT
  cat > "$task_apt/debian.sources" <<'SOURCES'
Types: deb
URIs: https://deb.debian.org/debian
Suites: trixie trixie-updates
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: https://security.debian.org/debian-security
Suites: trixie-security
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
SOURCES
  APT_CONFIG="$task_apt/apt.conf" /usr/bin/apt-get update
  task_download_dir=$(mktemp -d /workspace/.cache/armin-xvfb-download.XXXXXX)
  (
    cd "$task_download_dir"
    APT_CONFIG="$task_apt/apt.conf" /usr/bin/apt-get download xvfb
    # A fresh directory contains only the package this verified APT request downloaded.
    task_packages=(xvfb_*.deb)
    [[ ${#task_packages[@]} -eq 1 && -f "${task_packages[0]}" ]]
    dpkg-deb -x "${task_packages[0]}" /workspace/.cache/xvfb
  )
fi

# Node tests do not need Electron's runtime; desktop tests do. No credentials are installed here.
npm run build
