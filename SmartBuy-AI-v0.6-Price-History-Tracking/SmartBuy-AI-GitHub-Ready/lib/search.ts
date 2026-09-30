import { products as previewProducts } from "@/lib/mock-data";
import { getSourceLinks, sourceCounts } from "@/lib/source-registry";
import { groupLiveOffers, searchUkraineLive } from "@/lib/live-market";
import type { MarketCoverage, MarketFilter, Offer, Product, SearchApiResponse } from "@/lib/types";
import { snapshotProducts } from "@/lib/persistence";

function offerMatchesFilter(offer: Offer, filter: MarketFilter) {
  switch (filter) {
    case "new": return offer.condition === "new";
    case "used": return offer.condition === "used" || offer.condition === "refurbished";
    case "stores": return offer.sellerType === "store";
    case "private": return offer.sellerType === "private";
    case "international": return offer.sellerType === "international";
    default: return true;
  }
}

function normalizeProduct(product: Product, offers: Offer[]): Product {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const sourceNames = [...new Set(sorted.map(o => o.marketplace))];
  return { ...product, offers: sorted, bestPrice: sorted[0]?.price ?? product.bestPrice, source: sourceNames.slice(0, 3).join(" · ") + (sourceNames.length > 3 ? ` +${sourceNames.length - 3}` : ""), productUrl: sorted[0]?.url };
}

function scoreTextMatch(product: Product, query: string) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = `${product.title} ${product.category} ${product.subtitle} ${product.highlights.join(" ")} ${product.aiSummary}`.toLowerCase();
  return tokens.filter(t => haystack.includes(t)).length / tokens.length;
}

function filterProducts(items: Product[], query: string, category: string, maxPrice: number | undefined, marketFilter: MarketFilter, requireTextMatch = false) {
  return items.map(product => normalizeProduct(product, product.offers.filter(o => offerMatchesFilter(o, marketFilter))))
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

export async function searchProducts(query: string, category = "", maxPrice?: number, marketFilter: MarketFilter = "all"): Promise<SearchApiResponse> {
  const sourceScope = marketFilter === "international" ? "international" : "ukraine";
  const allSourceLinks = getSourceLinks(query, sourceScope);
  const sourceLinks = marketFilter === "private" ? allSourceLinks.filter(s => s.kind === "private") : marketFilter === "stores" ? allSourceLinks.filter(s => s.kind !== "private" && s.kind !== "international") : allSourceLinks;

  if (marketFilter === "international") {
    return {
      query, count: 0, results: [], mode: "hybrid", provider: "AliExpress · Temu · Amazon",
      warning: "Міжнародний блок ще працює як прямий пошук. Автоматичні інтеграції AliExpress, Temu та Amazon підключимо після українського ринку.",
      coverage: makeCoverage([]), sourceLinks,
    };
  }

  if (query.trim()) {
    if (marketFilter === "private") {
      return {
        query, count: 0, results: [], mode: "hybrid",
        provider: "OLX · Shafa — прямий пошук",
        warning: "Приватні оголошення зараз не збираються автоматично з Vercel: OLX та Shafa не дали стабільного серверного доступу. Нижче SmartBuy відкриває той самий запит прямо на цих майданчиках.",
        coverage: makeCoverage([]), sourceLinks, sourceStatuses: [],
      };
    }
    const live = await searchUkraineLive(query.trim());
    const grouped = groupLiveOffers(live.offers, query.trim());
    const results = filterProducts(grouped, query, category, maxPrice, marketFilter, false);
    const liveOk = live.statuses.filter(s => s.state === "ok").length;
    const liveResponded = live.statuses.filter(s => s.state === "ok" || s.state === "empty").length;
    const provider = `${sourceCounts.automatic} джерела автоматично · ${sourceCounts.direct} через прямий пошук`;
    let warning: string | undefined;
    if (!results.length) {
      warning = "Автоматичні джерела цього разу не дали розпізнаних товарів. Інші майданчики нижче відкриваються напряму — SmartBuy не вигадує ціни й не обходить захист сайтів.";
    } else if (liveOk < sourceCounts.automatic) {
      warning = `Зібрані реальні пропозиції з доступних джерел. ${liveResponded}/${sourceCounts.automatic} автоматичних джерел відповіли; решта українського ринку доступна нижче через прямий пошук.`;
    } else {
      warning = `Зібрані реальні пропозиції з ${liveOk} автоматичних джерел. Ще ${sourceCounts.direct} майданчиків доступні через прямий пошук, поки не підключимо дозволені API або товарні фіди.`;
    }
    await snapshotProducts(results);
    return {
      query, count: results.length, results, mode: "hybrid",
      provider, warning, coverage: makeCoverage(results), sourceLinks, sourceStatuses: live.statuses,
    };
  }

  const preview = filterProducts(previewProducts, query, category, maxPrice, marketFilter, true);
  return {
    query, count: preview.length, results: preview, mode: "market-preview",
    provider: `${sourceCounts.automatic} автоматично · ${sourceCounts.direct} прямий пошук`,
    warning: "Введи конкретний товар. SmartBuy автоматично перевірить джерела, які стабільно доступні з Vercel, а для решти покаже прямі кнопки пошуку.",
    coverage: makeCoverage(preview), sourceLinks,
  };
}
