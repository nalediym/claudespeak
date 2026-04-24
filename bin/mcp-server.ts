#!/usr/bin/env bun
/**
 * claudespeak MCP server (hybrid addon) — exposes 5 tools over stdio so any
 * MCP client (Claude Desktop, Cursor, Zed, `claude mcp add`) can call into
 * the same telemetry + feedback store the Stop hook feeds.
 *
 * Tools:
 *   speak, get_feedback_stats, get_last_analyzer_report, tag_feedback, list_voices
 *
 * Environment:
 *   CLAUDESPEAK_HOME   config dir (default: $XDG_CONFIG_HOME/claudespeak or ~/.config/claudespeak)
 *   CLAUDESPEAK_BIN    path to the claudespeak TTS binary (default: `claudespeak` on PATH)
 */

import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const HOME = homedir();
const CONFIG_DIR = process.env.CLAUDESPEAK_HOME
  ? process.env.CLAUDESPEAK_HOME
  : process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "claudespeak")
  : join(HOME, ".config", "claudespeak");

const TELEMETRY = join(CONFIG_DIR, "telemetry.jsonl");
const FEEDBACK = join(CONFIG_DIR, "feedback.jsonl");
const REPORTS = join(CONFIG_DIR, "reports");
const CLAUDESPEAK_BIN = process.env.CLAUDESPEAK_BIN || "claudespeak";

interface TelemetryEntry {
  ts?: string;
  summary?: string;
  summary_len?: number;
}

interface FeedbackEntry {
  ts: string;
  target_ts?: string;
  rating: "good" | "bad";
  reason: string;
  summary_preview: string;
}

function loadJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      out.push(JSON.parse(l) as T);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

function appendJsonl(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(obj) + "\n");
}

function parseTs(s: string | undefined): number | null {
  if (!s) return null;
  const n = new Date(s).getTime();
  return Number.isNaN(n) ? null : n;
}

// Mirrors bin/claudespeak default_*_voice tables.
const VOICES: Record<"say" | "mlx" | "edge", Record<string, string>> = {
  say: {
    en: "Flo",
    fr: "Sandy",
    es: "Flo",
    ja: "Kyoko",
    zh: "Ting-Ting",
    hi: "Lekha",
    it: "Alice",
    pt: "Luciana",
    de: "Anna",
    ko: "Yuna",
    ar: "Maged",
    ru: "Milena",
  },
  mlx: {
    en: "af_heart",
    fr: "ff_siwis",
    es: "ef_dora",
    ja: "jf_alpha",
    zh: "zf_xiaoxiao",
    hi: "hf_alpha",
    it: "if_sara",
    pt: "pf_dora",
  },
  edge: {
    en: "en-US-AriaNeural",
    fr: "fr-FR-DeniseNeural",
    es: "es-ES-ElviraNeural",
    ja: "ja-JP-NanamiNeural",
    zh: "zh-CN-XiaoxiaoNeural",
    de: "de-DE-KatjaNeural",
    ko: "ko-KR-SunHiNeural",
    pt: "pt-BR-FranciscaNeural",
    it: "it-IT-ElsaNeural",
  },
};

interface StatsResult {
  window_days: number;
  auto_speaks: number;
  feedback_total: number;
  feedback_good: number;
  feedback_bad: number;
  satisfaction_pct: number | null;
  avg_summary_len: number | null;
  all_time: {
    auto_speaks: number;
    feedback_total: number;
  };
  recent_bad: Array<{ summary_preview: string; reason: string }>;
}

function computeStats(days = 7): StatsResult {
  const telemetry = loadJsonl<TelemetryEntry>(TELEMETRY);
  const feedback = loadJsonl<FeedbackEntry>(FEEDBACK);

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = (iso?: string) => {
    const n = parseTs(iso);
    return n !== null && n > cutoff;
  };

  const tel = telemetry.filter((t) => inWindow(t.ts));
  const fb = feedback.filter((f) => inWindow(f.ts));
  const good = fb.filter((f) => f.rating === "good").length;
  const bad = fb.filter((f) => f.rating === "bad").length;
  const totalFb = good + bad;

  const lens = tel.map((t) => t.summary_len ?? 0).filter((n) => n > 0);
  const avgLen = lens.length
    ? lens.reduce((a, b) => a + b, 0) / lens.length
    : null;

  const recentBad = feedback
    .filter((f) => f.rating === "bad")
    .slice(-5)
    .map((f) => ({
      summary_preview: f.summary_preview ?? "",
      reason: f.reason ?? "",
    }));

  return {
    window_days: days,
    auto_speaks: tel.length,
    feedback_total: totalFb,
    feedback_good: good,
    feedback_bad: bad,
    satisfaction_pct: totalFb ? (100 * good) / totalFb : null,
    avg_summary_len: avgLen,
    all_time: {
      auto_speaks: telemetry.length,
      feedback_total: feedback.length,
    },
    recent_bad: recentBad,
  };
}

function latestReport(): { path: string; body: string } | null {
  if (!existsSync(REPORTS)) return null;
  let best: { path: string; mtime: number } | null = null;
  for (const name of readdirSync(REPORTS)) {
    if (!name.endsWith(".md")) continue;
    const p = join(REPORTS, name);
    const m = statSync(p).mtimeMs;
    if (!best || m > best.mtime) best = { path: p, mtime: m };
  }
  if (!best) return null;
  return { path: best.path, body: readFileSync(best.path, "utf-8") };
}

function tagFeedback(
  rating: "good" | "bad",
  reason: string | undefined,
): { tagged: boolean; summary_preview: string; target_ts?: string; message: string } {
  const telemetry = loadJsonl<TelemetryEntry>(TELEMETRY);
  if (telemetry.length === 0) {
    return {
      tagged: false,
      summary_preview: "",
      message:
        "No auto-speak entries to tag. Enable conversation mode (/voice-on) first.",
    };
  }
  const last = telemetry[telemetry.length - 1];
  const entry: FeedbackEntry = {
    ts: new Date().toISOString(),
    target_ts: last.ts,
    rating,
    reason: reason ?? "",
    summary_preview: (last.summary ?? "").slice(0, 80),
  };
  appendJsonl(FEEDBACK, entry);
  return {
    tagged: true,
    summary_preview: entry.summary_preview,
    target_ts: last.ts,
    message: `Tagged ${rating}: ${entry.summary_preview}`,
  };
}

function speakText(
  text: string,
  opts: { async?: boolean; duck?: boolean },
): { spoke: boolean; backend: string; async: boolean; ducked: boolean; error?: string } {
  const args: string[] = [];
  if (opts.async ?? true) args.push("--async");
  if (opts.duck) args.push("--duck");
  args.push(text);
  try {
    const child = spawn(CLAUDESPEAK_BIN, args, {
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    return {
      spoke: true,
      backend: CLAUDESPEAK_BIN,
      async: opts.async ?? true,
      ducked: !!opts.duck,
    };
  } catch (e: any) {
    return {
      spoke: false,
      backend: CLAUDESPEAK_BIN,
      async: opts.async ?? true,
      ducked: !!opts.duck,
      error: String(e?.message ?? e).slice(0, 200),
    };
  }
}

function listVoices(
  backend?: "say" | "mlx" | "edge",
): Record<string, Record<string, string>> {
  if (backend) return { [backend]: VOICES[backend] };
  return VOICES;
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "claudespeak", version: "0.1.0" },
    {
      instructions:
        "Voice layer for Claude Code. The Stop hook auto-speaks summaries; these tools let you speak on demand, read feedback stats, pull the latest analyzer report, tag the last summary good/bad, or list default voices per backend.",
    },
  );

  server.registerTool(
    "speak",
    {
      title: "Speak text",
      description:
        "Speak text aloud via the claudespeak TTS router. Use when you want to read something on demand without going through the Stop hook.",
      inputSchema: {
        text: z.string().min(1).max(2000).describe("Text to speak (<= 2000 chars)"),
        async: z
          .boolean()
          .optional()
          .describe("Run non-blocking (default true)"),
        duck: z
          .boolean()
          .optional()
          .describe("Duck music apps during speech (default false)"),
      },
    },
    async ({ text, async: asyncFlag, duck }) => {
      const result = speakText(text, { async: asyncFlag, duck });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_feedback_stats",
    {
      title: "Rolling 7-day feedback stats",
      description:
        "Return JSON of rolling 7-day claudespeak stats: auto-speak count, good/bad feedback, satisfaction %, average summary length, recent bad tags.",
    },
    async () => {
      const stats = computeStats(7);
      return {
        content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_last_analyzer_report",
    {
      title: "Latest analyzer report",
      description:
        "Return the most recent markdown analyzer report from $CLAUDESPEAK_HOME/reports/. If there are none, explain how to generate one.",
    },
    async () => {
      const report = latestReport();
      if (!report) {
        return {
          content: [
            {
              type: "text",
              text: "No reports yet. Enable /speak-report or the daily launchd agent.",
            },
          ],
        };
      }
      return {
        content: [
          { type: "text", text: `# ${report.path}\n\n${report.body}` },
        ],
      };
    },
  );

  server.registerTool(
    "tag_feedback",
    {
      title: "Tag last auto-speak good/bad",
      description:
        "Append a good/bad feedback entry targeting the most recent auto-speak. Use to self-correct when the spoken summary was wrong or when it landed well.",
      inputSchema: {
        rating: z.enum(["good", "bad"]).describe("Rating for the last summary"),
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Optional short reason, stored verbatim"),
      },
    },
    async ({ rating, reason }) => {
      const result = tagFeedback(rating, reason);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_voices",
    {
      title: "List default voices per backend",
      description:
        "Return claudespeak's per-language default voice tables. Pass `backend` to restrict to one of say|mlx|edge.",
      inputSchema: {
        backend: z
          .enum(["say", "mlx", "edge"])
          .optional()
          .describe("Restrict to one backend"),
      },
    },
    async ({ backend }) => {
      const voices = listVoices(backend);
      return {
        content: [{ type: "text", text: JSON.stringify(voices, null, 2) }],
      };
    },
  );

  return server;
}

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("[claudespeak-mcp] fatal:", e);
    process.exit(1);
  });
}
