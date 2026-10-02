import { createClient } from "@supabase/supabase-js";

function clean(value: string | undefined) {
  return (value || "").trim().replace(/^['\"]|['\"]$/g, "");
}

function validProjectUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /\.supabase\.co$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function getSupabaseServerConfig() {
  const url = clean(process.env.SUPABASE_URL) || clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Prefer the current sb_secret_ key. Keep legacy service_role only as fallback.
  const secret = clean(process.env.SUPABASE_SECRET_KEY);
  const legacy = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const key = secret || legacy;
  const keySource = secret ? "secret" : legacy ? "service_role" : "missing";
  const urlValid = Boolean(url && validProjectUrl(url));
  const keyLooksValid = Boolean(
    key && (
      (keySource === "secret" && key.startsWith("sb_secret_")) ||
      (keySource === "service_role" && (key.startsWith("eyJ") || key.startsWith("sb_secret_")))
    )
  );
  return {
    url,
    key,
    configured: Boolean(url && key && urlValid && keyLooksValid),
    hasUrl: Boolean(url),
    hasServerKey: Boolean(key),
    urlValid,
    keyLooksValid,
    keySource,
  } as const;
}

export function getSupabaseAdmin() {
  const config = getSupabaseServerConfig();
  if (!config.configured) return null;
  try {
    return createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  } catch {
    return null;
  }
}

export function isSupabaseConfigured() {
  return getSupabaseServerConfig().configured;
}
