import { normalizeSearchQuery, titleTokens } from "@/lib/matching";

export type DiscoveryRegion = "ukraine" | "international";
export type DiscoveryVariant = { query: string; reason: string; language: "uk" | "ru" | "en" | "mixed" };

const SOFT_MODIFIERS = new Set([
  "окремо", "окремий", "окрема", "окреме", "окремі", "стояча", "стоячий", "стояче", "стоячі", "стоящая", "стоящий",
  "підлогова", "підлоговий", "напольная", "напольный", "настільна", "настільний", "настенная", "настінна",
  "складна", "складний", "розкладна", "розкладний", "універсальна", "універсальний", "компактна", "компактний",
  "велика", "великий", "маленька", "маленький", "сучасна", "сучасний", "красива", "красивий", "зручна", "зручний",
  "шт", "штук", "набір", "комплект", "для", "з", "із", "зі", "на", "в", "у", "по", "та", "і", "або",
]);

const PHRASE_EN: Array<[RegExp, string]> = [
  [/(\d+)\s*(?:ярус(?:на|ний|не|ні)?|ярусів|уровн(?:я|ей)?|рівн(?:я|і|ів)?)/giu, "$1 tier"],
  [/трьох?\s*ярус(?:на|ний|не|ні)?/giu, "3 tier"],
  [/окремо\s*стояч(?:а|ий|е|і)/giu, "freestanding"],
  [/підлогов(?:а|ий|е|і)/giu, "freestanding"],
  [/напольн(?:ая|ый|ое|ые)/giu, "freestanding"],
  [/стійк(?:а|и|у|ою)?\s+для\s+рушник(?:ів|и|а|ами)?/giu, "towel rack"],
  [/стойк(?:а|и|у|ой)?\s+для\s+полотен(?:ец|ца|цами)?/giu, "towel rack"],
  [/тримач(?:і|а|ем)?\s+для\s+рушник(?:ів|и|а)?/giu, "towel holder"],
  [/полиц(?:я|і|ю|ею)?\s+для\s+взутт(?:я)?/giu, "shoe rack"],
  [/підставк(?:а|и|у|ою)?\s+для\s+взутт(?:я)?/giu, "shoe rack"],
  [/сушарк(?:а|и|у)?\s+для\s+білизн(?:и|у)?/giu, "clothes drying rack"],
  [/органайзер\s+для\s+косметик(?:и|у)?/giu, "makeup organizer"],
  [/органайзер\s+для\s+інструмент(?:ів|и)?/giu, "tool organizer"],
  [/чохол\s+для/giu, "case for"],
  [/зарядн(?:ий|а|е)\s+пристрій/giu, "charger"],
  [/бездротов(?:ий|а|е)/giu, "wireless"],
];

const WORD_EN: Record<string, string> = {
  для: "for", окремо: "", стояча: "freestanding", стоячий: "freestanding", ярусна: "tier", ярусний: "tier", ярусів: "tier", рівні: "tier", рівнів: "tier",
  стійка: "rack", стойка: "rack", стійки: "rack", стойки: "rack", rack: "rack",
  рушник: "towel", рушників: "towel", рушники: "towel", полотенец: "towel", полотенца: "towel", towel: "towel",
  тримач: "holder", держатель: "holder", holder: "holder",
  підставка: "stand", подставка: "stand", stand: "stand",
  полиця: "shelf", полка: "shelf", shelf: "shelf",
  органайзер: "organizer", organizer: "organizer",
  контейнер: "container", коробка: "box", кошик: "basket", корзина: "basket",
  столик: "table", стіл: "table", стол: "table", стілець: "chair", стул: "chair",
  лампа: "lamp", світильник: "lamp", светильник: "lamp",
  килимок: "mat", коврик: "mat", килим: "rug", ковер: "rug",
  пляшка: "bottle", бутылка: "bottle", термос: "thermos",
  сумка: "bag", рюкзак: "backpack", гаманець: "wallet", кошелек: "wallet",
  щітка: "brush", щетка: "brush", швабра: "mop",
  кухня: "kitchen", кухні: "kitchen", ванна: "bathroom", ванної: "bathroom", ванной: "bathroom",
  авто: "car", автомобіль: "car", машину: "car", машины: "car",
  дитячий: "kids", дитяча: "kids", детский: "kids", детская: "kids",
  складаний: "folding", складна: "folding", складной: "folding", складная: "folding",
  металевий: "metal", металева: "metal", металлический: "metal", деревянный: "wooden", деревяний: "wooden",
  чорний: "black", чорна: "black", белый: "white", білий: "white", біла: "white",
  електричний: "electric", електрична: "electric", электрический: "electric",
  акумуляторний: "cordless", аккумуляторный: "cordless",
  пилосос: "vacuum", пылесос: "vacuum", фен: "hair dryer", чайник: "kettle", кавоварка: "coffee maker",
  навушники: "headphones", наушники: "headphones", колонка: "speaker", миша: "mouse", мышь: "mouse",
  клавіатура: "keyboard", клавиатура: "keyboard", монітор: "monitor", монитор: "monitor",
};

const UA_RU: Record<string, string> = {
  стійка: "стойка", стійки: "стойка", рушників: "полотенец", рушники: "полотенца", рушник: "полотенце",
  тримач: "держатель", підставка: "подставка", полиця: "полка", взуття: "обуви", білизни: "белья",
  підлогова: "напольная", окремо: "отдельно", стояча: "стоящая", складаний: "складной", складна: "складная",
  чорний: "черный", чорна: "черная", білий: "белый", біла: "белая", дитячий: "детский", дитяча: "детская",
};

function clean(value: string) {
  return value.replace(/[–—]/g, "-").replace(/(\d+)\s*-\s*(?=[а-яіїєґa-z])/giu, "$1 ").replace(/\s+/g, " ").trim();
}

function add(out: DiscoveryVariant[], query: string, reason: string, language: DiscoveryVariant["language"]) {
  const value = clean(query);
  if (value.length < 2) return;
  if (out.some(item => item.query.toLocaleLowerCase("uk-UA") === value.toLocaleLowerCase("uk-UA"))) return;
  out.push({ query: value, reason, language });
}

function tokenList(query: string) {
  return clean(query).split(/\s+/).filter(Boolean);
}

function coreAroundFor(query: string) {
  const tokens = tokenList(query);
  const markers = new Set(["для", "for"]);
  for (let i = 1; i < tokens.length - 1; i++) {
    if (!markers.has(tokens[i].toLowerCase())) continue;
    const before = tokens.slice(Math.max(0, i - 1), i);
    const after = tokens.slice(i + 1, Math.min(tokens.length, i + 4));
    const phrase = [...before, tokens[i], ...after].join(" ");
    if (phrase.length >= 5) return phrase;
  }
  return "";
}

function relaxedCore(query: string) {
  const tokens = tokenList(query);
  const kept = tokens.filter(token => {
    const lower = token.toLowerCase();
    if (/^\d+$/.test(lower)) return false;
    if (/ярус|рівн|уровн/.test(lower)) return false;
    return !SOFT_MODIFIERS.has(lower);
  });
  return kept.join(" ");
}

function ukrainianToRussian(query: string) {
  return tokenList(query).map(token => UA_RU[token.toLowerCase()] || token).join(" ");
}

export function localEnglishQuery(query: string) {
  let value = clean(query).toLowerCase();
  for (const [pattern, replacement] of PHRASE_EN) value = value.replace(pattern, replacement);
  const tokens = tokenList(value).map(token => WORD_EN[token] || token);
  return clean(tokens.join(" "));
}

function tailCore(query: string) {
  const tokens = tokenList(query);
  const useful = tokens.filter(token => !SOFT_MODIFIERS.has(token.toLowerCase()));
  return useful.slice(-4).join(" ");
}

/**
 * Discovery variants are deliberately broader than Variant Guard.
 * They are used to FIND candidates; strict model/SKU/colour checks still happen later.
 */
export function buildDiscoveryQueries(query: string, region: DiscoveryRegion = "ukraine", max = 6): DiscoveryVariant[] {
  const base = clean(normalizeSearchQuery(query));
  if (!base) return [];
  const out: DiscoveryVariant[] = [];
  add(out, base, "точний нормалізований запит", "uk");

  const coreFor = coreAroundFor(base);
  if (coreFor && coreFor !== base) add(out, coreFor, "ядро товару навколо «для»", "uk");

  const relaxed = relaxedCore(base);
  if (relaxed && relaxed !== base) add(out, relaxed, "прибрано описові слова", "uk");

  const tail = tailCore(base);
  if (tail && tail !== base && tail !== relaxed) add(out, tail, "короткий товарний запит", "uk");

  const ru = ukrainianToRussian(coreFor || relaxed || base);
  if (ru && ru !== (coreFor || relaxed || base)) add(out, ru, "російський варіант для UA-маркетплейсів", "ru");

  const enBase = localEnglishQuery(base);
  const enCore = localEnglishQuery(coreFor || relaxed || base);
  if (region === "international") {
    // International marketplaces generally understand English better than Ukrainian.
    const intl: DiscoveryVariant[] = [];
    if (enBase && enBase !== base) add(intl, enBase, "англійський опис товару", "en");
    if (enCore && enCore !== enBase && enCore !== base) add(intl, enCore, "короткий англійський товарний запит", "en");
    for (const item of out) add(intl, item.query, item.reason, item.language);
    return intl.slice(0, Math.max(1, max));
  }

  if (enCore && enCore !== base && enCore !== coreFor) add(out, enCore, "англійський синонім", "en");
  return out.slice(0, Math.max(1, max));
}

export function discoveryQuerySummary(query: string) {
  return buildDiscoveryQueries(query, "ukraine", 6).map(item => item.query);
}

let translationCache = new Map<string, { expiresAt: number; value: string }>();

/** Best-effort Ukrainian/Russian -> English translation for international discovery. */
export async function translateDiscoveryQuery(query: string, timeoutMs = 1200) {
  const local = localEnglishQuery(query);
  if (!/[а-яіїєґ]/iu.test(local) || process.env.SMARTBUY_PUBLIC_TRANSLATION_ENABLED === "false") return local;
  const key = query.trim().toLowerCase();
  const cached = translationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(300, timeoutMs));
  try {
    const endpoint = process.env.SMARTBUY_TRANSLATION_API_URL || "https://api.mymemory.translated.net/get";
    const url = new URL(endpoint);
    url.searchParams.set("q", query.slice(0, 450));
    url.searchParams.set("langpair", "uk|en");
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!response.ok) return local;
    const data = await response.json() as { responseData?: { translatedText?: string } };
    const translated = clean(String(data?.responseData?.translatedText || ""));
    const value = translated && !/MYMEMORY WARNING/i.test(translated) ? translated : local;
    translationCache.set(key, { expiresAt: Date.now() + 6 * 60 * 60_000, value });
    if (translationCache.size > 120) translationCache = new Map([...translationCache.entries()].slice(-80));
    return value;
  } catch {
    return local;
  } finally {
    clearTimeout(timer);
  }
}
