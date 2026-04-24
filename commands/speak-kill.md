# Kill In-flight Speech

Stop whatever is currently being spoken. Crude barge-in — kills `afplay`, `say`, and `mlx_audio` processes.

## Instructions

1. Run: `pkill -f afplay 2>/dev/null; pkill -f "^say " 2>/dev/null; pkill -f mlx_audio 2>/dev/null; true`
2. Report: "Speech killed." (don't speak this — audio is being stopped)
