class Claudespeak < Formula
  desc "Voice hook for Claude Code that learns when to shut up"
  homepage "https://github.com/nalediym/claudespeak"
  url "https://github.com/nalediym/claudespeak/archive/refs/tags/v0.2.0.tar.gz"
  sha256 "REPLACE_WITH_SHA"
  license "MIT"

  depends_on "bun"
  depends_on :macos

  def install
    bin.install "bin/claudespeak"

    libexec.install "bin/feedback.ts"
    libexec.install "bin/analyzer.ts"
    libexec.install "bin/mcp-server.ts"
    libexec.install "hooks/auto-speak.ts"
    libexec.install "package.json"

    (bin/"claudespeak-feedback").write <<~SH
      #!/bin/bash
      exec bun "#{libexec}/feedback.ts" "$@"
    SH
    (bin/"claudespeak-analyze").write <<~SH
      #!/bin/bash
      exec bun "#{libexec}/analyzer.ts" "$@"
    SH
    (bin/"claudespeak-mcp").write <<~SH
      #!/bin/bash
      exec bun "#{libexec}/mcp-server.ts" "$@"
    SH
    chmod 0755, bin/"claudespeak-feedback"
    chmod 0755, bin/"claudespeak-analyze"
    chmod 0755, bin/"claudespeak-mcp"

    (share/"claudespeak").install "commands", "launchd", "examples",
                                  "DESIGN.md", "MCP.md"
  end

  def caveats
    <<~EOS
      To enable the Stop hook in Claude Code, add this to ~/.claude/settings.json:

          "hooks": {
            "Stop": [{
              "hooks": [{
                "type": "command",
                "command": "bun #{libexec}/auto-speak.ts",
                "timeout": 5
              }]
            }]
          }

      Copy slash commands:
          cp #{share}/claudespeak/commands/*.md ~/.claude/commands/

      Enable the daily analyzer cron:
          cp #{share}/claudespeak/launchd/com.claudespeak.report.plist.template \\
             ~/Library/LaunchAgents/com.claudespeak.report.plist
          launchctl load ~/Library/LaunchAgents/com.claudespeak.report.plist

      In Claude Code, run:  /voice-on

      MCP server (hybrid mode, optional):
          claude mcp add claudespeak bun #{libexec}/mcp-server.ts

      The MCP addon exposes speak / get_feedback_stats /
      get_last_analyzer_report / tag_feedback / list_voices over stdio.
      See #{share}/claudespeak/MCP.md for details.
    EOS
  end

  test do
    assert_match "claudespeak", shell_output("#{bin}/claudespeak --help")
  end
end
