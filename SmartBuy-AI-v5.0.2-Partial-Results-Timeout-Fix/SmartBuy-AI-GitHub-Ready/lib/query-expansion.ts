import { evaluateTitleMatch, normalizeSearchQuery, titleTokens } from "@/lib/matching";

export type QueryVariantKind = "exact" | "brand" | "format" | "relaxed";

export type QueryVariant = {
  query: string;
  kind: QueryVariantKind;
  reason: string;
};

const SOURCE_MAX: Record<string, number> = {
  olx: 3,
  shafa: 3,
  prom: 3,
  bigl: 3,
  moyo: 2,
};

const REDUNDANT_BRANDS = new Set(["apple", "samsung", "xiaomi", "redmi", "poco", "lenovo", "asus", "acer", "makita", "bosch", "dewalt", "roborock", "dyson"]);

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function addCandidate(list: QueryVariant[], base: string, query: string, kind: QueryVariantKind, reason: string) {
  const candidate = clean(query);
  if (!candidate) return;
  if (list.some(item => item.query.toLowerCase() === candidate.toLowerCase())) return;
  const match = evaluateTitleMatch(base, candidate);
  // Query expansion is allowed to change formatting or add a redundant brand, but never
  // storage / generation / variant / model identity. This keeps the downstream matcher strict.
  const dangerous = match.conflicts.some(item => ["model", "storage", "ram", "variant", "generation", "accessory", "counterfeit", "brand"].includes(item));
  if (dangerous) return;
  list.push({ query: candidate, kind, reason });
}

function brandExpanded(base: string) {
  const lower = base.toLowerCase();
  if (/\biphone\b/.test(lower) && !/^apple\b/.test(lower)) return `Apple ${base}`;
  if (/\bgalaxy\b/.test(lower) && !/^samsung\b/.test(lower)) return `Samsung ${base}`;
  if (/\b(?:redmi|poco)\b/.test(lower) && !/^xiaomi\b/.test(lower)) return `Xiaomi ${base}`;
  return "";
}

function spacedCapacity(base: string) {
  return base
    .replace(/\b(\d+(?:[.,]\d+)?)gb\b/gi, "$1 GB")
    .replace(/\b(\d+(?:[.,]\d+)?)tb\b/gi, "$1 TB")
    .replace(/\s+/g, " ")
    .trim();
}

function relaxedBrand(base: string) {
  const tokens = base.split(/\s+/);
  if (tokens.length < 3) return "";
  if (!REDUNDANT_BRANDS.has(tokens[0].toLowerCase())) return "";
  const rest = tokens.slice(1).join(" ");
  // Only remove a brand when the remaining query still contains a clear family/model signal.
  const strong = titleTokens(rest).some(token => /\d/.test(token)) || /\biphone\b|\bgalaxy\b|\bredmi\b|\bpoco\b/i.test(rest);
  return strong ? rest : "";
}

/**
 * Build a conservative list of search phrases for marketplaces.
 * The original normalized query is always first. Additional variants only change
 * redundant brand wording or formatting; hard model/storage/variant identity stays intact.
 */
export function expandSearchQuery(query: string, sourceId = "", requestedMax?: number): QueryVariant[] {
  const base = normalizeSearchQuery(query);
  if (!base) return [];
  const configured = Number(process.env.SMARTBUY_QUERY_VARIANTS || 3);
  const sourceMax = SOURCE_MAX[sourceId] || 2;
  const max = Math.max(1, Math.min(requestedMax || configured || 3, sourceMax, 4));
  const variants: QueryVariant[] = [{ query: base, kind: "exact", reason: "нормалізований точний запит" }];

  const brand = brandExpanded(base);
  if (brand) addCandidate(variants, base, brand, "brand", "додано стандартну назву бренду");

  const spaced = spacedCapacity(base);
  if (spaced.toLowerCase() !== base.toLowerCase()) addCandidate(variants, base, spaced, "format", "інший формат пам’яті");

  const relaxed = relaxedBrand(base);
  if (relaxed) addCandidate(variants, base, relaxed, "relaxed", "прибрано зайвий бренд, модель збережено");

  return variants.slice(0, max);
}

export function queryExpansionSummary(query: string) {
  return expandSearchQuery(query, "prom", 4).map(item => item.query);
}
