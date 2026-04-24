# Example: project CLAUDE.md snippet for claudespeak

Drop this section into your project's `CLAUDE.md` (or your global `~/.claude/CLAUDE.md`) to get tighter, more intentional spoken summaries.

```markdown
## Voice output (claudespeak conversation mode)

When conversation mode is on, end each response with a TTS marker:

    <!-- TTS: "one concrete spoken summary, <= 200 chars, action-first" -->

Rules:
- One sentence, ≤200 chars.
- Lead with the outcome or the blocker, not the narration.
- If the response is a question to the user, put the question in the marker.
- Skip the marker entirely for purely conversational replies where speaking adds nothing.
```

When the Stop hook detects a marker it uses the marked text verbatim. Without a marker it falls back to the heuristic summary.

Run `claudespeak-analyze --days 7` weekly to see which mode produces fewer dislike signals — the telemetry tags every entry with `source: "marker"` or `source: "heuristic"`.
