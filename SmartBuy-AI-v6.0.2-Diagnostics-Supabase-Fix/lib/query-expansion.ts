import { normalizeSearchQuery } from "@/lib/matching";
import { buildDiscoveryQueries, discoveryQuerySummary } from "@/lib/discovery-query";

export type QueryVariantKind = "exact" | "brand" | "format" | "relaxed" | "discovery";
export type QueryVariant = { query: string; kind: QueryVariantKind; reason: string };

const SOURCE_MAX: Record<string, number> = {
  olx: 5, rozetka: 5, prom: 4, bigl: 4, moyo: 3, hotline: 4, ekatalog: 4,
  epicentr: 4, allo: 3, comfy: 3, foxtrot: 3, shafa: 4,
};

/**
 * v6.0 Discovery Search: the exact query remains first, but descriptive requests are
 * also reduced to a product core (for example “стійка для рушників”). This phase only
 * discovers candidates. Variant Guard still validates model/storage/SKU/colour later.
 */
export function expandSearchQuery(query: string, sourceId = "", requestedMax?: number): QueryVariant[] {
  const base = normalizeSearchQuery(query);
  if (!base) return [];
  const configured = Number(process.env.SMARTBUY_QUERY_VARIANTS || 4);
  const sourceMax = SOURCE_MAX[sourceId] || 3;
  const max = Math.max(1, Math.min(requestedMax || configured || 4, sourceMax, 6));
  return buildDiscoveryQueries(base, "ukraine", max).map((item, index) => ({
    query: item.query,
    kind: index === 0 ? "exact" : "discovery",
    reason: item.reason,
  }));
}

export function queryExpansionSummary(query: string) {
  return discoveryQuerySummary(query);
}
