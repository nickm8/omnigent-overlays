#!/bin/sh
#
# omnigent-overlays installer.
#
#   curl -fsSL https://raw.githubusercontent.com/nickm8/omnigent-overlays/main/install.sh | sh
#
set -eu

REPO_URL="${OMNIGENT_OVERLAYS_REPO:-https://github.com/nickm8/omnigent-overlays.git}"
REF="${OMNIGENT_OVERLAYS_REF:-main}"
INSTALL_DIR="${OMNIGENT_OVERLAYS_HOME:-$HOME/.local/share/omnigent-overlays}"
PROXY_PORT="${OMNIGENT_PROXY_PORT:-6768}"
# Loopback only. Exposing an authenticated Omnigent session to the network is
# not something an installer should ever do by default.
PROXY_HOST="127.0.0.1"
UPSTREAM_URL="${OMNIGENT_UPSTREAM_URL:-http://127.0.0.1:6767}"
SERVICE_NAME="omnigent-overlays"
LAUNCHD_LABEL="sh.omnigent.overlays"
INSTALL_SERVICE=true
VERIFY=true
UNINSTALL=false
NON_INTERACTIVE=false
VERBOSE=false
MIN_NODE_MAJOR=22

ESC=$(printf '\033')
RESET=
BOLD=
DIM=
MAGENTA=
GREEN=
YELLOW=
RED=

use_terminal_ui() {
  [ -t 1 ] && [ "${TERM:-}" != "dumb" ]
}

init_style() {
  if use_terminal_ui && [ -z "${NO_COLOR:-}" ]; then
    RESET="${ESC}[0m"
    BOLD="${ESC}[1m"
    DIM="${ESC}[2m"
    # Otto's magenta-pink (#F43BA6), matching the Omnigent CLI palette so the
    # installer and the tool it extends agree.
    MAGENTA="${ESC}[38;2;244;59;166m"
    GREEN="${ESC}[32m"
    YELLOW="${ESC}[33m"
    RED="${ESC}[31m"
  fi
}

usage() {
  printf 'Usage: install.sh [--no-service] [--no-verify] [--uninstall] [--repo URL] [--ref REF]\n'
  printf '                  [--dir PATH] [--port N] [--upstream URL] [--non-interactive] [--verbose]\n'
}

step() {
  printf '%s==>%s %s\n' "$MAGENTA" "$RESET" "$1"
}

verbose() {
  if [ "$VERBOSE" = true ]; then
    printf '%sDEBUG:%s %s\n' "$DIM" "$RESET" "$1" >&2
  fi
}

warn() {
  printf '%sWARNING:%s %s\n' "$YELLOW" "$RESET" "$1" >&2
}

fail() {
  printf '%sERROR:%s %s\n' "$RED" "$RESET" "$1" >&2
  exit 1
}

ok() {
  printf '%sok%s %s\n' "$GREEN" "$RESET" "$1"
}

prompt_yes_no() {
  prompt="$1"

  if [ "$NON_INTERACTIVE" = true ]; then
    return 1
  fi

  # Piped through `sh`, stdin is the script itself — read the answer from the
  # terminal instead, and treat "no terminal" as "no".
  if ! (: </dev/tty) 2>/dev/null; then
    return 1
  fi

  printf '%s [Y/n] ' "$prompt" >/dev/tty
  if ! IFS= read -r answer </dev/tty; then
    answer=
  fi

  case "$answer" in
    "" | y | Y | yes | YES | Yes) return 0 ;;
    *) return 1 ;;
  esac
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-service) INSTALL_SERVICE=false ;;
      --no-verify) VERIFY=false ;;
      --uninstall) UNINSTALL=true ;;
      --non-interactive) NON_INTERACTIVE=true ;;
      --verbose) VERBOSE=true ;;
      --help | -h)
        usage
        exit 0
        ;;
      --repo | --ref | --dir | --port | --upstream)
        if [ "$#" -lt 2 ]; then
          usage >&2
          exit 1
        fi
        case "$1" in
          --repo) REPO_URL="$2" ;;
          --ref) REF="$2" ;;
          --dir) INSTALL_DIR="$2" ;;
          --port) PROXY_PORT="$2" ;;
          --upstream) UPSTREAM_URL="$2" ;;
        esac
        shift
        ;;
      *)
        usage >&2
        exit 1
        ;;
    esac
    shift
  done
}

check_platform() {
  case "$(uname -s)" in
    Darwin | Linux) ;;
    *) fail "install.sh supports macOS and Linux only." ;;
  esac
}

# Emit the package-manager command that installs $1 on this Linux box, or
# nothing when no known package manager is present.
linux_pkg_install_cmd() {
  pkg="$1"
  if command -v apt-get >/dev/null 2>&1; then
    printf 'sudo apt-get install -y %s' "$pkg"
  elif command -v dnf >/dev/null 2>&1; then
    printf 'sudo dnf install -y %s' "$pkg"
  elif command -v yum >/dev/null 2>&1; then
    printf 'sudo yum install -y %s' "$pkg"
  elif command -v pacman >/dev/null 2>&1; then
    printf 'sudo pacman -S --noconfirm %s' "$pkg"
  elif command -v zypper >/dev/null 2>&1; then
    printf 'sudo zypper install -y %s' "$pkg"
  fi
}

ensure_git() {
  if command -v git >/dev/null 2>&1; then
    verbose "git: $(git --version)"
    return
  fi
  install_cmd=
  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        install_cmd="brew install git"
      else
        install_cmd="xcode-select --install"
      fi
      ;;
    Linux) install_cmd="$(linux_pkg_install_cmd git)" ;;
  esac
  if [ -n "$install_cmd" ] && prompt_yes_no "git is required and not installed. Install it now ($install_cmd)?"; then
    # Run directly, not captured, so sudo can prompt for a password.
    sh -c "$install_cmd" || true
    command -v git >/dev/null 2>&1 && {
      ok "git installed"
      return
    }
  fi
  fail "git is required (the registry is a git clone and updates are git fetches). Install it and re-run."
}

# Node >= 22. The injector itself only uses Node built-ins plus http-proxy-3,
# but the repo's tooling and test runner assume 22, so that is the floor. We
# read the major version rather than probe a feature because the requirement is
# the LTS line, not one specific API.
ensure_node() {
  node_hint_macos="brew install node@$MIN_NODE_MAJOR   (or https://nodejs.org)"
  node_hint_linux="https://github.com/nvm-sh/nvm  then  nvm install $MIN_NODE_MAJOR   (or https://nodejs.org)"
  case "$(uname -s)" in
    Darwin) node_hint="$node_hint_macos" ;;
    *) node_hint="$node_hint_linux" ;;
  esac

  if ! command -v node >/dev/null 2>&1; then
    fail "node not found — Node.js $MIN_NODE_MAJOR+ is required.
    $node_hint"
  fi
  node_version="$(node -p 'process.versions.node' 2>/dev/null || printf 'unknown')"
  node_major="$(printf '%s' "$node_version" | cut -d. -f1)"
  case "$node_major" in
    '' | *[!0-9]*)
      fail "could not read the Node version (got '$node_version')."
      ;;
  esac
  if [ "$node_major" -lt "$MIN_NODE_MAJOR" ]; then
    fail "Node.js $node_version is too old — $MIN_NODE_MAJOR+ is required.
    $node_hint"
  fi
  verbose "node: v$node_version"

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm not found — it ships with Node.js.
    $node_hint"
  fi
}

# systemd --user on Linux, launchd on macOS, or nothing (then we just print the
# manual command). Prints the manager name, or empty when none is usable.
detect_service_manager() {
  case "$(uname -s)" in
    Darwin)
      command -v launchctl >/dev/null 2>&1 && printf 'launchd'
      ;;
    Linux)
      # `systemctl --user` needs a running user bus; containers and some
      # minimal images have systemd installed but no session bus.
      if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
        printf 'systemd'
      fi
      ;;
  esac
}

clone_or_update() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    step "Updating existing install at $INSTALL_DIR"
    git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
    git -C "$INSTALL_DIR" fetch --quiet origin "$REF"
    # Hard reset: this directory is a managed clone of a published registry,
    # not a place to keep local edits. Anything local here is disposable.
    git -C "$INSTALL_DIR" checkout --quiet -B "$REF" "origin/$REF"
    git -C "$INSTALL_DIR" reset --hard --quiet "origin/$REF"
  elif [ -e "$INSTALL_DIR" ]; then
    fail "$INSTALL_DIR exists but is not a git clone. Move it aside, or pass --dir."
  else
    step "Cloning $REPO_URL ($REF) into $INSTALL_DIR"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --quiet --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
  fi
  ok "registry at $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
}

install_deps() {
  step "Installing the runtime dependency (http-proxy-3)"
  # --omit=dev keeps this to the one package the injector needs at runtime;
  # esbuild/tsx/playwright are only for developing overlays.
  if [ -f "$INSTALL_DIR/package-lock.json" ]; then
    (cd "$INSTALL_DIR" && npm ci --omit=dev --silent)
  else
    (cd "$INSTALL_DIR" && npm install --omit=dev --silent)
  fi
  ok "dependencies installed"
}

write_systemd_unit() {
  unit_dir="$HOME/.config/systemd/user"
  unit="$unit_dir/$SERVICE_NAME.service"
  mkdir -p "$unit_dir"
  cat >"$unit" <<UNIT
[Unit]
Description=Omnigent overlay injection proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
Environment=OMNIGENT_PROXY_HOST=$PROXY_HOST
Environment=OMNIGENT_PROXY_PORT=$PROXY_PORT
Environment=OMNIGENT_UPSTREAM_URL=$UPSTREAM_URL
Environment=OMNIGENT_OVERLAY_REGISTRY_DIR=$INSTALL_DIR
ExecStart=$(command -v node) $INSTALL_DIR/scripts/proxy.mjs
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now "$SERVICE_NAME.service"
  ok "systemd user service enabled ($SERVICE_NAME.service)"
  # Without lingering, a user service stops when the last session ends.
  if command -v loginctl >/dev/null 2>&1; then
    if ! loginctl show-user "$(id -un)" -p Linger 2>/dev/null | grep -q 'Linger=yes'; then
      printf '    %sTo keep it running after you log out:%s sudo loginctl enable-linger %s\n' \
        "$DIM" "$RESET" "$(id -un)"
    fi
  fi
}

write_launchd_plist() {
  plist_dir="$HOME/Library/LaunchAgents"
  plist="$plist_dir/$LAUNCHD_LABEL.plist"
  mkdir -p "$plist_dir"
  cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LAUNCHD_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$INSTALL_DIR/scripts/proxy.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$INSTALL_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OMNIGENT_PROXY_HOST</key><string>$PROXY_HOST</string>
    <key>OMNIGENT_PROXY_PORT</key><string>$PROXY_PORT</string>
    <key>OMNIGENT_UPSTREAM_URL</key><string>$UPSTREAM_URL</string>
    <key>OMNIGENT_OVERLAY_REGISTRY_DIR</key><string>$INSTALL_DIR</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/$LAUNCHD_LABEL.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/$LAUNCHD_LABEL.log</string>
</dict>
</plist>
PLIST
  # bootout first so a re-run reloads changed settings instead of erroring.
  launchctl bootout "gui/$(id -u)/$LAUNCHD_LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  ok "launchd agent loaded ($LAUNCHD_LABEL)"
}

install_service() {
  manager="$(detect_service_manager)"
  case "$manager" in
    systemd) write_systemd_unit ;;
    launchd) write_launchd_plist ;;
    *)
      warn "no per-user service manager detected — skipping service install."
      printf '    Run it manually:\n'
      printf '      cd %s && OMNIGENT_PROXY_PORT=%s OMNIGENT_UPSTREAM_URL=%s node scripts/proxy.mjs\n' \
        "$INSTALL_DIR" "$PROXY_PORT" "$UPSTREAM_URL"
      ;;
  esac
}

verify_install() {
  step "Verifying the injector injects"
  if [ "$VERBOSE" = true ]; then
    (cd "$INSTALL_DIR" && node scripts/verify-install.mjs --verbose)
  else
    (cd "$INSTALL_DIR" && node scripts/verify-install.mjs)
  fi
}

uninstall() {
  step "Removing service"
  case "$(uname -s)" in
    Darwin)
      launchctl bootout "gui/$(id -u)/$LAUNCHD_LABEL" 2>/dev/null || true
      rm -f "$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"
      ;;
    Linux)
      if command -v systemctl >/dev/null 2>&1; then
        systemctl --user disable --now "$SERVICE_NAME.service" 2>/dev/null || true
        systemctl --user daemon-reload 2>/dev/null || true
      fi
      rm -f "$HOME/.config/systemd/user/$SERVICE_NAME.service"
      ;;
  esac
  ok "service removed"
  if [ -d "$INSTALL_DIR" ]; then
    step "Removing $INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
    ok "install directory removed"
  fi
  printf '\n'
  printf 'Your overlay state in %s~/.omnigent-overlays%s was left alone.\n' "$BOLD" "$RESET"
  printf 'Delete it too if you want a truly clean slate.\n'
}

print_next_steps() {
  printf '\n'
  printf '%somnigent-overlays is installed.%s\n\n' "$BOLD" "$RESET"
  printf '  Point your browser at   %shttp://%s:%s%s\n' "$BOLD" "$PROXY_HOST" "$PROXY_PORT" "$RESET"
  printf '  It proxies              %s\n' "$UPSTREAM_URL"
  printf '  Installed in            %s\n' "$INSTALL_DIR"
  printf '  Overlay state           %s/.omnigent-overlays\n\n' "$HOME"
  printf 'Open that URL and use the %s⚙ Overlays%s panel to enable overlays.\n' "$BOLD" "$RESET"
  printf 'Update later with the panel'"'"'s "Sync library", or re-run this installer.\n\n'
  printf '%sIf the page does not load, check that Omnigent is running on %s.%s\n' \
    "$DIM" "$UPSTREAM_URL" "$RESET"
}

main() {
  parse_args "$@"
  init_style
  check_platform

  if [ "$UNINSTALL" = true ]; then
    uninstall
    return
  fi

  ensure_git
  ensure_node
  clone_or_update
  install_deps

  if [ "$VERIFY" = true ]; then
    verify_install
  fi

  if [ "$INSTALL_SERVICE" = true ]; then
    install_service
  fi

  print_next_steps
}

main "$@"
