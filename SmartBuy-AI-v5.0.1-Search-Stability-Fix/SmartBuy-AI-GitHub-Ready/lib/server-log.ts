import { getSupabaseAdmin } from "@/lib/supabase-server";

type Level = "info" | "warn" | "error";
const SECRETISH = /token|secret|password|authorization|cookie|key$/i;

function safeMeta(input: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, 24)) {
    if (SECRETISH.test(key)) { out[key] = "[redacted]"; continue; }
    if (typeof value === "string") out[key] = value.slice(0, 500);
    else if (["number", "boolean"].includes(typeof value) || value == null) out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 20);
    else out[key] = "[object]";
  }
  return out;
}

export async function serverLog(event: string, level: Level = "info", meta: Record<string, unknown> = {}) {
  const clean = safeMeta(meta);
  const message = `[SmartBuy:${level}] ${event}`;
  if (level === "error") console.error(message, clean); else if (level === "warn") console.warn(message, clean); else console.info(message, clean);
  if (process.env.SMARTBUY_DB_LOGS === "false") return;
  const db = getSupabaseAdmin(); if (!db) return;
  try { await db.from("smartbuy_server_events").insert({ event, level, meta: clean }); } catch {}
}
