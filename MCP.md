# claudespeak MCP server (hybrid mode)

The Stop hook is the primary interface: after every Claude Code response, it extracts a spoken summary and hands it to `claudespeak`. That keeps running regardless.

The MCP server is an **addon**. It runs alongside the hook and exposes the same telemetry + feedback store through tools any MCP client can call on demand: Claude Desktop, Cursor, Zed, or Claude Code itself via `claude mcp add`.

## When to use which

| Situation | Use |
|-----------|-----|
| You want every Claude response read aloud automatically | Stop hook (`/voice-on`) |
| You want Claude to read one specific thing on demand | MCP `speak` |
| You want Claude to self-correct based on your feedback history | MCP `get_feedback_stats` + `get_last_analyzer_report` |
| You want Claude to propose its own feedback tag | MCP `tag_feedback` |
| You're in a non-Claude-Code MCP client (Desktop, Cursor, Zed) | MCP (the hook doesn't run there) |

Both can be active at the same time. They share `$CLAUDESPEAK_HOME/telemetry.jsonl` and `feedback.jsonl`.

## Setup

After `./install.sh` or `brew install claudespeak`:

```bash
claude mcp add claudespeak bun ~/.local/bin/.claudespeak-mcp.ts
```

For Claude Desktop / Cursor / Zed, add to the client's MCP config:

```json
{
  "mcpServers": {
    "claudespeak": {
      "command": "bun",
      "args": ["/absolute/path/to/bin/mcp-server.ts"]
    }
  }
}
```

Transport is **stdio only**.

## Tools

### `speak`

Speak text aloud via the `claudespeak` TTS router.

Input:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `text` | string (1–2000 chars) | — | What to say |
| `async` | boolean | `true` | Non-blocking spawn |
| `duck` | boolean | `false` | Lower Spotify/Music volume during speech |

Returns JSON with `spoke`, `backend`, `async`, `ducked`, and `error` if spawn failed. Honours `$CLAUDESPEAK_BIN` (falls back to `claudespeak` on PATH).

### `get_feedback_stats`

No arguments. Returns JSON of rolling 7-day stats: auto-speak count, good/bad feedback tallies, satisfaction %, avg summary length, all-time totals, and up to 5 most-recent bad tags. Mirrors `claudespeak-feedback stats`.

Use this when Claude should decide whether to change behaviour — e.g. *"I notice 3 of your last 5 summaries were tagged bad for being too long; want me to aim shorter?"*

### `get_last_analyzer_report`

No arguments. Returns the most recent markdown report from `$CLAUDESPEAK_HOME/reports/`. If none exists yet, returns:

> No reports yet. Enable /speak-report or the daily launchd agent.

### `tag_feedback`

Tag the most recent auto-speak entry good or bad. Mirrors `claudespeak-feedback tag`.

Input:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `rating` | `"good"` or `"bad"` | — | Verdict on last summary |
| `reason` | string (≤500) | — | Optional short reason |

Returns JSON with `tagged`, `summary_preview`, `target_ts`, `message`.

### `list_voices`

Return the default voice tables per backend. Mirrors the bash tables in `bin/claudespeak`.

Input:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `backend` | `"say"` \| `"mlx"` \| `"edge"` | all three | Restrict output |

Returns `{ <backend>: { <lang>: <voice> } }`.

## Environment

Same waterfall as every other claudespeak binary:

1. `$CLAUDESPEAK_HOME`
2. `$XDG_CONFIG_HOME/claudespeak`
3. `$HOME/.config/claudespeak`

And `$CLAUDESPEAK_BIN` overrides the TTS binary path for `speak`.

## Design notes

- stdio transport only — simplest, works with every MCP client and with `claude mcp add`.
- The MCP server does **not** write telemetry. Only the Stop hook does. The MCP server reads telemetry and writes feedback, matching the existing bash/TS CLI split.
- Tool return shape is always a single text block with JSON (or markdown, for the report). Clients that render JSON nicely will; the rest get readable text.
