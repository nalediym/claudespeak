# Enable Conversation Mode

Turn on auto-speak. Every Claude response in this and future sessions will be spoken aloud (summarized to ~240 chars) until `/voice-off` is run.

## Instructions

1. Run: `mkdir -p $CLAUDESPEAK_HOME && touch $CLAUDESPEAK_HOME/conversation-mode`
2. Run: `claudespeak --async "Conversation mode on"` (so the user hears confirmation immediately)
3. Report: "Conversation mode: **on**. Auto-speak will fire after every response. Use `/voice-off` to disable."
