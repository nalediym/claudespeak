# Changelog

## 0.1.0 — unreleased

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
