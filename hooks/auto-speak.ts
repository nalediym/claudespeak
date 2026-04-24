#!/usr/bin/env bun
/**
 * Claude Code Stop hook — auto-speak the last assistant message when
 * conversation mode is on. Always exits 0 so it can never break a turn.
 *
 * Environment:
 *   CLAUDESPEAK_HOME   config dir (default: $XDG_CONFIG_HOME/claudespeak or ~/.config/claudespeak)
 *   CLAUDESPEAK_BIN    path to the claudespeak TTS binary (default: `claudespeak` on PATH)
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

const HOME = homedir();
const CONFIG_DIR = process.env.CLAUDESPEAK_HOME
  ? process.env.CLAUDESPEAK_HOME
  : process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "claudespeak")
  : join(HOME, ".config", "claudespeak");

const FLAG = join(CONFIG_DIR, "conversation-mode");
const TELEMETRY = join(CONFIG_DIR, "telemetry.jsonl");
const CLAUDESPEAK_BIN = process.env.CLAUDESPEAK_BIN || "claudespeak";
const MAX_CHARS = 240;

// Claude may embed explicit TTS text as `<!-- TTS: "..." -->` in responses.
// When present, this wins over the heuristic summary.
const TTS_MARKER = /<!--\s*TTS:\s*"((?:[^"\\]|\\.)*)"\s*-->/;

interface StopHookInput {
  session_id?: string;
  transcript_path?: string;
  stop_hook_active?: boolean;
}

interface TelemetryEntry {
  ts: string;
  session: string;
  transcript_path: string;
  assistant_uuid: string | null;
  summary: string;
  source: "marker" | "heuristic";
  full_len: number;
  summary_len: number;
  spoke?: boolean;
  error?: string;
}

function logTelemetry(entry: TelemetryEntry): void {
  try {
    mkdirSync(dirname(TELEMETRY), { recursive: true });
    appendFileSync(TELEMETRY, JSON.stringify(entry) + "\n");
  } catch {
    /* swallow — hook must never fail */
  }
}

function readLastAssistant(transcriptPath: string): { text: string | null; uuid: string | null } {
  let raw: string;
  try {
    raw = readFileSync(transcriptPath, "utf-8");
  } catch {
    return { text: null, uuid: null };
  }

  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "assistant") continue;
    const content = obj.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text as string)
      .join("\n")
      .trim();
    if (text) return { text, uuid: obj.uuid ?? null };
  }
  return { text: null, uuid: null };
}

function summarize(text: string, limit: number = MAX_CHARS): string {
  let t = text.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/^[\s>*#-]+/gm, "");
  t = t.replace(/[`*_~]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";

  const sentences = t.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    if (!out) out = s;
    else if (out.length + 1 + s.length <= limit) out = out + " " + s;
    else break;
  }
  if (out.length > limit) out = out.slice(0, limit - 3).trimEnd() + "...";
  return out;
}

function extractSpoken(text: string): { summary: string; source: "marker" | "heuristic" } {
  const m = TTS_MARKER.exec(text);
  if (m && m[1]) {
    const marker = m[1].replace(/\\"/g, '"').slice(0, MAX_CHARS);
    if (marker.trim()) return { summary: marker, source: "marker" };
  }
  return { summary: summarize(text), source: "heuristic" };
}

async function main() {
  if (!existsSync(FLAG)) return;

  const raw = await Bun.stdin.text().catch(() => "");
  let payload: StopHookInput = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return;
  }

  if (payload.stop_hook_active) return;

  const transcriptPath = payload.transcript_path;
  const sessionId = payload.session_id ?? "";
  if (!transcriptPath) return;

  const { text, uuid } = readLastAssistant(transcriptPath);
  if (!text) return;

  const { summary, source } = extractSpoken(text);
  if (!summary) return;

  const entry: TelemetryEntry = {
    ts: new Date().toISOString(),
    session: sessionId,
    transcript_path: transcriptPath,
    assistant_uuid: uuid,
    summary,
    source,
    full_len: text.length,
    summary_len: summary.length,
  };

  try {
    const child = spawn(CLAUDESPEAK_BIN, ["--async", summary], {
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    entry.spoke = true;
  } catch (e: any) {
    entry.spoke = false;
    entry.error = String(e?.message ?? e).slice(0, 200);
  }

  logTelemetry(entry);
}

main().catch(() => {}).finally(() => process.exit(0));
