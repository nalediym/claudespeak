#!/usr/bin/env bun
/**
 * claudespeak analyzer — mine auto-speak telemetry + transcripts for dislike
 * signals. Cross-references explicit feedback with implicit signals
 * (interruptions, complaints, voice-off shortly after, repeat requests).
 *
 * Usage:
 *   analyzer.ts                # last 7 days, report to stdout
 *   analyzer.ts --days 14      # custom window
 *   analyzer.ts --save         # also write $CONFIG_DIR/reports/YYYY-MM-DD.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const CFG = process.env.CLAUDESPEAK_HOME
  ? process.env.CLAUDESPEAK_HOME
  : process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "claudespeak")
  : join(HOME, ".config", "claudespeak");
const TELEMETRY = join(CFG, "telemetry.jsonl");
const FEEDBACK = join(CFG, "feedback.jsonl");
const REPORTS = join(CFG, "reports");

interface TelemetryEntry {
  ts?: string;
  session?: string;
  transcript_path?: string;
  assistant_uuid?: string | null;
  summary?: string;
  full_len?: number;
  summary_len?: number;
}

interface FeedbackEntry {
  ts?: string;
  target_ts?: string;
  rating?: "good" | "bad";
  reason?: string;
  summary_preview?: string;
}

interface TranscriptMessage {
  uuid?: string;
  type?: string;
  message?: { content?: unknown };
}

// Signals that suggest a summary wasn't liked.
const NEGATIVE_PATTERNS: Array<[RegExp, string]> = [
  [/\btoo long\b/i, "complained it was too long"],
  [/\btoo short\b/i, "complained it was too short"],
  [/\bwrong\b/i, "called it wrong"],
  [/\bdidn'?t say (that|this)\b/i, "disputed what was said"],
  [/\b(repeat|say again|what did you say|huh\??)\b/i, "asked to repeat"],
  [/\bconfus(ing|ed)\b/i, "said it was confusing"],
  [/\b(stop|shut up|be quiet)\b/i, "asked to stop"],
  [/\btoo (fast|slow|quick)\b/i, "complained about pace"],
  [/\b(that's|thats) not (what|right)\b/i, "said not right"],
  [/\/speak-kill\b/i, "killed speech mid-sentence"],
  [/\/voice-off\b/i, "turned voice off"],
];

const REACTION_WINDOW = 2;

function loadJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      out.push(JSON.parse(l) as T);
    } catch {
      /* skip */
    }
  }
  return out;
}

function parseTs(s: string | undefined): number | null {
  if (!s) return null;
  const n = new Date(s).getTime();
  return Number.isNaN(n) ? null : n;
}

function loadTranscript(path: string): TranscriptMessage[] {
  if (!existsSync(path)) return [];
  const out: TranscriptMessage[] = [];
  try {
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const l = line.trim();
      if (!l) continue;
      try {
        out.push(JSON.parse(l) as TranscriptMessage);
      } catch {
        /* skip */
      }
    }
  } catch {
    return [];
  }
  return out;
}

function userText(msg: TranscriptMessage): string {
  const content = msg.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text as string)
      .join("\n");
  }
  return "";
}

function findReactions(messages: TranscriptMessage[], afterUuid: string | null | undefined): string[] {
  if (!afterUuid) return [];
  const idx = messages.findIndex((m) => m.uuid === afterUuid);
  if (idx < 0) return [];
  const out: string[] = [];
  for (const m of messages.slice(idx + 1)) {
    if (m.type !== "user") continue;
    const t = userText(m);
    if (!t) continue;
    if (t.startsWith("[") || t.startsWith("<")) continue; // skip tool results / reminders
    out.push(t);
    if (out.length >= REACTION_WINDOW) break;
  }
  return out;
}

function scoreReactions(reactions: string[]): Array<[string, string]> {
  const hits: Array<[string, string]> = [];
  for (const text of reactions) {
    for (const [pat, reason] of NEGATIVE_PATTERNS) {
      const m = pat.exec(text);
      if (m) {
        const start = Math.max(0, m.index - 20);
        const end = Math.min(text.length, m.index + m[0].length + 40);
        const excerpt = text.slice(start, end).trim();
        hits.push([reason, excerpt]);
      }
    }
  }
  return hits;
}

interface Finding {
  ts?: string;
  summary?: string;
  reasons: Array<[string, string]>;
}

function buildReport(days: number): string {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const telemetry = loadJsonl<TelemetryEntry>(TELEMETRY);
  const feedback = loadJsonl<FeedbackEntry>(FEEDBACK);

  const recent = telemetry.filter((t) => {
    const n = parseTs(t.ts);
    return n !== null && n >= cutoff;
  });

  const explicitByTarget = new Map<string, FeedbackEntry>();
  for (const f of feedback) if (f.target_ts) explicitByTarget.set(f.target_ts, f);

  const transcriptCache = new Map<string, TranscriptMessage[]>();
  const findings: Finding[] = [];

  for (const entry of recent) {
    const reasons: Array<[string, string]> = [];

    const explicit = entry.ts ? explicitByTarget.get(entry.ts) : undefined;
    if (explicit?.rating === "bad") {
      reasons.push(["explicit bad tag", explicit.reason || "(no reason given)"]);
    }

    const tpath = entry.transcript_path;
    const uuid = entry.assistant_uuid;
    if (tpath && uuid) {
      if (!transcriptCache.has(tpath)) transcriptCache.set(tpath, loadTranscript(tpath));
      const messages = transcriptCache.get(tpath)!;
      const reactions = findReactions(messages, uuid);
      reasons.push(...scoreReactions(reactions));
    }

    if (reasons.length) {
      findings.push({ ts: entry.ts, summary: entry.summary, reasons });
    }
  }

  const total = recent.length;
  const bad = findings.length;
  const explicitGood = feedback.filter((f) => {
    const n = parseTs(f.ts);
    return f.rating === "good" && n !== null && n >= cutoff;
  }).length;
  const explicitBad = feedback.filter((f) => {
    const n = parseTs(f.ts);
    return f.rating === "bad" && n !== null && n >= cutoff;
  }).length;

  const reasonCounts = new Map<string, number>();
  for (const f of findings) {
    for (const [r] of f.reasons) {
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    }
  }

  const lines: string[] = [];
  lines.push(`# claudespeak report — last ${days} days`);
  lines.push(`*Generated ${new Date().toISOString().replace(/\.\d+Z$/, "Z")}*`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Auto-speaks: **${total}**`);
  if (total) {
    lines.push(`- Flagged as problematic: **${bad}** (${((100 * bad) / total).toFixed(0)}% of total)`);
  } else {
    lines.push("- No auto-speaks in window.");
  }
  lines.push(`- Explicit feedback: ${explicitGood} good / ${explicitBad} bad`);
  lines.push("");

  if (reasonCounts.size) {
    lines.push("## Top complaint patterns");
    const sorted = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [reason, count] of sorted) {
      lines.push(`- ${count}× — ${reason}`);
    }
    lines.push("");
  }

  lines.push("## Flagged entries");
  if (findings.length) {
    for (const f of findings.slice(-20)) {
      const summary = (f.summary ?? "").slice(0, 100);
      lines.push(`### ${f.ts}`);
      lines.push(`> ${summary}`);
      for (const [reason, excerpt] of f.reasons) {
        const excerptShort = excerpt.slice(0, 120).replace(/\n/g, " ");
        lines.push(`- **${reason}** — "${excerptShort}"`);
      }
      lines.push("");
    }
  } else {
    lines.push(
      "_None in window. Either things are going well, or you haven't used conversation mode much yet._",
    );
  }

  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  let days = 7;
  let save = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--save") {
      save = true;
    }
  }

  const report = buildReport(days);
  console.log(report);

  if (save) {
    mkdirSync(REPORTS, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const fname = join(REPORTS, `${date}.md`);
    writeFileSync(fname, report);
    console.error(`\n[saved to ${fname}]`);
  }
}

main();
