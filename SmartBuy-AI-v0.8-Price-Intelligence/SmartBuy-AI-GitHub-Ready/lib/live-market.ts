import * as cheerio from "cheerio";
import type { ListingCondition, Offer, Product, SourceSearchStatus } from "@/lib/types";
import { liveSourceIds } from "@/lib/source-registry";
import { evaluateTitleMatch } from "@/lib/matching";

export type LiveSource = {
  id: string;
  name: string;
  sellerType: "store" | "private";
  trusted: boolean;
  buildUrl: (query: string) => string;
  selectors?: {
    card: string;
    title: string;
    price: string;
    link: string;
    image?: string;
    meta?: string;
  };
};

type SourceResult = { offers: Offer[]; status: SourceSearchStatus };

const enc = (value: string) => encodeURIComponent(value.trim());
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, "-").replace(/^-|-$/g, "");

export const liveSources: LiveSource[] = [
  {
    id: "olx", name: "OLX", sellerType: "private", trusted: false,
    buildUrl: q => `https://www.olx.ua/uk/list/q-${slug(q)}/`,
    selectors: { card: '[data-cy="l-card"], [data-testid="l-card"], article', title: 'h4, h6, [data-cy="ad-card-title"], [data-testid="ad-title"]', price: '[data-testid="ad-price"], p:contains("грн")', link: 'a[href]', image: 'img', meta: '[data-testid="location-date"]' }
  },
  {
    id: "rozetka", name: "Rozetka", sellerType: "store", trusted: true,
    buildUrl: q => `https://rozetka.com.ua/ua/search/?text=${enc(q)}`,
    selectors: { card: 'rz-catalog-tile, .goods-tile, [class*="catalog-grid"] li', title: '.goods-tile__title, .goods-tile__heading, [class*="title"]', price: '.goods-tile__price-value, .goods-tile__price, [class*="price"]', link: 'a.goods-tile__heading, a[href]', image: 'img' }
  },
  {
    id: "prom", name: "Prom.ua", sellerType: "store", trusted: true,
    buildUrl: q => `https://prom.ua/ua/search?search_term=${enc(q)}`,
    selectors: { card: '[data-qaid="product_block"], [data-testid*="product"], article', title: '[data-qaid="product_name"], [data-testid="product-name"], h2, h3', price: '[data-qaid="product_price"], [data-testid="product-price"], [class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "hotline", name: "Hotline", sellerType: "store", trusted: true,
    buildUrl: q => `https://hotline.ua/ua/sr/?q=${enc(q)}`,
    selectors: { card: '[class*="product"], [class*="list-item"], article', title: 'a[class*="title"], [class*="title"]', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "comfy", name: "COMFY", sellerType: "store", trusted: true,
    buildUrl: q => `https://comfy.ua/ua/search/?q=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="product-item"], article', title: '[class*="product-card__name"], [class*="product-item__name"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "foxtrot", name: "Foxtrot", sellerType: "store", trusted: true,
    buildUrl: q => `https://www.foxtrot.com.ua/uk/search?query=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="product-item"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "allo", name: "ALLO", sellerType: "store", trusted: true,
    buildUrl: q => `https://allo.ua/ua/catalogsearch/result/?q=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="product-item"], article', title: '[class*="product-name"], [class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "epicentr", name: "Епіцентр", sellerType: "store", trusted: true,
    buildUrl: q => `https://epicentrk.ua/ua/search/?q=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="card-product"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "moyo", name: "MOYO", sellerType: "store", trusted: true,
    buildUrl: q => `https://www.moyo.ua/ua/search/new/?q=${enc(q)}`,
    selectors: { card: '[class*="product-item"], [class*="product-card"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "telemart", name: "TELEMART", sellerType: "store", trusted: true,
    buildUrl: q => `https://telemart.ua/ua/search/?search=${enc(q)}`,
    selectors: { card: '[class*="product-item"], [class*="product-card"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "brain", name: "BRAIN", sellerType: "store", trusted: true,
    buildUrl: q => `https://brain.com.ua/ukr/search/?Search=${enc(q)}`,
    selectors: { card: '[class*="product"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "shafa", name: "Shafa", sellerType: "private", trusted: false,
    buildUrl: q => `https://shafa.ua/uk/search?search_text=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="item-card"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
];

export const automaticLiveSources = liveSources.filter(source => liveSourceIds.has(source.id));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 SmartBuyAI/0.8";
const PRICE_RE = /(?:₴|грн\.?|uah)?\s*([0-9][0-9\s\u00a0.,]{1,14})\s*(?:₴|грн\.?|uah)?/i;
const STOP = new Set(["купити","ціна","ціни","новий","нова","нове","бв","б/в","бу","україна","україні","доставка","товар","смартфон","ноутбук","телефон","оригінал"]);

function cleanText(value?: string | null) { return (value || "").replace(/\s+/g, " ").trim(); }
function parsePrice(value?: string | number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  const text = cleanText(String(value || ""));
  const match = text.match(PRICE_RE);
  if (!match) return null;
  const digits = match[1].replace(/[\s\u00a0]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const number = Number(digits);
  return Number.isFinite(number) && number >= 10 && number <= 20_000_000 ? Math.round(number) : null;
}
function absoluteUrl(url: string | undefined, base: string) {
  if (!url) return undefined;
  try { return new URL(url, base).toString(); } catch { return undefined; }
}
function imageFrom(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageFrom(value[0]);
  if (value && typeof value === "object") {
    const x = value as Record<string, unknown>;
    return imageFrom(x.url || x.contentUrl || x.src);
  }
  return undefined;
}
function conditionFrom(title: string, source: LiveSource): ListingCondition {
  const t = title.toLowerCase();
  if (/віднов|refurb|renewed/.test(t)) return "refurbished";
  if (/\bнов(ий|а|е|і)\b|new\b|запакован/.test(t)) return "new";
  return source.sellerType === "private" ? "used" : "new";
}
function titleTokens(value: string) {
  return value.toLowerCase().replace(/[^a-zа-яіїєґ0-9+.-]+/gi, " ").split(/\s+/).filter(x => x.length > 1 && !STOP.has(x));
}
function similarity(a: string, b: string) {
  const A = new Set(titleTokens(a)); const B = new Set(titleTokens(b));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const x of A) if (B.has(x)) hit++;
  return hit / Math.min(A.size, B.size);
}
function usefulTitle(title: string, query: string) {
  const t = cleanText(title);
  if (t.length < 3 || t.length > 220) return false;
  const q = cleanText(query);
  if (q.length < 3) return true;
  const match = evaluateTitleMatch(q, t);
  const qTokens = titleTokens(q);
  // For model-like queries (numbers/capacity/variants), require a reliable exact-family match.
  if (qTokens.some(token => /\d/.test(token)) || /\b(pro|max|ultra|plus|mini|air|lite|fe|se)\b/i.test(q)) return match.reliable;
  return match.reliable || similarity(t, q) >= 0.36;
}

function offerFrom(source: LiveSource, baseUrl: string, input: { title?: string; price?: unknown; url?: string; image?: unknown; meta?: string; externalId?: string }): Offer | null {
  const title = cleanText(input.title);
  const price = parsePrice(input.price as string | number | null);
  const url = absoluteUrl(input.url, baseUrl);
  if (!title || !price || !url) return null;
  return {
    id: `${source.id}-${input.externalId || Math.abs(hash(`${title}|${price}|${url}`))}`,
    externalId: input.externalId,
    title,
    store: source.name,
    marketplace: source.name,
    sellerName: source.sellerType === "private" ? "продавець" : source.name,
    sellerType: source.sellerType,
    condition: conditionFrom(title, source),
    price,
    currency: "UAH",
    delivery: source.sellerType === "private" ? "уточнити в оголошенні" : "дивись на сайті",
    warranty: source.sellerType === "private" ? "уточнити" : "дивись на сайті",
    trusted: source.trusted,
    city: source.sellerType === "private" ? cleanText(input.meta) || undefined : undefined,
    url,
    imageUrl: absoluteUrl(imageFrom(input.image), baseUrl),
    source: source.id,
  };
}

function hash(value: string) { let h = 0; for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0; return h; }

function parseCards(html: string, source: LiveSource, baseUrl: string): Offer[] {
  if (!source.selectors) return [];
  const $ = cheerio.load(html);
  const result: Offer[] = [];
  $(source.selectors.card).slice(0, 40).each((_, element) => {
    const card = $(element);
    const titleEl = card.find(source.selectors!.title).first();
    const linkEl = card.find(source.selectors!.link).first();
    const priceEl = card.find(source.selectors!.price).first();
    const imageEl = source.selectors!.image ? card.find(source.selectors!.image).first() : null;
    const metaEl = source.selectors!.meta ? card.find(source.selectors!.meta).first() : null;
    const offer = offerFrom(source, baseUrl, {
      title: titleEl.attr("title") || titleEl.text() || linkEl.attr("title") || linkEl.text(),
      price: priceEl.attr("content") || priceEl.attr("data-price") || priceEl.text(),
      url: linkEl.attr("href"),
      image: imageEl?.attr("src") || imageEl?.attr("data-src") || imageEl?.attr("data-lazy-src"),
      meta: metaEl?.text(),
      externalId: card.attr("data-id") || card.attr("data-product-id") || undefined,
    });
    if (offer) result.push(offer);
  });
  return result;
}

function valueAt(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}
function shallowPrice(obj: Record<string, unknown>): unknown {
  const direct = valueAt(obj, ["price", "currentPrice", "finalPrice", "priceValue", "lowPrice", "amount", "value"]);
  if (direct !== undefined) return direct;
  const offers = obj.offers;
  if (offers && typeof offers === "object" && !Array.isArray(offers)) return shallowPrice(offers as Record<string, unknown>);
  const ps = obj.priceSpecification;
  if (ps && typeof ps === "object" && !Array.isArray(ps)) return shallowPrice(ps as Record<string, unknown>);
  return undefined;
}
function shallowUrl(obj: Record<string, unknown>): string | undefined {
  const value = valueAt(obj, ["url", "href", "link", "canonicalUrl", "productUrl"]);
  if (typeof value === "string") return value;
  const offers = obj.offers;
  if (offers && typeof offers === "object" && !Array.isArray(offers)) return shallowUrl(offers as Record<string, unknown>);
  return undefined;
}
function parseJsonCandidates(html: string, source: LiveSource, baseUrl: string): Offer[] {
  const $ = cheerio.load(html);
  const results: Offer[] = [];
  const scripts = $('script[type="application/ld+json"], script#__NEXT_DATA__, script[type="application/json"]').toArray().slice(0, 35);
  let visited = 0;
  const seenObjects = new Set<object>();
  function visit(node: unknown, depth = 0) {
    if (visited++ > 18000 || depth > 13 || node === null || node === undefined) return;
    if (Array.isArray(node)) { for (const item of node.slice(0, 250)) visit(item, depth + 1); return; }
    if (typeof node !== "object") return;
    if (seenObjects.has(node as object)) return; seenObjects.add(node as object);
    const obj = node as Record<string, unknown>;
    const name = valueAt(obj, ["name", "title", "productName", "displayName"]);
    const price = shallowPrice(obj);
    const url = shallowUrl(obj);
    if (typeof name === "string" && price !== undefined && url) {
      const offer = offerFrom(source, baseUrl, { title: name, price, url, image: valueAt(obj, ["image", "imageUrl", "photo", "thumbnail", "picture"]), externalId: String(valueAt(obj, ["sku", "id", "productId", "externalId"]) || "") || undefined });
      if (offer) results.push(offer);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (["breadcrumbs","analytics","tracking","translations","description","html"].includes(key)) continue;
      if (typeof value === "object" && value !== null) visit(value, depth + 1);
    }
  }
  for (const el of scripts) {
    const text = $(el).html() || "";
    if (!text || text.length > 6_000_000) continue;
    try { visit(JSON.parse(text)); } catch {}
  }
  return results;
}

function dedupeOffers(offers: Offer[], query: string, max = 10) {
  const out: Offer[] = []; const keys = new Set<string>();
  for (const offer of offers) {
    if (!offer.title || !usefulTitle(offer.title, query)) continue;
    const key = `${offer.marketplace}|${offer.url || offer.title}|${offer.price}`;
    if (keys.has(key)) continue;
    keys.add(key); out.push(offer);
    if (out.length >= max) break;
  }
  return out;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "uk-UA,uk;q=0.9,en;q=0.6",
      },
    });
  } finally { clearTimeout(timeout); }
}

export async function searchSource(source: LiveSource, query: string): Promise<SourceResult> {
  const started = Date.now();
  const url = source.buildUrl(query);
  const timeoutMs = Math.max(1500, Math.min(Number(process.env.SMARTBUY_SOURCE_TIMEOUT_MS || 4500), 9000));
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    const durationMs = Date.now() - started;
    if (response.status === 403 || response.status === 401 || response.status === 429) {
      return { offers: [], status: { id: source.id, name: source.name, state: "blocked", offerCount: 0, durationMs, message: `HTTP ${response.status}` } };
    }
    if (!response.ok) return { offers: [], status: { id: source.id, name: source.name, state: "error", offerCount: 0, durationMs, message: `HTTP ${response.status}` } };
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("json")) {
      return { offers: [], status: { id: source.id, name: source.name, state: "empty", offerCount: 0, durationMs, message: "не HTML/JSON" } };
    }
    const html = await response.text();
    const offers = dedupeOffers([...parseCards(html, source, response.url || url), ...parseJsonCandidates(html, source, response.url || url)], query, Number(process.env.SMARTBUY_MAX_PER_SOURCE || 10));
    return { offers, status: { id: source.id, name: source.name, state: offers.length ? "ok" : "empty", offerCount: offers.length, durationMs, message: offers.length ? undefined : "сторінка відповіла, але картки не розпізнані" } };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "невідома помилка";
    const timeout = /abort|timeout/i.test(message);
    return { offers: [], status: { id: source.id, name: source.name, state: timeout ? "timeout" : "error", offerCount: 0, durationMs, message } };
  }
}

export async function searchUkraineLive(query: string) {
  if (process.env.SMARTBUY_LIVE_FETCH_ENABLED === "false") {
    return { offers: [] as Offer[], statuses: automaticLiveSources.map(s => ({ id: s.id, name: s.name, state: "not-run" as const, offerCount: 0, durationMs: 0, message: "live fetch вимкнено" })) };
  }
  const settled = await Promise.all(automaticLiveSources.map(source => searchSource(source, query)));
  return { offers: settled.flatMap(x => x.offers), statuses: settled.map(x => x.status) };
}

function normalizedTitle(title: string) { return titleTokens(title).slice(0, 12).join(" "); }
function groupSimilarity(a: string, b: string) { const ab = evaluateTitleMatch(normalizedTitle(a), normalizedTitle(b)); const ba = evaluateTitleMatch(normalizedTitle(b), normalizedTitle(a)); return { score: Math.min(ab.score, ba.score), reliable: ab.reliable && ba.reliable }; }
function productEmoji(category: string) {
  if (category === "Смартфони") return "📱";
  if (category === "Ноутбуки") return "💻";
  if (category === "Телевізори") return "📺";
  if (category === "Інструменти") return "🛠️";
  if (category === "Для дому") return "🏠";
  return "🛍️";
}
function guessCategory(text: string) {
  const t = text.toLowerCase();
  if (/iphone|samsung galaxy|pixel|смартф|телефон/.test(t)) return "Смартфони";
  if (/ноутбук|laptop|macbook|lenovo loq|asus tuf|acer nitro/.test(t)) return "Ноутбуки";
  if (/телевіз|tv\b|bravia|oled|qled/.test(t)) return "Телевізори";
  if (/дриль|шуруп|makita|bosch|dewalt|інструмент/.test(t)) return "Інструменти";
  if (/пилосос|roborock|xiaomi vacuum|пральн|холодиль|кавовар/.test(t)) return "Для дому";
  return "Інше";
}
function median(values: number[]) { const v = [...values].sort((a,b)=>a-b); const m=Math.floor(v.length/2); return v.length%2?v[m]:Math.round((v[m-1]+v[m])/2); }
function canonicalTitle(offers: Offer[]) {
  const titles = offers.map(o => o.title || "").filter(Boolean).sort((a,b)=>a.length-b.length);
  return titles[0] || "Товар";
}
function makeId(title: string) { return `${slug(title).slice(0,60) || "product"}-${Math.abs(hash(title)).toString(36)}`; }

export function groupLiveOffers(offers: Offer[], query: string): Product[] {
  const groups: Offer[][] = [];
  for (const offer of offers.sort((a,b)=>(a.title||"").localeCompare(b.title||""))) {
    const title = offer.title || "";
    let bestIndex = -1, bestScore = 0;
    for (let i=0;i<groups.length;i++) {
      const match = groupSimilarity(title, canonicalTitle(groups[i]));
      if (match.reliable && match.score > bestScore) { bestScore = match.score; bestIndex = i; }
    }
    if (bestIndex >= 0 && bestScore >= 0.60) groups[bestIndex].push(offer); else groups.push([offer]);
  }
  return groups.map(group => {
    const sorted = [...group].sort((a,b)=>a.price-b.price);
    const title = canonicalTitle(sorted);
    const prices = sorted.map(o=>o.price);
    const sources = new Set(sorted.map(o=>o.marketplace));
    const newOffers = sorted.filter(o=>o.condition==="new");
    const usedOffers = sorted.filter(o=>o.condition!=="new");
    const bestNew = newOffers[0]?.price;
    const bestUsed = usedOffers[0]?.price;
    const med = median(prices);
    const category = guessCategory(`${query} ${title}`);
    const saving = bestNew && bestUsed && bestUsed < bestNew ? Math.round((1-bestUsed/bestNew)*100) : 0;
    const highlights = [
      `${sorted.length} проп. · ${sources.size} джерел`,
      newOffers.length && usedOffers.length ? "є нові та б/в" : newOffers.length ? "нові пропозиції" : "приватний ринок",
      prices.length > 1 ? `діапазон ${Math.min(...prices).toLocaleString("uk-UA")}–${Math.max(...prices).toLocaleString("uk-UA")} ₴` : `${prices[0].toLocaleString("uk-UA")} ₴`,
    ];
    const spread = prices.length > 1 && med > 0 ? Math.round(((Math.max(...prices) - Math.min(...prices)) / med) * 100) : 0;
    const bestSource = sorted[0]?.marketplace || "джерело";
    const summary = saving
      ? `Найнижча знайдена ціна — ${prices[0].toLocaleString("uk-UA")} ₴ у ${bestSource}. Б/в стартує приблизно на ${saving}% дешевше за найнижчу нову пропозицію. Медіанна ціна — ${med.toLocaleString("uk-UA")} ₴${spread >= 20 ? `; розкид між пропозиціями великий (${spread}%), тому перевір комплектацію й стан.` : "."}`
      : `Найнижча знайдена ціна — ${prices[0].toLocaleString("uk-UA")} ₴ у ${bestSource}. Медіанна ціна серед ${sorted.length} пропозицій — ${med.toLocaleString("uk-UA")} ₴${sources.size === 1 ? ". Поки є лише одне автоматичне джерело, тому висновок попередній." : spread >= 20 ? `; розкид цін ${spread}%, варто звірити комплектацію.` : "."}`;
    return {
      id: makeId(title), title, category,
      subtitle: `${sources.size} джерел · ${sorted.length} пропозицій`,
      rating: 0, reviewCount: 0,
      image: productEmoji(category), imageUrl: sorted.find(o=>o.imageUrl)?.imageUrl,
      bestPrice: prices[0], score: Math.min(98, 72 + Math.min(sources.size,5)*4 + (newOffers.length&&usedOffers.length?5:0) + Math.min(sorted.filter(o=>o.trusted).length,3)*2),
      highlights,
      caution: usedOffers.length ? "Для приватних оголошень перевіряй стан товару, продавця та умови безпечної оплати перед покупкою." : undefined,
      aiSummary: summary,
      offers: sorted,
      source: [...sources].slice(0,3).join(" · ") + (sources.size>3?` +${sources.size-3}`:""),
      productUrl: sorted[0]?.url,
    } satisfies Product;
  }).sort((a,b)=>b.offers.length-a.offers.length || a.bestPrice-b.bestPrice);
}
