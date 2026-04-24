#!/usr/bin/env bun
/**
 * claudespeak feedback CLI — tag auto-speak entries good/bad, show stats.
 *
 * Usage:
 *   feedback.ts tag good [reason...]
 *   feedback.ts tag bad  [reason...]
 *   feedback.ts stats
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const CONFIG_DIR = process.env.CLAUDESPEAK_HOME
  ? process.env.CLAUDESPEAK_HOME
  : process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "claudespeak")
  : join(HOME, ".config", "claudespeak");

const TELEMETRY = join(CONFIG_DIR, "telemetry.jsonl");
const FEEDBACK = join(CONFIG_DIR, "feedback.jsonl");

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

function cmdTag(rating: string, reason: string): void {
  if (rating !== "good" && rating !== "bad") {
    console.log(`Error: rating must be 'good' or 'bad' (got ${JSON.stringify(rating)})`);
    process.exit(1);
  }

  const telemetry = loadJsonl<TelemetryEntry>(TELEMETRY);
  if (telemetry.length === 0) {
    console.log("No auto-speak entries to tag. Enable conversation mode first.");
    return;
  }

  const last = telemetry[telemetry.length - 1];
  const entry: FeedbackEntry = {
    ts: new Date().toISOString(),
    target_ts: last.ts,
    rating: rating as "good" | "bad",
    reason,
    summary_preview: (last.summary ?? "").slice(0, 80),
  };
  appendJsonl(FEEDBACK, entry);

  console.log(`Tagged ${rating}: ${entry.summary_preview}`);
  if (reason) console.log(`Reason: ${reason}`);
}

function cmdStats(): void {
  const telemetry = loadJsonl<TelemetryEntry>(TELEMETRY);
  const feedback = loadJsonl<FeedbackEntry>(FEEDBACK);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const inLastWeek = (iso?: string) => {
    const n = parseTs(iso);
    return n !== null && n > weekAgo;
  };

  const tel7 = telemetry.filter((t) => inLastWeek(t.ts));
  const fb7 = feedback.filter((f) => inLastWeek(f.ts));
  const good = fb7.filter((f) => f.rating === "good").length;
  const bad = fb7.filter((f) => f.rating === "bad").length;
  const totalFb = good + bad;

  console.log("=== claudespeak telemetry (last 7 days) ===");
  console.log(`Auto-speaks:       ${tel7.length}`);
  console.log(`Feedback entries:  ${totalFb} (${good} good / ${bad} bad)`);
  if (totalFb) {
    const pct = (100 * good) / totalFb;
    console.log(`Satisfaction:      ${pct.toFixed(0)}% good`);
  }

  const lens = tel7.map((t) => t.summary_len ?? 0).filter((n) => n > 0);
  if (lens.length) {
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    console.log(`Avg summary len:   ${avg.toFixed(0)} chars`);
  }

  console.log();
  console.log("=== all-time ===");
  console.log(`Total auto-speaks: ${telemetry.length}`);
  console.log(`Total feedback:    ${feedback.length}`);

  const badEntries = feedback.filter((f) => f.rating === "bad");
  if (badEntries.length) {
    console.log();
    console.log("=== recent bad tags (up to 5) ===");
    for (const f of badEntries.slice(-5)) {
      const preview = f.summary_preview ?? "";
      const reason = f.reason ?? "";
      let line = `  - ${preview}`;
      if (reason) line += `  [reason: ${reason}]`;
      console.log(line);
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: feedback.ts tag good|bad [reason...] | feedback.ts stats");
    process.exit(1);
  }

  const cmd = args[0];
  if (cmd === "tag") {
    if (args.length < 2) {
      console.log("Usage: feedback.ts tag good|bad [reason...]");
      process.exit(1);
    }
    cmdTag(args[1], args.slice(2).join(" "));
  } else if (cmd === "stats") {
    cmdStats();
  } else {
    console.log(`Unknown command: ${cmd}`);
    process.exit(1);
  }
}

main();
