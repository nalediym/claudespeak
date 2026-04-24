# Record Speak Feedback

Tag the most recent auto-spoken summary with good/bad feedback so you can track quality over time.

**Usage:**
- `/speak-feedback good` — mark last auto-speak as good
- `/speak-feedback bad [reason]` — mark last as bad, optional reason
- `/speak-feedback stats` — show rolling stats (good/bad count, last 7 days)

## Instructions

1. Parse the argument — if first word is `stats`, run: `bun claudespeak-feedback stats`
2. Otherwise run: `bun claudespeak-feedback tag "<rating>" "<optional reason>"` — rating is `good` or `bad`, reason is the rest of the arguments
3. Report the tool's stdout verbatim
