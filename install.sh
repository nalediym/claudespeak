#!/usr/bin/env bash
# claudespeak installer — wires the binaries, hook, and slash commands into
# your Claude Code config. Non-destructive: backs up any existing files.
#
# Usage:
#   ./install.sh                    # install to ~/.local/bin + ~/.claude
#   PREFIX=/opt/homebrew ./install.sh  # override install prefix
#   ./install.sh --uninstall        # remove everything this script installed

set -euo pipefail

PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
HOOK_DIR="$CLAUDE_DIR/hooks"
CMD_DIR="$CLAUDE_DIR/commands"
CONFIG_DIR="${CLAUDESPEAK_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/claudespeak}"
STATE_DIR="$HOME/.local/state/claudespeak"

SRC="$(cd "$(dirname "$0")" && pwd)"

say() { printf "==> %s\n" "$*"; }

check_deps() {
  local missing=()
  command -v bun >/dev/null || missing+=(bun)
  command -v afplay >/dev/null || missing+=(afplay)
  command -v say >/dev/null || missing+=(say)
  if ((${#missing[@]})); then
    echo "Missing required tools: ${missing[*]}" >&2
    echo "Install bun: https://bun.sh  (afplay/say are built-in to macOS)" >&2
    exit 1
  fi
}

install_binaries() {
  mkdir -p "$BIN_DIR"
  cp "$SRC/bin/claudespeak" "$BIN_DIR/claudespeak"
  chmod +x "$BIN_DIR/claudespeak"

  # TS CLIs are wrapped as shell shims that exec `bun <path>`.
  cp "$SRC/bin/feedback.ts"   "$BIN_DIR/.claudespeak-feedback.ts"
  cp "$SRC/bin/analyzer.ts"   "$BIN_DIR/.claudespeak-analyze.ts"
  cp "$SRC/bin/mcp-server.ts" "$BIN_DIR/.claudespeak-mcp.ts"

  cat >"$BIN_DIR/claudespeak-feedback" <<EOF
#!/usr/bin/env bash
exec bun "$BIN_DIR/.claudespeak-feedback.ts" "\$@"
EOF
  chmod +x "$BIN_DIR/claudespeak-feedback"

  cat >"$BIN_DIR/claudespeak-analyze" <<EOF
#!/usr/bin/env bash
exec bun "$BIN_DIR/.claudespeak-analyze.ts" "\$@"
EOF
  chmod +x "$BIN_DIR/claudespeak-analyze"

  cat >"$BIN_DIR/claudespeak-mcp" <<EOF
#!/usr/bin/env bash
exec bun "$BIN_DIR/.claudespeak-mcp.ts" "\$@"
EOF
  chmod +x "$BIN_DIR/claudespeak-mcp"
}

install_hook() {
  mkdir -p "$HOOK_DIR"
  cp "$SRC/hooks/auto-speak.ts" "$HOOK_DIR/claudespeak-auto-speak.ts"
}

install_commands() {
  mkdir -p "$CMD_DIR"
  for f in "$SRC"/commands/*.md; do
    cp "$f" "$CMD_DIR/"
  done
}

install_launchd() {
  local plist="$HOME/Library/LaunchAgents/com.claudespeak.report.plist"
  mkdir -p "$(dirname "$plist")" "$STATE_DIR"
  sed "s|@HOME@|$HOME|g; s|@PREFIX@|$PREFIX|g" \
    "$SRC/launchd/com.claudespeak.report.plist.template" >"$plist"
  echo "LaunchAgent written to $plist (not auto-loaded — run 'launchctl load' to enable)"
}

print_next_steps() {
  cat <<EOF

Installed:
  $BIN_DIR/claudespeak
  $BIN_DIR/claudespeak-feedback
  $BIN_DIR/claudespeak-analyze
  $BIN_DIR/claudespeak-mcp
  $HOOK_DIR/claudespeak-auto-speak.ts
  $CMD_DIR/{voice-on,voice-off,speak-*,voice-preview}.md

Next steps:
  1. Ensure $BIN_DIR is on your PATH
  2. Add this to ~/.claude/settings.json under hooks.Stop:
         { "hooks": [{ "type": "command",
                       "command": "bun $HOOK_DIR/claudespeak-auto-speak.ts",
                       "timeout": 5 }] }
  3. (Optional) Enable daily analyzer cron:
         launchctl load ~/Library/LaunchAgents/com.claudespeak.report.plist
  4. (Optional) Install neural TTS:  uv pip install edge-tts
                                      uv tool install mlx-audio
  5. In Claude Code: /voice-on

MCP server (hybrid mode, optional):
  Register the MCP addon to call speak / stats / reports / tag / voices
  directly from any MCP client (Claude Desktop, Cursor, Zed, claude):

      claude mcp add claudespeak bun $BIN_DIR/.claudespeak-mcp.ts

  See MCP.md for the full tool reference and when to prefer MCP over the
  Stop hook.
EOF
}

uninstall() {
  rm -f "$BIN_DIR"/{claudespeak,claudespeak-feedback,claudespeak-analyze,claudespeak-mcp} \
        "$BIN_DIR"/.claudespeak-*.ts
  rm -f "$HOOK_DIR/claudespeak-auto-speak.ts"
  for cmd in voice-on voice-off speak-last speak-kill speak-feedback speak-report voice-preview; do
    rm -f "$CMD_DIR/$cmd.md"
  done
  launchctl unload "$HOME/Library/LaunchAgents/com.claudespeak.report.plist" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.claudespeak.report.plist"
  echo "Uninstalled. Config + telemetry in $CONFIG_DIR left intact — delete manually if desired."
}

case "${1:-install}" in
  --uninstall|uninstall)
    uninstall
    ;;
  *)
    check_deps
    say "Installing claudespeak to $BIN_DIR"
    install_binaries
    say "Installing hook to $HOOK_DIR"
    install_hook
    say "Installing slash commands to $CMD_DIR"
    install_commands
    say "Installing LaunchAgent"
    install_launchd
    print_next_steps
    ;;
esac
