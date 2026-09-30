import type { Product } from "@/lib/types";

const STOP = new Set([
  "купити", "ціна", "ціни", "новий", "нова", "нове", "нові", "бв", "бу", "україна", "україні", "ua",
  "товар", "смартфон", "телефон", "мобільний", "ноутбук", "оригінал", "модель", "версія", "гарантія",
  "доставка", "акція", "знижка", "apple", "память", "памяті", "пам'ять", "пзу", "озу", "ram", "rom",
  "black", "white", "silver", "gold", "blue", "green", "red", "pink", "purple", "gray", "grey", "orange",
  "чорний", "чорна", "білий", "біла", "срібний", "золотий", "синій", "зелений", "червоний", "рожевий",
]);

const VARIANTS = new Set([
  "pro", "max", "ultra", "plus", "mini", "air", "lite", "fe", "se", "edge", "neo", "fold", "flip", "note",
]);

const ACCESSORY_TERMS = new Set([
  "чохол", "чехол", "case", "cover", "бампер", "скло", "стекло", "glass", "плівка", "пленка", "film",
  "кабель", "cable", "зарядка", "charger", "адаптер", "adapter", "ремінець", "ремешок", "strap", "клавіатура",
  "keyboard", "стилус", "stylus", "акумулятор", "battery", "корпус", "display", "екран", "screen", "запчастина",
]);

const COUNTERFEIT_TERMS = new Set([
  "копія", "копия", "copy", "репліка", "реплика", "replica", "муляж", "макет", "підробка", "подделка", "fake",
  "аналог", "клон", "clone",
]);

const BRAND_ALIASES: Record<string, string> = {
  айфон: "iphone", iphone: "iphone", apple: "apple",
  самсунг: "samsung", samsung: "samsung",
  сяомі: "xiaomi", ксяомі: "xiaomi", xiaomi: "xiaomi",
  редмі: "redmi", redmi: "redmi",
  поко: "poco", poco: "poco",
  макіта: "makita", макита: "makita", makita: "makita",
  бош: "bosch", bosch: "bosch",
  деволт: "dewalt", dewalt: "dewalt",
  леново: "lenovo", lenovo: "lenovo",
  асус: "asus", asus: "asus",
  acer: "acer", асер: "acer",
  hp: "hp", huawei: "huawei", хуавей: "huawei",
  roborock: "roborock", роборок: "roborock",
  dyson: "dyson", дайсон: "dyson",
  lg: "lg", sony: "sony", соні: "sony",
};

const KNOWN_BRANDS = new Set(Object.values(BRAND_ALIASES));
const GENERIC_MODEL_TOKENS = new Set(["5g", "4g", "3g", "wifi", "wifi6", "wifi7", "usb", "typec", "oled", "qled", "amoled"]);

function replaceAliases(value: string) {
  let text = value.toLowerCase().replace(/[’'`]/g, "");
  for (const [from, to] of Object.entries(BRAND_ALIASES)) {
    text = text.replace(new RegExp(`(^|[^a-zа-яіїєґ0-9])${from}(?=$|[^a-zа-яіїєґ0-9])`, "giu"), `$1${to}`);
  }
  return text;
}

function canonical(value: string) {
  return replaceAliases(value)
    .replace(/([a-zа-яіїєґ0-9])\+/gi, "$1 plus")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:гб|gb)\b/gi, "$1gb")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:тб|tb)\b/gi, "$1tb")
    .replace(/(\d+)\s*\/\s*(\d+)\s*(?:gb|гб)?\b/gi, "$1/$2gb")
    .replace(/[^a-zа-яіїєґ0-9+./-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(value: string) {
  return canonical(value).split(/\s+/).filter(token => token.length > 1 && !STOP.has(token));
}

function capacityTokens(value: string) {
  const result = new Set<string>();
  const text = canonical(value);
  for (const match of text.matchAll(/\b(\d+(?:[.,]\d+)?)(gb|tb)\b/gi)) {
    const raw = Number(String(match[1]).replace(",", "."));
    if (!Number.isFinite(raw)) continue;
    const gb = match[2].toLowerCase() === "tb" ? Math.round(raw * 1024) : Math.round(raw);
    if (gb >= 16 && gb <= 8192) result.add(`${gb}gb`);
  }
  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{2,4})gb\b/gi)) {
    const ram = Number(match[1]);
    const storage = Number(match[2]);
    if (ram >= 2 && ram <= 64) result.add(`ram:${ram}gb`);
    if (storage >= 16 && storage <= 4096) result.add(`${storage}gb`);
  }
  return result;
}

function variantTokens(value: string) {
  return new Set(titleTokens(value).filter(token => VARIANTS.has(token)));
}

function brandTokens(value: string) {
  const tokens = titleTokens(value);
  const brands = new Set(tokens.filter(token => KNOWN_BRANDS.has(token)));
  if (tokens.includes("iphone")) brands.add("apple");
  if (tokens.includes("macbook")) brands.add("apple");
  return brands;
}

function accessoryTokens(value: string) {
  return new Set(titleTokens(value).filter(token => ACCESSORY_TERMS.has(token)));
}

function counterfeitTokens(value: string) {
  return new Set(titleTokens(value).filter(token => COUNTERFEIT_TERMS.has(token)));
}

function familySignals(value: string) {
  const text = canonical(value);
  const tokens = titleTokens(text);
  const out = new Set<string>();
  const add = (v?: string) => { if (v) out.add(v); };

  for (const match of text.matchAll(/\biphone\s*(\d{1,2}[a-z]?)\b/gi)) add(`iphone:${match[1].toLowerCase()}`);
  for (const match of text.matchAll(/\bgalaxy\s*([sazm]\d{1,3}(?:\s*(?:ultra|plus|fe))?)\b/gi)) add(`galaxy:${match[1].replace(/\s+/g, "").toLowerCase()}`);
  for (const match of text.matchAll(/\b(?:redmi|poco)\s*([a-z]*\d+[a-z0-9-]*)\b/gi)) add(`${match[0].split(/\s+/)[0].toLowerCase()}:${match[1].toLowerCase()}`);
  for (const match of text.matchAll(/\b(loq|legion|ideapad|thinkpad|vivobook)\s*(\d{2})(?:[a-z][a-z0-9-]*)?\b/gi)) add(`${match[1].toLowerCase()}:${match[2]}`);
  for (const match of text.matchAll(/\b(tuf|nitro)\s*([a-z]?\d{2})(?:[a-z0-9-]*)?\b/gi)) add(`${match[1].toLowerCase()}:${match[2].toLowerCase()}`);

  for (const token of tokens) {
    if (GENERIC_MODEL_TOKENS.has(token)) continue;
    if (/^[a-z]{1,8}[-.]?\d{2,}[a-z0-9.-]*$/i.test(token) || /^[a-z]{2,}\d+[a-z0-9.-]*$/i.test(token)) add(`model:${token}`);
  }
  return out;
}

function numericIdentityTokens(value: string) {
  const text = canonical(value);
  const capacities = capacityTokens(text);
  const result = new Set<string>();
  for (const token of text.split(/\s+/)) {
    if (!/^\d{1,3}$/.test(token)) continue;
    if (capacities.has(`${token}gb`)) continue;
    const n = Number(token);
    if (n >= 1 && n <= 199) result.add(token);
  }
  return result;
}

function intersectionCount(a: Set<string>, b: Set<string>) {
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits;
}

function setConflict(reference: Set<string>, candidate: Set<string>) {
  if (!reference.size || !candidate.size) return false;
  return intersectionCount(reference, candidate) === 0;
}

function subsetMissing(reference: Set<string>, candidate: Set<string>) {
  return [...reference].some(token => !candidate.has(token));
}

export type TitleMatch = {
  score: number;
  reliable: boolean;
  hardCoverage: number;
  variantConflict: boolean;
  sharedTokens: number;
  conflicts: string[];
  reasons: string[];
};

export function evaluateTitleMatch(reference: string, candidate: string): TitleMatch {
  const left = new Set(titleTokens(reference));
  const right = new Set(titleTokens(candidate));
  if (!left.size || !right.size) {
    return { score: 0, reliable: false, hardCoverage: 0, variantConflict: false, sharedTokens: 0, conflicts: ["empty"], reasons: [] };
  }

  const conflicts: string[] = [];
  const reasons: string[] = [];
  const shared = intersectionCount(left, right);
  const precision = shared / Math.max(1, Math.min(left.size, right.size));
  const jaccard = shared / Math.max(1, new Set([...left, ...right]).size);

  const refBrands = brandTokens(reference);
  const candBrands = brandTokens(candidate);
  if (setConflict(refBrands, candBrands)) conflicts.push("brand");
  else if (refBrands.size && intersectionCount(refBrands, candBrands)) reasons.push("brand");

  const refFamily = familySignals(reference);
  const candFamily = familySignals(candidate);
  if (setConflict(refFamily, candFamily)) conflicts.push("model");
  else if (refFamily.size && intersectionCount(refFamily, candFamily)) reasons.push("model");

  const refCapacity = capacityTokens(reference);
  const candCapacity = capacityTokens(candidate);
  const refStorage = new Set([...refCapacity].filter(x => !x.startsWith("ram:")));
  const candStorage = new Set([...candCapacity].filter(x => !x.startsWith("ram:")));
  if (setConflict(refStorage, candStorage)) conflicts.push("storage");
  else if (refStorage.size && intersectionCount(refStorage, candStorage)) reasons.push("storage");

  const refRam = new Set([...refCapacity].filter(x => x.startsWith("ram:")));
  const candRam = new Set([...candCapacity].filter(x => x.startsWith("ram:")));
  if (setConflict(refRam, candRam)) conflicts.push("ram");

  const leftVariants = variantTokens(reference);
  const rightVariants = variantTokens(candidate);
  const extraCandidateVariant = [...rightVariants].some(token => !leftVariants.has(token));
  const missingReferenceVariant = [...leftVariants].some(token => !rightVariants.has(token));
  const variantConflict = extraCandidateVariant || missingReferenceVariant;
  if (variantConflict) conflicts.push("variant");
  else if (leftVariants.size) reasons.push("variant");

  const refAccessory = accessoryTokens(reference);
  const candAccessory = accessoryTokens(candidate);
  if (!refAccessory.size && candAccessory.size) conflicts.push("accessory");

  const refCounterfeit = counterfeitTokens(reference);
  const candCounterfeit = counterfeitTokens(candidate);
  if (!refCounterfeit.size && candCounterfeit.size) conflicts.push("counterfeit");

  const refText = canonical(reference);
  const candText = canonical(candidate);
  if (/\biphone\b/.test(refText) && /\bandroid\b/.test(candText)) conflicts.push("iphone-android-copy");

  const refNumbers = numericIdentityTokens(reference);
  const candNumbers = numericIdentityTokens(candidate);
  // Only make plain-number mismatches hard when the reference has a clear product family.
  if ((refFamily.size || /\biphone\b|\bgalaxy\b/i.test(refText)) && setConflict(refNumbers, candNumbers)) conflicts.push("generation");

  const hardReference = new Set([...refFamily, ...refStorage, ...leftVariants]);
  let hardHits = 0;
  for (const token of hardReference) {
    if (refFamily.has(token) && candFamily.has(token)) hardHits += 1;
    else if (refStorage.has(token) && candStorage.has(token)) hardHits += 1;
    else if (leftVariants.has(token) && rightVariants.has(token)) hardHits += 1;
  }
  const hardCoverage = hardReference.size ? hardHits / hardReference.size : 1;

  let score = precision * 0.44 + jaccard * 0.18 + hardCoverage * 0.24;
  if (refBrands.size && intersectionCount(refBrands, candBrands)) score += 0.06;
  if (refFamily.size && intersectionCount(refFamily, candFamily)) score += 0.08;
  if (refStorage.size && intersectionCount(refStorage, candStorage)) score += 0.06;
  if (conflicts.length) score -= Math.min(0.72, conflicts.length * 0.22);
  score = Math.max(0, Math.min(1, score));

  const modelLike = refFamily.size > 0 || refStorage.size > 0 || leftVariants.size > 0 || [...left].some(t => /\d/.test(t));
  const enoughShared = shared >= Math.min(modelLike ? 2 : 1, left.size);
  const reliable = conflicts.length === 0 && enoughShared && hardCoverage >= 0.999 && score >= (modelLike ? 0.70 : 0.55);

  if (!conflicts.length && reliable) reasons.push("token-overlap");
  return { score, reliable, hardCoverage, variantConflict, sharedTokens: shared, conflicts, reasons };
}

export function bestProductMatch(reference: Product, candidates: Product[]) {
  let best: Product | null = null;
  let bestMatch: TitleMatch = { score: 0, reliable: false, hardCoverage: 0, variantConflict: false, sharedTokens: 0, conflicts: [], reasons: [] };
  for (const candidate of candidates) {
    const match = evaluateTitleMatch(reference.title, candidate.title);
    if (match.score > bestMatch.score) {
      best = candidate;
      bestMatch = match;
    }
  }
  return best && bestMatch.reliable ? { product: best, match: bestMatch } : null;
}
