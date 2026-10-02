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
  айфон: "iphone", iphone: "iphone", apple: "apple", епл: "apple",
  макбук: "macbook", macbook: "macbook",
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


const COLOR_ALIASES: Record<string, string> = {
  black: "black", чорний: "black", чорна: "black", чорне: "black", чорні: "black", graphite: "graphite", графіт: "graphite", графітовий: "graphite",
  white: "white", білий: "white", біла: "white", біле: "white", silver: "silver", срібний: "silver", сріблястий: "silver",
  gold: "gold", golden: "gold", золотий: "gold", blue: "blue", синій: "blue", блакитний: "blue", navy: "blue",
  green: "green", зелений: "green", red: "red", червоний: "red", pink: "pink", рожевий: "pink", purple: "purple", фіолетовий: "purple",
  gray: "gray", grey: "gray", сірий: "gray", orange: "orange", помаранчевий: "orange", yellow: "yellow", жовтий: "yellow",
  titanium: "titanium", титан: "titanium", natural: "natural", desert: "desert", midnight: "midnight", starlight: "starlight",
};

const REGION_ALIASES: Record<string, string> = {
  ua: "ua", ukraine: "ua", україна: "ua", українська: "ua",
  eu: "eu", europe: "eu", european: "eu", європа: "eu", європейська: "eu",
  us: "us", usa: "us", american: "us", америка: "us", американська: "us",
  uk: "uk", gb: "uk", british: "uk",
  global: "global", глобальна: "global", globalversion: "global",
  cn: "cn", china: "cn", chinese: "cn", китай: "cn", китайська: "cn",
  hk: "hk", hongkong: "hk", jp: "jp", japan: "jp", японія: "jp",
};

function colorTokens(value: string) {
  const raw = replaceAliases(value).toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/giu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const token of raw) if (COLOR_ALIASES[token]) out.add(COLOR_ALIASES[token]);
  return out;
}

function skuTokens(value: string) {
  const text = String(value || "").toUpperCase();
  const out = new Set<string>();
  const patterns = [
    /\b[A-Z]{1,5}[-/]?\d{3,}[A-Z0-9-]{0,10}\b/g,
    /\b[A-Z0-9]{2,8}[-/][A-Z0-9-]{3,16}\b/g,
    /\bA\d{4}\b/g,
  ];
  for (const re of patterns) for (const match of text.matchAll(re)) {
    const token = match[0].replace(/[^A-Z0-9]/g, "");
    if (token.length >= 5 && !/^\d+$/.test(token)) out.add(token.toLowerCase());
  }
  return out;
}

function regionTokens(value: string) {
  const normalized = replaceAliases(value).toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/giu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const token of normalized) if (REGION_ALIASES[token]) out.add(REGION_ALIASES[token]);
  return out;
}

export function productVariantSignals(value: string) {
  return {
    colors: [...colorTokens(value)].sort(),
    skus: [...skuTokens(value)].sort(),
    regions: [...regionTokens(value)].sort(),
  };
}

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
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:гб|gb)(?=$|[^a-zа-яіїєґ0-9])/gi, "$1gb")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:тб|tb)(?=$|[^a-zа-яіїєґ0-9])/gi, "$1tb")
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
  for (const match of text.matchAll(/\bmacbook\s+(air|pro)\s*(\d{2})(?:[.,]\d)?\b/gi)) add(`macbook:${match[1].toLowerCase()}:${match[2]}`);
  if (/\bmacbook\b/i.test(text)) {
    for (const match of text.matchAll(/\bm([1-9])(?:\s*(pro|max|ultra))?\b/gi)) add(`macbookchip:m${match[1]}${match[2] ? `-${match[2].toLowerCase()}` : ""}`);
  }
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

  const refColors = colorTokens(reference);
  const candColors = colorTokens(candidate);
  if (setConflict(refColors, candColors)) conflicts.push("color");
  else if (refColors.size && intersectionCount(refColors, candColors)) reasons.push("color");

  const refSkus = skuTokens(reference);
  const candSkus = skuTokens(candidate);
  if (setConflict(refSkus, candSkus)) conflicts.push("sku");
  else if (refSkus.size && intersectionCount(refSkus, candSkus)) reasons.push("sku");

  const refRegions = regionTokens(reference);
  const candRegions = regionTokens(candidate);
  if (setConflict(refRegions, candRegions)) conflicts.push("region");
  else if (refRegions.size && intersectionCount(refRegions, candRegions)) reasons.push("region");

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

// v2.4: a conservative identity key used only for grouping already-relevant offers.
// It intentionally returns null for vague titles, so SmartBuy does not merge unrelated products just because names look similar.
export function productIdentityKey(value: string): string | null {
  const brands = [...brandTokens(value)].sort();
  const families = [...familySignals(value)].sort();
  const capacities = [...capacityTokens(value)].filter(token => !token.startsWith("ram:")).sort();
  const variants = [...variantTokens(value)].sort();
  // Optional color / SKU / region signals are checked pairwise in evaluateTitleMatch().
  // They stay out of the base key so an offer that omits a color or region can still merge
  // with an otherwise identical offer that explicitly names it.
  if (!families.length && !capacities.length && !variants.length) return null;
  return [brands.join(",") || "_", families.join(",") || "_", capacities.join(",") || "_", variants.join(",") || "_"].join("|");
}

// v3.4: conservative normalization for the query sent to automatic sources.
// It fixes formatting/aliases and removes only shopping-intent noise; model tokens stay intact.
const QUERY_NOISE = new Set([
  "купити", "ціна", "ціни", "вартість", "дешево", "дешевше", "кращий", "краща", "найкращий", "найкраща",
  "україна", "україні", "ua", "грн", "uah", "новий", "нова", "нове", "нові", "бв", "бу", "вживаний", "вживана",
]);

export function normalizeSearchQuery(value: string) {
  const prepared = value
    .replace(/\bi[\s-]*phone\b/gi, "iphone")
    .replace(/мак[\s-]*бук/giu, "macbook")
    .replace(/mac[\s-]*book/gi, "macbook")
    .replace(/macbook\s+ейр/giu, "macbook air")
    .replace(/macbook\s+про/giu, "macbook pro")
    .replace(/\bpro[\s-]*max\b/gi, "pro max")
    .replace(/\btype[\s-]*c\b/gi, "type c");
  const normalized = canonical(prepared)
    .split(/\s+/)
    .filter(token => token && !QUERY_NOISE.has(token))
    .join(" ")
    .trim();
  return normalized || canonical(prepared);
}

export type ProductIdentityMeta = {
  key: string | null;
  label: string;
  signals: string[];
  hasStrongIdentity: boolean;
};

function readableSignal(signal: string) {
  if (signal.startsWith("iphone:")) return `iPhone ${signal.slice(7)}`;
  if (signal.startsWith("galaxy:")) return `Galaxy ${signal.slice(7).toUpperCase()}`;
  if (signal.startsWith("macbook:")) return signal.replace("macbook:", "MacBook ").replace(":", " ");
  if (signal.startsWith("macbookchip:")) return signal.slice(12).toUpperCase();
  if (signal.startsWith("model:")) return signal.slice(6).toUpperCase();
  if (signal.startsWith("ram:")) return `RAM ${signal.slice(4).toUpperCase()}`;
  if (/^\d+gb$/.test(signal)) return signal.toUpperCase();
  if (signal.startsWith("color:")) return signal.slice(6);
  if (signal.startsWith("sku:")) return `SKU ${signal.slice(4).toUpperCase()}`;
  if (signal.startsWith("region:")) return `регіон ${signal.slice(7).toUpperCase()}`;
  return signal.replace(":", " ");
}

export function productIdentityMeta(value: string): ProductIdentityMeta {
  const brands = [...brandTokens(value)].sort();
  const families = [...familySignals(value)].sort();
  const capacities = [...capacityTokens(value)].filter(token => !token.startsWith("ram:")).sort();
  const variants = [...variantTokens(value)].sort();
  const colors = [...colorTokens(value)].sort();
  const skus = [...skuTokens(value)].sort();
  const regions = [...regionTokens(value)].sort();
  const displayBrands = families.some(item => item.startsWith("iphone:")) && brands.includes("apple") ? brands.filter(item => item !== "iphone") : brands;
  const signals: string[] = [];
  if (brands.length) signals.push("бренд");
  if (families.length) signals.push("модель");
  if (variants.length) signals.push("версія");
  if (capacities.length) signals.push("пам’ять");
  if (colors.length) signals.push("колір");
  if (skus.length) signals.push("SKU");
  if (regions.length) signals.push("регіон");
  const parts = [...displayBrands, ...families, ...variants, ...capacities, ...colors.map(x => `color:${x}`), ...skus.map(x => `sku:${x}`), ...regions.map(x => `region:${x}`)].map(readableSignal);
  return {
    key: productIdentityKey(value),
    label: parts.join(" · ") || titleTokens(value).slice(0, 6).join(" ") || "товар",
    signals,
    hasStrongIdentity: families.length > 0 || capacities.length > 0 || variants.length > 0 || skus.length > 0,
  };
}
