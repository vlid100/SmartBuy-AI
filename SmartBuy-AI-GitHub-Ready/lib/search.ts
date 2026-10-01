import { products as previewProducts } from "@/lib/mock-data";
import { getSourceLinks, sourceCounts } from "@/lib/source-registry";
import { groupLiveOffers, searchUkraineLive } from "@/lib/live-market";
import type { MarketCoverage, Offer, Product, SearchApiResponse } from "@/lib/types";
import { snapshotProducts } from "@/lib/persistence";

export type MarketScope = "all" | "ukraine" | "private" | "international";
export type ConditionFilter = "all" | "new" | "used";

function offerMatchesScope(offer: Offer, scope: MarketScope) {
  if (scope === "ukraine") return offer.sellerType === "store";
  if (scope === "private") return offer.sellerType === "private";
  if (scope === "international") return offer.sellerType === "international";
  return true;
}

function offerMatchesCondition(offer: Offer, condition: ConditionFilter) {
  if (condition === "new") return offer.condition === "new";
  if (condition === "used") return offer.condition === "used" || offer.condition === "refurbished";
  return true;
}

function normalizeProduct(product: Product, offers: Offer[]): Product {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const sane = sorted.filter(offer => !offer.priceAnomaly);
  const anomalies = sorted.filter(offer => offer.priceAnomaly);
  const ordered = [...sane, ...anomalies];
  const best = sane[0] || sorted[0];
  const sourceNames = [...new Set(ordered.map(o => o.marketplace))];
  return { ...product, offers: ordered, bestPrice: best?.price ?? product.bestPrice, source: sourceNames.slice(0, 3).join(" · ") + (sourceNames.length > 3 ? ` +${sourceNames.length - 3}` : ""), productUrl: best?.url || product.productUrl };
}

function scoreTextMatch(product: Product, query: string) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = `${product.title} ${product.category} ${product.subtitle} ${product.highlights.join(" ")} ${product.aiSummary}`.toLowerCase();
  return tokens.filter(t => haystack.includes(t)).length / tokens.length;
}

function filterProducts(items: Product[], query: string, category: string, maxPrice: number | undefined, scope: MarketScope, condition: ConditionFilter, requireTextMatch = false) {
  return items.map(product => normalizeProduct(product, product.offers.filter(o => offerMatchesScope(o, scope) && offerMatchesCondition(o, condition))))
    .filter(product => product.offers.length > 0)
    .filter(product => !category || product.category.toLowerCase() === category.toLowerCase())
    .filter(product => !maxPrice || product.bestPrice <= maxPrice)
    .map(product => ({ product, textScore: scoreTextMatch(product, query) }))
    .filter(x => !requireTextMatch || !query.trim() || x.textScore >= 0.20)
    .sort((a, b) => b.product.offers.length - a.product.offers.length || b.textScore - a.textScore || a.product.bestPrice - b.product.bestPrice)
    .map(x => x.product);
}

function makeCoverage(products: Product[]): MarketCoverage {
  const offers = products.flatMap(p => p.offers);
  return {
    totalOffers: offers.length,
    storeOffers: offers.filter(o => o.sellerType === "store").length,
    privateOffers: offers.filter(o => o.sellerType === "private").length,
    newOffers: offers.filter(o => o.condition === "new").length,
    usedOffers: offers.filter(o => o.condition !== "new").length,
    sourceCount: new Set(offers.map(o => o.marketplace)).size,
  };
}

function filterSourceLinks(query: string, scope: MarketScope) {
  const sourceScope = scope === "international" ? "international" : scope === "all" ? "all" : "ukraine";
  const all = getSourceLinks(query, sourceScope);
  if (scope === "private") return all.filter(source => source.kind === "private");
  if (scope === "ukraine") return all.filter(source => source.region === "ukraine" && source.kind !== "private" && source.kind !== "international");
  return all;
}

export async function searchProducts(query: string, category = "", maxPrice?: number, scope: MarketScope = "all", condition: ConditionFilter = "all"): Promise<SearchApiResponse> {
  const sourceLinks = filterSourceLinks(query, scope);

  if (scope === "international") {
    return {
      query, count: 0, results: [], mode: "hybrid", provider: "AliExpress · Temu · Amazon",
      warning: "AliExpress, Temu та Amazon у v1.0.1 відкривають точний запит напряму. SmartBuy не показує вигадані міжнародні ціни: автоматичне порівняння з доставкою з’явиться лише після надійного офіційного каналу даних.",
      coverage: makeCoverage([]), sourceLinks,
    };
  }

  if (query.trim()) {
    if (scope === "private") {
      return {
        query, count: 0, results: [], mode: "hybrid",
        provider: condition === "new" ? "OLX · Shafa — приватні нові оголошення" : condition === "used" ? "OLX · Shafa — приватні б/в оголошення" : "OLX · Shafa — приватні оголошення",
        warning: "Приватні оголошення зараз не збираються автоматично з Vercel: OLX та Shafa не дали стабільного серверного доступу. Нижче SmartBuy відкриває той самий запит прямо на цих майданчиках.",
        coverage: makeCoverage([]), sourceLinks, sourceStatuses: [],
      };
    }

    const live = await searchUkraineLive(query.trim());
    const grouped = groupLiveOffers(live.offers, query.trim());
    const results = filterProducts(grouped, query, category, maxPrice, scope, condition, false);
    const liveOk = live.statuses.filter(s => s.state === "ok").length;
    const liveResponded = live.statuses.filter(s => s.state === "ok" || s.state === "empty").length;
    const conditionLabel = condition === "new" ? " · нові" : condition === "used" ? " · б/в" : "";
    const provider = scope === "ukraine"
      ? `Магазини України${conditionLabel} · ${sourceCounts.automatic} авто-джерела`
      : `Весь ринок${conditionLabel}: Україна + приватні оголошення + 3 міжнародні майданчики`;
    let warning: string | undefined;
    if (!results.length) {
      warning = "Автоматичні джерела цього разу не дали товарів, що відповідають вибраному ринку та стану. Інші майданчики нижче відкриваються напряму — SmartBuy не вигадує ціни й не обходить захист сайтів.";
    } else if (liveOk < sourceCounts.automatic) {
      warning = `Зібрані реальні пропозиції з доступних джерел. ${liveResponded}/${sourceCounts.automatic} автоматичних джерел відповіли; решта ринку доступна нижче через прямий пошук.`;
    } else {
      warning = `Зібрані реальні пропозиції з ${liveOk} автоматичних джерел. Решта українських і міжнародних майданчиків доступні через прямий пошук.`;
    }
    await snapshotProducts(results);
    return {
      query, count: results.length, results, mode: "hybrid",
      provider, warning, coverage: makeCoverage(results), sourceLinks, sourceStatuses: live.statuses,
    };
  }

  const preview = filterProducts(previewProducts, query, category, maxPrice, scope, condition, true);
  return {
    query, count: preview.length, results: preview, mode: "market-preview",
    provider: scope === "ukraine" ? "Україна" : scope === "private" ? "Від людей" : "Весь ринок",
    warning: "Введи конкретний товар. SmartBuy автоматично перевірить джерела, які стабільно доступні з Vercel, а для решти покаже прямі кнопки пошуку.",
    coverage: makeCoverage(preview), sourceLinks,
  };
}
