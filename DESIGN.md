# claudespeak design notes

## TTS marker protocol

By default, claudespeak heuristically summarizes the last assistant message to fit 240 chars. That's fast but sometimes picks the wrong sentence.

You can override the summary by asking Claude to embed a spoken line in its response using an HTML comment marker:

```
<!-- TTS: "Deploy complete. Three tests failing on the staging branch — want me to start a bisect?" -->
```

When the Stop hook finds this marker, it uses the quoted text verbatim instead of summarizing. The marker is an HTML comment, so it doesn't render in most viewers, but it stays readable in raw transcripts.

### Suggesting the marker to Claude

Add to your `CLAUDE.md` or a project-level hint:

> When conversation mode is on, end each response with `<!-- TTS: "..." -->` where the quoted text is ≤200 chars and captures the single most important thing I should hear. Favor action items and blockers over narration.

Claude learns the pattern quickly and the marker-summary becomes the spoken feed while the written response stays as rich as you want.

Telemetry labels each entry with `source: "marker"` or `source: "heuristic"` so the analyzer can tell you which mode produced better feedback over time.

## Audio ducking

`--duck` lowers the volume of configured apps (default: Spotify, Music) by a configured delta (default: 40) while speaking, and restores on exit — even if the process is killed.

Tune with:

- `CLAUDESPEAK_DUCK_APPS="Spotify,Music,Podcasts,Arc"` — comma-separated
- `CLAUDESPEAK_DUCK_DELTA=30` — volume units to drop (0–100)

Apps that aren't running are silently skipped. AppleScript calls are wrapped in `try` blocks so a missing app doesn't break the speak flow.

## Why two TTS modes

- **Heuristic summarizer** for users who don't want to think about it — any existing response gets a reasonable spoken line.
- **TTS marker** for users who want the spoken feed tightly designed — Claude picks the right line.

The telemetry + analyzer loop lets you A/B compare them over a week and pick.
