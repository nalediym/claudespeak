# Changelog

## 0.2.0 — 2026-04-24

- MCP server addon (`bin/mcp-server.ts`) — hybrid mode, runs alongside the
  Stop hook. Exposes 5 tools over stdio: `speak`, `get_feedback_stats`,
  `get_last_analyzer_report`, `tag_feedback`, `list_voices`. Usable from
  Claude Desktop, Cursor, Zed, and `claude mcp add`. See `MCP.md`.
- `package.json` with `@modelcontextprotocol/sdk` as the sole runtime dep.
- `install.sh` now installs `claudespeak-mcp` shim and prints MCP setup
  instructions in its Next steps section.
- Homebrew formula installs `mcp-server.ts` into `libexec` and ships
  `MCP.md` under `share/claudespeak`.

## 0.1.0 — 2026-04-24

Initial public release.

- Stop-hook auto-speak via 6-tier TTS router (say / mlx-Kokoro / edge-tts / OpenAI / ElevenLabs / Cartesia)
- Heuristic summarizer + `<!-- TTS: "..." -->` marker protocol
- `/voice-on`, `/voice-off`, `/speak-last`, `/speak-kill`, `/voice-preview`
- `/speak-feedback good|bad|stats` for explicit tagging
- `/speak-report` analyzer: mines transcripts for implicit dislike signals
- Optional audio ducking (`--duck`, Spotify/Music by default)
- launchd agent for daily analyzer reports
- Installer with `--uninstall`
- Homebrew formula stub
