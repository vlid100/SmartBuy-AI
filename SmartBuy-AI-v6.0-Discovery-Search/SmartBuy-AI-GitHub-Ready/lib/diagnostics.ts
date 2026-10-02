import type { DiagnosticCheck, DiagnosticsResponse, SourceSearchStatus } from "@/lib/types";
import { getSupabaseAdmin, getSupabaseServerConfig } from "@/lib/supabase-server";
import { sourceCapabilitySummary, sourceCounts } from "@/lib/source-registry";
import { searchSource, stableLiveSources } from "@/lib/live-market";
import { pushConfigured } from "@/lib/push";

const VERSION = "6.0.0";

const requiredTables = [
  ["smartbuy_products", "product_key"],
  ["smartbuy_price_history", "id"],
  ["smartbuy_watchlist", "id"],
  ["smartbuy_saved_searches", "id"],
  ["smartbuy_notifications", "id"],
  ["smartbuy_purchase_workspace", "id"],
  ["smartbuy_push_subscriptions", "id"],
  ["smartbuy_server_events", "id"],
] as const;

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "невідома помилка");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9._-]+/gi, "sb_[redacted]")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "[token redacted]")
    .slice(0, 240);
}

async function checkSupabaseTables(): Promise<DiagnosticCheck> {
  const config = getSupabaseServerConfig();
  if (!config.configured) {
    return {
      id: "supabase", label: "Supabase", status: "warn",
      summary: "Хмарний режим не налаштований",
      detail: `URL: ${config.hasUrl ? "є" : "немає"} · серверний ключ: ${config.hasServerKey ? "є" : "немає"}. Локальні функції можуть працювати без хмари.`,
    };
  }
  const db = getSupabaseAdmin();
  if (!db) return { id: "supabase", label: "Supabase", status: "error", summary: "Не вдалося створити серверне підключення" };
  const started = Date.now();
  const results = await Promise.all(requiredTables.map(async ([table, column]) => {
    try {
      const { error } = await db.from(table).select(column, { head: true, count: "exact" }).limit(1);
      return { table, ok: !error, error: error ? safeError(error.message) : "" };
    } catch (error) {
      return { table, ok: false, error: safeError(error) };
    }
  }));
  const missing = results.filter(item => !item.ok);
  if (missing.length) {
    return {
      id: "supabase", label: "Supabase", status: "error", durationMs: Date.now() - started,
      summary: `${requiredTables.length - missing.length}/${requiredTables.length} таблиць доступні`,
      detail: `Проблема: ${missing.map(item => item.table).join(", ")}. Запусти supabase/update_to_latest.sql і повтори перевірку.`,
    };
  }
  return {
    id: "supabase", label: "Supabase", status: "ok", durationMs: Date.now() - started,
    summary: `Усі ${requiredTables.length} таблиць доступні`,
    detail: `Серверний ключ: ${config.keySource === "service_role" ? "service_role" : "secret"}. Значення ключа ніколи не повертається в діагностику.`,
  };
}

async function checkStableSources(): Promise<{ check: DiagnosticCheck; statuses: SourceSearchStatus[] }> {
  const started = Date.now();
  const query = "iPhone 17 256GB";
  const settled = await Promise.all(stableLiveSources.map(async source => {
    try { return (await searchSource(source, query)).status; }
    catch (error) {
      return { id: source.id, name: source.name, state: "error" as const, offerCount: 0, durationMs: 0, message: safeError(error), tier: source.tier };
    }
  }));
  const ok = settled.filter(item => item.state === "ok").length;
  const responsive = settled.filter(item => item.state === "ok" || item.state === "empty" || item.state === "blocked").length;
  const failed = settled.filter(item => item.state === "error" || item.state === "timeout").length;
  const status: DiagnosticCheck["status"] = ok > 0 ? "ok" : responsive > 0 ? "warn" : "error";
  return {
    statuses: settled,
    check: {
      id: "live-sources", label: "Live-джерела", status, durationMs: Date.now() - started,
      summary: `${ok}/${stableLiveSources.length} стабільних джерел дали релевантні пропозиції`,
      detail: failed ? `${failed} джерел завершилися помилкою або тайм-аутом. Це може бути тимчасово.` : "Перевірка використовує звичайний публічний пошук без обходу captcha/антиботу.",
    },
  };
}

export async function buildDiagnostics(deep = false): Promise<DiagnosticsResponse> {
  const checks: DiagnosticCheck[] = [];
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "local";
  checks.push({
    id: "runtime", label: "SmartBuy runtime", status: "ok",
    summary: `SmartBuy AI ${VERSION} · ${environment}`,
    detail: process.env.VERCEL_ENV ? "Серверний runtime Vercel відповідає." : "Локальний/не-Vercel runtime.",
  });

  const cloud = await checkSupabaseTables();
  checks.push(cloud);

  const sourceRegistryOk = sourceCounts.ukraine > 0 && sourceCounts.stable === stableLiveSources.length;
  const capabilitySummary = sourceCapabilitySummary();
  checks.push({
    id: "source-registry", label: "Реєстр джерел", status: sourceRegistryOk ? "ok" : "error",
    summary: `${sourceCounts.ukraine} українських + ${sourceCounts.international} міжнародних джерел`,
    detail: `${sourceCounts.stable} стабільних · ${sourceCounts.probe} пробних · ${sourceCounts.private} приватних · середнє покриття можливостей ${capabilitySummary.averageScore}/100.`,
  });

  checks.push({
    id: "web-push", label: "Web Push", status: pushConfigured() ? "ok" : "warn",
    summary: pushConfigured() ? "VAPID налаштований" : "Потрібні VAPID ключі",
    detail: pushConfigured() ? "Service worker може отримувати push навіть коли вкладка закрита." : "Додай WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY і WEB_PUSH_SUBJECT у Vercel.",
  });

  checks.push({
    id: "cron", label: "Автоперевірка", status: "info",
    summary: "Щоденний Vercel Cron описаний у vercel.json",
    detail: process.env.CRON_SECRET ? "CRON_SECRET увімкнений — endpoint cron захищений." : "CRON_SECRET не заданий. Для особистого MVP це допустимо, але перед публічним запуском краще додати захист.",
  });

  let sourceStatuses: SourceSearchStatus[] = [];
  if (deep) {
    const sourceCheck = await checkStableSources();
    checks.push(sourceCheck.check);
    sourceStatuses = sourceCheck.statuses;
  } else {
    checks.push({ id: "live-sources", label: "Live-джерела", status: "info", summary: "Глибока перевірка ще не запускалась", detail: "Натисни «Перевірити live-джерела», щоб SmartBuy зробив тестовий пошук у стабільних джерелах." });
  }

  const summary = { ok: 0, warn: 0, error: 0, info: 0 };
  for (const check of checks) summary[check.status] += 1;
  return {
    ok: summary.error === 0, deep, version: VERSION, checkedAt: new Date().toISOString(), environment,
    cloudConfigured: getSupabaseServerConfig().configured, checks, sourceStatuses, summary, secretsExposed: false,
  };
}
