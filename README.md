# claudespeak

*The voice hook that learns when to shut up.*

A voice layer for [Claude Code](https://docs.claude.com/claude-code) on macOS. Every response gets spoken aloud. Every spoken response gets scored. Every week you get a report of which summaries were too long, which got interrupted, which made you turn voice off — so the tool gets quieter in the places where it was annoying.

## The pitch

If you want full two-way voice for Claude Code, use [`voicemode`](https://github.com/mbailey/voicemode). It's the best in its lane.

claudespeak is a narrower tool for a specific kind of user:

- **You ramble when you think.** You want voice output so you can hear outcomes without looking at the terminal.
- **But you don't want an assistant that yaps over you.** Generic TTS reads everything; you want it to learn when to be quiet.
- **You'd rather see a weekly honesty report** about your own voice setup than tweak 40 settings manually.

The **analyzer** is the feature. It mines your Claude Code transcripts for implicit dislike signals — interrupted speech, "repeat that", `/voice-off` within 2 turns, explicit `/speak-feedback bad` tags — and tells you which summaries didn't land. No other Claude Code voice tool closes this loop.

## Install

macOS, Apple Silicon recommended. Requires [bun](https://bun.sh) (`brew install bun`).

```bash
git clone https://github.com/nalediym/claudespeak.git
cd claudespeak
./install.sh
```

Then in Claude Code:

```
/voice-on
```

Run `claudespeak --list-backends` to see which TTS engines are available. macOS `say` works out of the box; `mlx-audio + Kokoro` gives neural offline voices (`uv tool install mlx-audio`); `edge-tts` gives 300+ online voices (`uv pip install edge-tts`).

## What it does

**Stop hook:** after every Claude Code response, extract a ≤240-char spoken summary, play it via your preferred TTS backend, log to telemetry.

**Feedback loop:**

- `/speak-feedback good` / `/speak-feedback bad [reason]` — tag the last summary
- `/speak-feedback stats` — rolling 7-day satisfaction %, avg summary length

**Analyzer:**

- `/speak-report` — cross-reference telemetry with transcripts, surface dislike signals
- Detects: interrupted speech, "too long / too short / wrong / repeat / confusing", `/voice-off` within 2 turns, explicit bad tags
- Daily launchd cron for a persistent weekly report

**Controls:**

- `/voice-on` / `/voice-off` — toggle per session
- `/speak-last` — replay the last summary from cache
- `/speak-kill` — interrupt in-flight speech
- `/voice-preview [say|mlx|edge]` — A/B voices before picking

**TTS markers (optional):** embed `<!-- TTS: "exactly this line" -->` in a response and the hook will use it verbatim instead of summarizing. See [DESIGN.md](./DESIGN.md).

**Audio ducking (optional):** `--duck` lowers Spotify/Music volume during speech, restores after.

## MCP server (hybrid mode)

An optional MCP server addon (`bin/mcp-server.ts`) runs alongside the Stop hook and exposes `speak`, `get_feedback_stats`, `get_last_analyzer_report`, `tag_feedback`, and `list_voices` to any MCP client (Claude Desktop, Cursor, Zed, or Claude Code itself). Register it with `claude mcp add claudespeak bun ~/.local/bin/.claudespeak-mcp.ts` and see [MCP.md](./MCP.md) for the tool reference and when to prefer MCP over the hook.

## Compared to other Claude Code voice tools (April 2026)

| | auto-speak | summarize | telemetry | analyzer | kill | preview | multi-backend | cross-platform |
|---|---|---|---|---|---|---|---|---|
| voicemode | ✓ | | tech timing | | ✓ | | ✓ | ✓ |
| ktaletsk/claude-code-tts | ✓ | ✓ (marker) | | | | | Kokoro | mac |
| ybouhjira/claude-code-tts | ✓ | | | | | | OpenAI | mac |
| LAURA-agent/Claude-to-Speech | ✓ | ✓ (marker) | | | | | ElevenLabs | mac |
| **claudespeak** | **✓** | **✓ (both)** | **✓ user-signal** | **✓** | **✓** | **✓** | **✓ 6-tier** | **mac** |

The analyzer column is the only one where we're alone.

## Config

Config lives at `$CLAUDESPEAK_HOME` (default `~/.config/claudespeak/`).

| File | Purpose |
|------|---------|
| `conversation-mode` | Touch this file to enable auto-speak; remove to disable (the `/voice-on` and `/voice-off` commands do it for you) |
| `backend` | Preferred TTS backend (`auto`, `say`, `mlx`, `edge`, `openai`, `elevenlabs`, `cartesia`) |
| `mlx-voice` / `say-voice` / `edge-voice` | Per-backend default voice |
| `oai-key` / `11-key` / `cart-key` | Cloud API keys (or use env vars) |
| `telemetry.jsonl` | Every auto-speak event (append-only) |
| `feedback.jsonl` | Every explicit good/bad tag (append-only) |
| `reports/YYYY-MM-DD.md` | Daily analyzer output (when cron is enabled) |

## Uninstall

```bash
./install.sh --uninstall
```

Telemetry + feedback files stay put unless you `rm -rf $CLAUDESPEAK_HOME`.

## License

MIT. See [LICENSE](./LICENSE).

## Acknowledgments

Feature inspiration from the Claude Code voice ecosystem:

- [mbailey/voicemode](https://github.com/mbailey/voicemode) — full two-way voice, the category leader; the tier-ladder pattern
- [ktaletsk/claude-code-tts](https://github.com/ktaletsk/claude-code-tts) — audio ducking idea, marker-based summarization
- [LAURA-agent/Claude-to-Speech](https://github.com/LAURA-agent/Claude-to-Speech) — marker protocol
- [cm-maple7/claude-voice-skill](https://github.com/cm-maple7/claude-voice-skill) — keychain storage pattern (planned)

claudespeak's contribution is the feedback loop: the telemetry + analyzer that learns when it's annoying you.
