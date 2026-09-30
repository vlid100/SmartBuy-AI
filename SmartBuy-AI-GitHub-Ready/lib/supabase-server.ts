import { createClient } from "@supabase/supabase-js";

export function getSupabaseServerConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  return {
    url,
    key,
    configured: Boolean(url && key),
    hasUrl: Boolean(url),
    hasServerKey: Boolean(key),
    keySource: process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : process.env.SUPABASE_SECRET_KEY ? "secret" : "missing",
  } as const;
}

export function getSupabaseAdmin() {
  const config = getSupabaseServerConfig();
  if (!config.configured) return null;
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseConfigured() {
  return getSupabaseServerConfig().configured;
}
