import { products as previewProducts } from "@/lib/mock-data";
import { getSourceLinks, sourceCounts } from "@/lib/source-registry";
import { dedupeLiveOffers, groupLiveOffers, searchUkraineLive } from "@/lib/live-market";
import { searchInternationalLive } from "@/lib/international-market";
import type { MarketCoverage, Offer, Product, SearchApiResponse, SourceSearchStatus } from "@/lib/types";
import { parseSmartIntent, rankProductsForIntent } from "@/lib/smart-intent";
import { enrichProductSpecs, specsAsText } from "@/lib/specs";
import { enrichProductReviews } from "@/lib/review-intelligence";
import { normalizeSearchQuery } from "@/lib/matching";
import { queryExpansionSummary } from "@/lib/query-expansion";
import { searchWebDiscovery } from "@/lib/web-discovery";

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
  return enrichProductReviews(enrichProductSpecs({ ...product, offers: ordered, bestPrice: best?.price ?? product.bestPrice, source: sourceNames.slice(0, 3).join(" · ") + (sourceNames.length > 3 ? ` +${sourceNames.length - 3}` : ""), productUrl: best?.url || product.productUrl }));
}

function scoreTextMatch(product: Product, query: string) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = `${product.title} ${product.category} ${product.subtitle} ${product.highlights.join(" ")} ${specsAsText(product)} ${product.aiSummary}`.toLowerCase();
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

export type SearchExecutionOptions = { deadlineAt?: number };

type SearchWave = { offers: Offer[]; statuses: SourceSearchStatus[]; partial: boolean };

function failedWave(id: string, name: string, message: string): SearchWave {
  return {
    offers: [],
    statuses: [{ id, name, state: "error", offerCount: 0, durationMs: 0, message, tier: "probe" }],
    partial: true,
  };
}

function appendPartialWarning(warning: string | undefined, hasResults: boolean) {
  const note = hasResults
    ? "Показано вже знайдені підтверджені пропозиції; повільні або заблоковані джерела не затримують результат."
    : "Частина повільних або заблокованих джерел не встигла в безпечний бюджет пошуку. Прямі посилання на джерела залишаються доступними.";
  return warning ? `${warning} ${note}` : note;
}

export async function searchProducts(query: string, category = "", maxPrice?: number, scope: MarketScope = "all", condition: ConditionFilter = "all", smart = false, options: SearchExecutionOptions = {}): Promise<SearchApiResponse> {
  const started = Date.now();
  // The route itself may live for longer, but the market core intentionally returns earlier.
  // This leaves headroom for JSON serialization/cold starts and prevents a browser timeout.
  const configuredBudget = Math.max(8_000, Math.min(Number(process.env.SMARTBUY_SEARCH_CORE_TIMEOUT_MS || 26_000), 32_000));
  const overallDeadline = Math.min(started + configuredBudget, options.deadlineAt || Number.POSITIVE_INFINITY);
  const waveDeadline = (budgetMs: number) => Math.min(overallDeadline, Date.now() + budgetMs);

  const intent = smart && query.trim() ? parseSmartIntent(query.trim()) : undefined;
  const rawEffectiveQuery = intent?.derivedQuery || query;
  const effectiveQuery = normalizeSearchQuery(rawEffectiveQuery);
  const effectiveCategory = category || intent?.category || "";
  const effectiveMaxPrice = maxPrice || intent?.budget;
  const effectiveScope: MarketScope = scope === "all" && intent?.marketScope && intent.marketScope !== "all" ? intent.marketScope : scope;
  const effectiveCondition: ConditionFilter = condition === "all" && intent?.condition && intent.condition !== "all" ? intent.condition : condition;
  const sourceLinks = filterSourceLinks(effectiveQuery, effectiveScope);

  if (query.trim()) {
    if (effectiveScope === "international") {
      const discoveryPromise = searchWebDiscovery(effectiveQuery.trim(), "international", waveDeadline(5_000));
      let international: SearchWave;
      try {
        international = await searchInternationalLive(effectiveQuery.trim(), { deadlineAt: waveDeadline(9_500) });
      } catch {
        international = failedWave("international-wave", "International Live", "міжнародна хвиля завершилась помилкою; прямі посилання доступні");
      }
      const discovery = await discoveryPromise.catch(() => ({ hits: [], status: { id: "web-discovery", name: "Web Discovery", state: "error" as const, offerCount: 0, durationMs: 0, message: "fallback discovery error", tier: "probe" as const }, partial: true }));
      const deduped = dedupeLiveOffers(international.offers);
      const grouped = groupLiveOffers(deduped.offers, effectiveQuery.trim(), true);
      let results = filterProducts(grouped, effectiveQuery, effectiveCategory, effectiveMaxPrice, effectiveScope, effectiveCondition, false);
      if (intent) results = rankProductsForIntent(results, intent);
      const ok = international.statuses.filter(status => status.state === "ok").length;
      const blocked = international.statuses.filter(status => status.state === "blocked").length;
      const quality = {
        originalQuery: query, normalizedQuery: effectiveQuery, queryChanged: effectiveQuery.toLowerCase() !== rawEffectiveQuery.trim().toLowerCase(),
        rawOfferCount: international.offers.length, uniqueOfferCount: deduped.offers.length, duplicateOffersRemoved: deduped.removed,
        productGroupCount: grouped.length, highConfidenceGroupCount: grouped.filter(product => (product.grouping?.confidence || 0) >= 90).length,
        ambiguousGroupCount: grouped.filter(product => (product.grouping?.confidence || 0) > 0 && (product.grouping?.confidence || 0) < 78).length,
        identityCoverage: grouped.length ? Math.round((grouped.filter(product => Boolean(product.grouping?.identityKey)).length / grouped.length) * 100) : 0,
        averageGroupingConfidence: grouped.length ? Math.round(grouped.reduce((sum, product) => sum + (product.grouping?.confidence || 0), 0) / grouped.length) : 0,
      };
      let warning = results.length
        ? `International Live: ${ok} з 3 джерел дали підтверджені картки. Оригінальна валюта збережена, ціна нормалізована в гривню; доставка й наявність підтягуються лише коли майданчик реально віддає ці поля.`
        : `Міжнародні майданчики перевірені автоматично, але підтверджених карток не отримано${blocked ? ` · ${blocked} джерел заблокували серверний доступ` : ""}. Прямі посилання нижче залишаються доступними — SmartBuy не обходить CAPTCHA і не вигадує ціни.`;
      if (!results.length && discovery.hits.length) warning = `Маркетплейси не віддали підтверджені ціни, але Discovery Search знайшов ${discovery.hits.length} релевантних сторінок товарів. Відкрий їх нижче — SmartBuy не приховує товар лише через блокування автоматичного читання.`;
      if (international.partial || discovery.partial) warning = appendPartialWarning(warning, results.length > 0 || discovery.hits.length > 0);
      return {
        query, count: results.length, results, mode: "hybrid", provider: "Discovery Search · AliExpress · Temu · Amazon",
        warning, coverage: makeCoverage(results), sourceLinks, sourceStatuses: [...international.statuses, discovery.status], discoveryHits: discovery.hits, smart: intent, quality,
        partial: international.partial || discovery.partial, durationMs: Date.now() - started,
      };
    }

    const liveMode = effectiveScope === "private" ? "private" : effectiveScope === "all" ? "all" : "stores";
    const ukrainePromise = searchUkraineLive(effectiveQuery.trim(), liveMode, { deadlineAt: waveDeadline(effectiveScope === "private" ? 10_000 : 20_000) });
    const internationalPromise = effectiveScope === "all"
      ? searchInternationalLive(effectiveQuery.trim(), { deadlineAt: waveDeadline(9_000) })
      : Promise.resolve({ offers: [] as Offer[], statuses: [] as SourceSearchStatus[], partial: false });
    const discoveryPromise = searchWebDiscovery(effectiveQuery.trim(), effectiveScope, waveDeadline(5_000));

    const [ukraineSettled, internationalSettled, discoverySettled] = await Promise.allSettled([ukrainePromise, internationalPromise, discoveryPromise]);
    const ukraine: SearchWave = ukraineSettled.status === "fulfilled"
      ? ukraineSettled.value
      : failedWave("ukraine-wave", "Український ринок", "одна з серверних хвиль завершилась помилкою; інші результати збережено");
    const international: SearchWave = internationalSettled.status === "fulfilled"
      ? internationalSettled.value
      : failedWave("international-wave", "International Live", "міжнародна хвиля завершилась помилкою; українські результати збережено");
    const discovery = discoverySettled.status === "fulfilled"
      ? discoverySettled.value
      : { hits: [], status: { id: "web-discovery", name: "Web Discovery", state: "error" as const, offerCount: 0, durationMs: 0, message: "fallback discovery error", tier: "probe" as const }, partial: true };

    const partial = ukraine.partial || international.partial || discovery.partial || ukraineSettled.status === "rejected" || internationalSettled.status === "rejected" || discoverySettled.status === "rejected";
    const live = { offers: [...ukraine.offers, ...international.offers], statuses: [...ukraine.statuses, ...international.statuses, discovery.status] };
    const deduped = dedupeLiveOffers(live.offers);
    const grouped = groupLiveOffers(deduped.offers, effectiveQuery.trim(), true);
    const groupingScores = grouped.map(product => product.grouping?.confidence || 0);
    const expansionStatuses = live.statuses.filter(status => (status.queryVariantsTried || 0) > 1);
    const expansionHits = expansionStatuses.filter(status => status.state === "ok" && status.queryExpanded);
    const queryVariants = queryExpansionSummary(effectiveQuery);
    const quality = {
      originalQuery: query,
      normalizedQuery: effectiveQuery,
      queryChanged: effectiveQuery.toLowerCase() !== rawEffectiveQuery.trim().toLowerCase(),
      rawOfferCount: live.offers.length,
      uniqueOfferCount: deduped.offers.length,
      duplicateOffersRemoved: deduped.removed,
      productGroupCount: grouped.length,
      highConfidenceGroupCount: grouped.filter(product => (product.grouping?.confidence || 0) >= 90).length,
      ambiguousGroupCount: grouped.filter(product => (product.grouping?.confidence || 0) > 0 && (product.grouping?.confidence || 0) < 78).length,
      identityCoverage: grouped.length ? Math.round((grouped.filter(product => Boolean(product.grouping?.identityKey)).length / grouped.length) * 100) : 0,
      averageGroupingConfidence: groupingScores.length ? Math.round(groupingScores.reduce((sum, score) => sum + score, 0) / groupingScores.length) : 0,
      queryVariants,
      queryExpansionSources: expansionStatuses.length,
      queryExpansionHits: expansionHits.length,
      maxQueryVariantsTried: live.statuses.reduce((max, status) => Math.max(max, status.queryVariantsTried || 0), 0),
    };
    let results = filterProducts(grouped, effectiveQuery, effectiveCategory, effectiveMaxPrice, effectiveScope, effectiveCondition, false);
    if (intent) results = rankProductsForIntent(results, intent);

    const relevantStatuses = live.statuses;
    const liveOk = relevantStatuses.filter(s => s.state === "ok").length;
    const stableOk = relevantStatuses.filter(s => s.tier === "stable" && s.state === "ok").length;
    const probeOk = relevantStatuses.filter(s => s.tier === "probe" && s.state === "ok").length;
    const attempted = relevantStatuses.filter(s => s.state !== "not-run").length;
    const blocked = relevantStatuses.filter(s => s.state === "blocked").length;
    const expanded = relevantStatuses.filter(s => s.routerPhase === "expanded").length;
    const cooldown = relevantStatuses.filter(s => s.routerPhase === "cooldown").length;
    const conditionLabel = effectiveCondition === "new" ? " · нові" : effectiveCondition === "used" ? " · б/в" : "";
    const provider = intent
      ? `Розумний підбір · ${effectiveCategory || "увесь ринок"}${intent.budget ? ` · до ${intent.budget.toLocaleString("uk-UA")} ₴` : ""}`
      : effectiveScope === "private"
        ? `Приватні оголошення${conditionLabel} · OLX / Shafa авто-проба`
        : effectiveScope === "ukraine"
          ? `Магазини України${conditionLabel} · ${sourceCounts.stable} стабільні + до ${sourceCounts.probe} пробних джерел`
          : `Весь ринок${conditionLabel}: магазини + приватні оголошення + International Live`;

    let warning: string | undefined;
    if (!results.length) {
      if (discovery.hits.length) {
        warning = `Discovery Search знайшов ${discovery.hits.length} релевантних сторінок товарів, але магазини не віддали достатньо даних для підтвердженої ціни. Товар не приховано — відкрий знайдені сторінки нижче.`;
      } else if (effectiveScope === "private") {
        warning = `OLX/Shafa не дали підтверджених карток у цій серверній перевірці. SmartBuy не вигадує оголошення: відкрий точний запит нижче напряму. Перевірено ${attempted} приватних джерела.`;
      } else if (intent) {
        warning = `За розумним запитом «${effectiveQuery}» автоматичні джерела не дали достатньо точних результатів. Спробуй трохи збільшити бюджет або прибрати одну з вимог.`;
      } else {
        warning = `Автоматична хвиля перевірила ${attempted} джерел, але не знайшла достатньо точних карток. Інші майданчики нижче відкриваються напряму — SmartBuy не обходить захист сайтів і не вигадує ціни.`;
      }
    } else {
      const parts = [`${liveOk} джерел дали релевантні пропозиції`, `${stableOk} стабільних`, `${probeOk} пробних`];
      if (expanded) parts.push(`${expanded} джерел у додатковій хвилі`);
      if (cooldown) parts.push(`${cooldown} на адаптивній паузі`);
      if (blocked) parts.push(`${blocked} заблокували серверний доступ`);
      warning = `Live Market + Adaptive Router + Query Expansion: ${parts.join(" · ")}${expansionHits.length ? ` · ${expansionHits.length} джерел знайшли товар через додатковий варіант запиту` : ""}. Прямі кнопки залишаються доступними для всього ринку.`;
    }
    if (partial) warning = appendPartialWarning(warning, results.length > 0);

    return {
      query, count: results.length, results, mode: "hybrid",
      provider, warning, coverage: makeCoverage(results), sourceLinks, sourceStatuses: live.statuses, discoveryHits: discovery.hits, smart: intent, quality,
      partial, durationMs: Date.now() - started,
    };
  }

  let preview = filterProducts(previewProducts, query, effectiveCategory, effectiveMaxPrice, effectiveScope, effectiveCondition, true);
  if (intent) preview = rankProductsForIntent(preview, intent);
  return {
    query, count: preview.length, results: preview, mode: "market-preview",
    provider: effectiveScope === "ukraine" ? "Україна" : effectiveScope === "private" ? "Від людей" : "Весь ринок",
    warning: "Введи конкретний товар або скористайся «Розумним підбором». SmartBuy автоматично перевірить джерела, які стабільно доступні з Vercel, а для решти покаже прямі кнопки пошуку.",
    coverage: makeCoverage(preview), sourceLinks, smart: intent, partial: false, durationMs: Date.now() - started,
  };
}
