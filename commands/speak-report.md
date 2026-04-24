# Speak Analyzer Report

Cross-reference auto-speak telemetry with transcripts to find what you didn't like. Detects explicit bad-tags, interrupted speech, complaints ("too long", "repeat", "wrong"), and voice-off events following a spoken response.

**Usage:**
- `/speak-report` — last 7 days to stdout
- `/speak-report 14` — custom window in days
- `/speak-report save` — also write to `$CLAUDESPEAK_HOME/reports/YYYY-MM-DD.md`

## Instructions

1. Parse argument:
   - If it's a number, pass as `--days N`
   - If it's `save`, pass `--save`
   - Default: no args (7 days, stdout only)
2. Run: `bun claudespeak-analyze [args]`
3. Print the stdout verbatim
