import * as cheerio from "cheerio";
import { buildDiscoveryQueries } from "@/lib/discovery-query";
import { evaluateSearchMatch } from "@/lib/matching";
import { identifySourceUrl } from "@/lib/source-registry";
import type { DiscoveryHit, SourceSearchStatus } from "@/lib/types";

export type WebDiscoveryScope = "ukraine" | "international" | "all" | "private";
export type WebDiscoveryResult = { hits: DiscoveryHit[]; status: SourceSearchStatus; partial: boolean };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36";
const UKR_DOMAINS = ["rozetka.com.ua", "prom.ua", "epicentrk.ua", "olx.ua", "hotline.ua", "ek.ua", "allo.ua", "comfy.ua", "foxtrot.com.ua"];
const INTL_DOMAINS = ["aliexpress.com", "temu.com", "amazon.com", "1688.com", "taobao.com"];

function clean(value: unknown) { return String(value || "").replace(/\s+/g, " ").trim(); }
function unwrapDuckDuckGo(raw: string) {
  try {
    const u = new URL(raw, "https://duckduckgo.com");
    const redirected = u.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : u.toString();
  } catch { return raw; }
}
function allowedForScope(source: ReturnType<typeof identifySourceUrl>, scope: WebDiscoveryScope) {
  if (!source) return false;
  if (scope === "international") return source.region === "international";
  if (scope === "private") return source.id === "olx" || source.id === "shafa";
  if (scope === "ukraine") return source.region === "ukraine";
  return true;
}
function dedupeHits(hits: DiscoveryHit[]) {
  const map = new Map<string, DiscoveryHit>();
  for (const hit of hits) {
    const key = hit.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    const current = map.get(key);
    if (!current || (hit.matchConfidence || 0) > (current.matchConfidence || 0)) map.set(key, hit);
  }
  return [...map.values()].sort((a,b)=>(b.matchConfidence||0)-(a.matchConfidence||0)).slice(0, 12);
}

async function fetchText(url: string, timeoutMs: number, headers: Record<string,string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(400, timeoutMs));
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...headers } });
    return { response, text: response.ok ? await response.text() : "" };
  } finally { clearTimeout(timer); }
}

async function braveSearch(searchQuery: string, scope: WebDiscoveryScope, timeoutMs: number): Promise<DiscoveryHit[]> {
  const key = process.env.SMARTBUY_BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("count", "12");
  url.searchParams.set("search_lang", "uk");
  const { response, text } = await fetchText(url.toString(), timeoutMs, { "x-subscription-token": key, accept: "application/json" });
  if (!response.ok || !text) return [];
  let data: any; try { data = JSON.parse(text); } catch { return []; }
  const rows = Array.isArray(data?.web?.results) ? data.web.results : [];
  return rows.flatMap((row: any) => {
    const url = clean(row?.url); const title = clean(row?.title); const snippet = clean(row?.description);
    const source = identifySourceUrl(url); if (!source || !allowedForScope(source, scope) || !title) return [];
    return [{ id: `brave-${source.id}-${Math.abs(hash(url))}`, title, url, snippet, sourceId: source.id, sourceName: source.name, region: source.region, matchConfidence: 0, provider: "Brave Search" } satisfies DiscoveryHit];
  });
}

async function duckDuckGoSearch(searchQuery: string, scope: WebDiscoveryScope, timeoutMs: number): Promise<DiscoveryHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
  const { response, text } = await fetchText(url, timeoutMs, { "accept-language": "uk-UA,uk;q=0.9,en;q=0.7" });
  if (!response.ok || !text || /captcha|verify you are human|anomaly/i.test(text.slice(0,80_000))) return [];
  const $ = cheerio.load(text); const hits: DiscoveryHit[] = [];
  $(".result, .web-result").slice(0, 20).each((_, el) => {
    const row = $(el); const a = row.find("a.result__a, a[data-testid='result-title-a'], h2 a").first();
    const rawUrl = a.attr("href") || ""; const target = unwrapDuckDuckGo(rawUrl); const title = clean(a.text());
    const snippet = clean(row.find(".result__snippet, [data-result='snippet']").first().text());
    const source = identifySourceUrl(target);
    if (!source || !allowedForScope(source, scope) || !title) return;
    hits.push({ id: `ddg-${source.id}-${Math.abs(hash(target))}`, title, url: target, snippet, sourceId: source.id, sourceName: source.name, region: source.region, matchConfidence: 0, provider: "Web Discovery" });
  });
  return hits;
}

function hash(value: string) { let h=0; for (let i=0;i<value.length;i++) h=((h<<5)-h+value.charCodeAt(i))|0; return h; }
function siteClause(scope: WebDiscoveryScope, regionHint?: "ukraine" | "international") {
  const domains = regionHint === "international" || scope === "international"
    ? INTL_DOMAINS
    : scope === "private"
      ? ["olx.ua"]
      : UKR_DOMAINS;
  return domains.map(d=>`site:${d}`).join(" OR ");
}

export async function searchWebDiscovery(query: string, scope: WebDiscoveryScope, deadlineAt?: number): Promise<WebDiscoveryResult> {
  const started = Date.now();
  if (!query.trim() || process.env.SMARTBUY_WEB_DISCOVERY_ENABLED === "false") return { hits: [], status: { id:"web-discovery", name:"Web Discovery", state:"not-run", offerCount:0, durationMs:0, message:"вимкнено", tier:"probe" }, partial:false };
  const budget = Math.max(1800, Math.min(Number(process.env.SMARTBUY_WEB_DISCOVERY_TIMEOUT_MS || 4200), 6500));
  const deadline = Math.min(started + budget, deadlineAt || Number.POSITIVE_INFINITY);
  const selected = scope === "all"
    ? [
        ...buildDiscoveryQueries(query, "ukraine", 3).slice(0, 1).map(variant => ({ ...variant, regionHint: "ukraine" as const })),
        ...buildDiscoveryQueries(query, "international", 3).slice(0, 1).map(variant => ({ ...variant, regionHint: "international" as const })),
      ]
    : buildDiscoveryQueries(query, scope === "international" ? "international" : "ukraine", 4).slice(0, 2).map(variant => ({ ...variant, regionHint: scope === "international" ? "international" as const : "ukraine" as const }));
  let all: DiscoveryHit[] = []; let attempts = 0; let provider = "Web Discovery";
  for (const variant of selected) {
    const remaining = deadline - Date.now(); if (remaining < 700) break;
    attempts += 1;
    const q = `(${siteClause(scope, variant.regionHint)}) ${variant.query}`;
    let hits = await braveSearch(q, scope, Math.min(remaining, 2200));
    if (hits.length) provider = "Brave Search";
    else if (process.env.SMARTBUY_DDG_FALLBACK_ENABLED !== "false") hits = await duckDuckGoSearch(q, scope, Math.min(deadline - Date.now(), 2200));
    for (const hit of hits) {
      const match = evaluateSearchMatch(query, `${hit.title} ${hit.snippet || ""}`);
      if (!match.reliable) continue;
      all.push({ ...hit, matchConfidence: Math.round(match.score * 100), queryUsed: variant.query });
    }
    if (all.length >= 6) break;
  }
  all = dedupeHits(all);
  const partial = Date.now() >= deadline - 150;
  return { hits: all, status: { id:"web-discovery", name:"Web Discovery", state: all.length ? "ok" : partial ? "timeout" : "empty", offerCount:all.length, durationMs:Date.now()-started, message: all.length ? `${provider}: знайдено ${all.length} сторінок товарів` : "веб-індекс не дав релевантних сторінок", tier:"probe", attempts, queryVariantsTried:attempts, queryExpanded: attempts>1 }, partial };
}
