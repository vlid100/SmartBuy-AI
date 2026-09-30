import type { Product } from "@/lib/types";

const STOP = new Set([
  "купити", "ціна", "ціни", "новий", "нова", "нове", "бв", "бу", "україна", "україні", "ua",
  "товар", "смартфон", "телефон", "ноутбук", "оригінал", "apple", "модель",
]);
const VARIANTS = new Set(["pro", "max", "ultra", "plus", "mini", "air", "lite", "fe", "se"]);

function canonical(value: string) {
  return value
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/(\d+)\s*(?:гб|gb)\b/gi, "$1gb")
    .replace(/(\d+)\s*(?:тб|tb)\b/gi, "$1tb")
    .replace(/[^a-zа-яіїєґ0-9+.-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(value: string) {
  return canonical(value).split(/\s+/).filter(token => token.length > 1 && !STOP.has(token));
}

function criticalTokens(value: string) {
  return titleTokens(value).filter(token =>
    /\d/.test(token) && (/^[a-zа-яіїєґ]*\d+[a-zа-яіїєґ0-9.-]*$/i.test(token) || /^\d+(?:gb|tb)$/.test(token) || /^\d{2,4}$/.test(token))
  );
}

function variantTokens(value: string) {
  return new Set(titleTokens(value).filter(token => VARIANTS.has(token)));
}

function intersectionCount(a: Set<string>, b: Set<string>) {
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits;
}

export type TitleMatch = {
  score: number;
  reliable: boolean;
  hardCoverage: number;
  variantConflict: boolean;
  sharedTokens: number;
};

export function evaluateTitleMatch(reference: string, candidate: string): TitleMatch {
  const left = new Set(titleTokens(reference));
  const right = new Set(titleTokens(candidate));
  if (!left.size || !right.size) return { score: 0, reliable: false, hardCoverage: 0, variantConflict: false, sharedTokens: 0 };

  const shared = intersectionCount(left, right);
  const precision = shared / Math.max(1, Math.min(left.size, right.size));
  const jaccard = shared / Math.max(1, new Set([...left, ...right]).size);

  const hard = criticalTokens(reference);
  const hardHits = hard.filter(token => right.has(token)).length;
  const hardCoverage = hard.length ? hardHits / hard.length : 1;

  const leftVariants = variantTokens(reference);
  const rightVariants = variantTokens(candidate);
  const extraCandidateVariant = [...rightVariants].some(token => !leftVariants.has(token));
  const missingReferenceVariant = [...leftVariants].some(token => !rightVariants.has(token));
  const variantConflict = extraCandidateVariant || missingReferenceVariant;

  let score = precision * 0.67 + jaccard * 0.23 + hardCoverage * 0.10;
  if (variantConflict) score -= 0.24;
  score = Math.max(0, Math.min(1, score));

  const enoughShared = hard.length ? shared >= Math.min(2, left.size) : shared >= Math.min(2, left.size);
  const reliable = score >= 0.58 && hardCoverage >= 0.999 && !variantConflict && enoughShared;
  return { score, reliable, hardCoverage, variantConflict, sharedTokens: shared };
}

export function bestProductMatch(reference: Product, candidates: Product[]) {
  let best: Product | null = null;
  let bestMatch: TitleMatch = { score: 0, reliable: false, hardCoverage: 0, variantConflict: false, sharedTokens: 0 };
  for (const candidate of candidates) {
    const match = evaluateTitleMatch(reference.title, candidate.title);
    if (match.score > bestMatch.score) {
      best = candidate;
      bestMatch = match;
    }
  }
  return best && bestMatch.reliable ? { product: best, match: bestMatch } : null;
}
