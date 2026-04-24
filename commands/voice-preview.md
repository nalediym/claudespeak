# Preview Voices

Speak a sample sentence in each available TTS voice so you can pick one.

**Usage:** `/voice-preview [backend]` — backend defaults to `mlx` (Kokoro neural voices).

## Instructions

1. Parse argument — accept `say`, `mlx`, or `edge`. Default: `mlx`.
2. Sample sentence: `"This is a sample of the voice named <voice>. You can set it as your default."` (swap `<voice>` per voice)
3. For each voice in the chosen backend, speak synchronously (not async), one after another:
   - **mlx (Kokoro):** iterate `af_heart`, `af_bella`, `am_adam`, `bf_emma`, `bm_george` via `claudespeak --backend mlx -v <voice>`
   - **say (macOS):** iterate `Flo`, `Samantha`, `Alex`, `Zarvox` via `claudespeak --backend say -v <voice>`
   - **edge:** iterate `en-US-AriaNeural`, `en-US-GuyNeural`, `en-GB-SoniaNeural` via `claudespeak --backend edge -v <voice>`
4. After each voice plays, print `Played: <voice>` so the user can pair a name to what they just heard.
5. Report which voices were previewed and how to set a default: `echo '<voice>' > $CLAUDESPEAK_HOME/<backend>-voice`
