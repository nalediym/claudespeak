# Speak Last Response

Re-speak the most recent auto-spoken summary from telemetry (or the last assistant message if telemetry is empty).

## Instructions

1. Check if `$CLAUDESPEAK_HOME/telemetry.jsonl` exists and has entries:
   - If yes, read the last line, extract `summary` field, call `claudespeak --async "<summary>"`
   - If no, read the current session transcript (look in `~/.claude/projects/` for the newest `.jsonl`), extract the last assistant message text, summarize to 240 chars, speak it
2. Report: `Replayed: <summary>` (truncate display to 100 chars)
