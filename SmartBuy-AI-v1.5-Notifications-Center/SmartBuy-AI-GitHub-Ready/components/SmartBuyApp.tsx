"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Bell, Bookmark, Check, ChevronDown, Clock3, Cloud, CloudOff, Copy, ExternalLink, GitCompareArrows,
  Globe2, Heart, Info, MapPin, Play, RefreshCw, Search, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Star, Store, Target, Trash2, TrendingDown, UserRound, X, Zap
} from "lucide-react";
import type { Offer, PricePoint, Product, SavedSearch, SearchApiResponse, SmartNotification, SourceLink, SourceSearchStatus } from "@/lib/types";
import { bestProductMatch } from "@/lib/matching";

const categories = [
  { value: "Усі", label: "Всі категорії" },
  { value: "Смартфони", label: "Смартфони" },
  { value: "Ноутбуки", label: "Ноутбуки" },
  { value: "Телевізори", label: "Телевізори" },
  { value: "Для дому", label: "Для дому" },
  { value: "Інструменти", label: "Інструменти" },
];
type MarketScope = "all" | "ukraine" | "private" | "international";
type ConditionFilter = "all" | "new" | "used";
const marketScopeTabs: { id: MarketScope; label: string; icon: "all" | "store" | "private" | "world" }[] = [
  { id: "all", label: "Весь ринок", icon: "all" },
  { id: "ukraine", label: "Україна", icon: "store" },
  { id: "private", label: "Від людей", icon: "private" },
  { id: "international", label: "Закордон", icon: "world" },
];
const conditionTabs: { id: ConditionFilter; label: string }[] = [
  { id: "all", label: "Усі товари" },
  { id: "new", label: "Нові" },
  { id: "used", label: "Б/в" },
];
const quickSearches = ["iPhone 17 256GB", "Lenovo LOQ 15", "Makita DHP486", "Roborock Q8 Max+"];
const money = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 });

type Tab = "search" | "compare" | "watch" | "saved" | "notifications";


function bestResultPrice(results: Product[]) {
  const prices = results.map(product => Number(product.bestPrice)).filter(price => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function savedSearchLabel(item: SavedSearch) {
  const parts = [item.marketScope === "all" ? "Весь ринок" : item.marketScope === "ukraine" ? "Україна" : item.marketScope === "private" ? "Від людей" : "Закордон"];
  if (item.conditionFilter === "new") parts.push("нові");
  if (item.conditionFilter === "used") parts.push("б/в");
  if (item.category !== "Усі") parts.push(item.category);
  if (item.maxPrice) parts.push(`до ${Number(item.maxPrice).toLocaleString("uk-UA")} ₴`);
  return parts.join(" · ");
}

function bestByCondition(offers: Offer[], condition: "new" | "used") {
  const matches = offers.filter(o => !o.priceAnomaly && (condition === "new" ? o.condition === "new" : o.condition !== "new"));
  return matches.length ? Math.min(...matches.map(o => o.price)) : null;
}

function conditionLabel(condition: Offer["condition"]) {
  if (condition === "new") return "Нове";
  if (condition === "refurbished") return "Відновлене";
  return "Б/в";
}

type OfferViewFilter = "all" | "new" | "used" | "store" | "private";
type OfferSort = "value" | "recommended" | "price" | "confidence";

function validOffers(offers: Offer[]) {
  const sane = offers.filter(offer => !offer.priceAnomaly && Number.isFinite(offer.price) && offer.price > 0);
  return sane.length ? sane : offers.filter(offer => Number.isFinite(offer.price) && offer.price > 0);
}

function medianOfferPrice(offers: Offer[]) {
  const prices = validOffers(offers).map(offer => offer.price).sort((a, b) => a - b);
  if (!prices.length) return null;
  const middle = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
}

function bestBySellerType(offers: Offer[], sellerType: Offer["sellerType"]) {
  const matching = validOffers(offers).filter(offer => offer.sellerType === sellerType);
  return matching.length ? [...matching].sort((a, b) => a.price - b.price)[0] : null;
}

function marketMetrics(offers: Offer[]) {
  const sane = validOffers(offers);
  const median = medianOfferPrice(offers);
  const best = sane.length ? [...sane].sort((a, b) => a.price - b.price)[0] : null;
  const sources = new Set(sane.map(offer => offer.marketplace)).size;
  const savingVsMedian = best && median && median > best.price ? median - best.price : 0;
  return { best, median, sources, savingVsMedian };
}


function offerRiskFlags(offer: Offer, median: number | null) {
  const flags: string[] = [];
  if (offer.priceAnomaly) flags.push("цінова аномалія");
  if ((offer.matchConfidence || 0) > 0 && (offer.matchConfidence || 0) < 90) flags.push("перевір модель");
  if (!offer.verifiedSeller && !offer.trusted) flags.push("неперевірений продавець");
  if (median && offer.price < median * 0.72) flags.push("дуже низька ціна");
  if (offer.sellerType === "private" && !offer.warranty) flags.push("без гарантії");
  return flags;
}

function offerValueScore(offer: Offer, median: number | null) {
  let score = 62;
  const confidence = offer.matchConfidence || 0;
  if (confidence >= 98) score += 16;
  else if (confidence >= 95) score += 13;
  else if (confidence >= 90) score += 9;
  else if (confidence > 0) score -= 10;

  if (offer.verifiedSeller) score += 8;
  else if (offer.trusted) score += 5;

  if (median && median > 0) {
    const ratio = offer.price / median;
    if (ratio >= 0.84 && ratio <= 0.97) score += 12;
    else if (ratio > 0.97 && ratio <= 1.04) score += 7;
    else if (ratio < 0.72) score -= 20;
    else if (ratio > 1.18) score -= 10;
  }

  if (offer.delivery) score += 2;
  if (offer.warranty) score += 3;
  if (offer.priceAnomaly) score -= 35;
  return Math.max(1, Math.min(100, Math.round(score)));
}

function valueScoreLabel(score: number) {
  if (score >= 90) return "дуже вигідно";
  if (score >= 80) return "вигідно";
  if (score >= 68) return "нормально";
  return "перевірити";
}

function marketJumpLinks(title: string) {
  const q = encodeURIComponent(title.trim());
  const slug = title.trim().toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, "-").replace(/^-|-$/g, "");
  return [
    { name: "OLX", kind: "private", url: `https://www.olx.ua/uk/list/q-${slug}/` },
    { name: "AliExpress", kind: "international", url: `https://www.aliexpress.com/wholesale?SearchText=${q}` },
    { name: "Temu", kind: "international", url: `https://www.temu.com/search_result.html?search_key=${q}` },
    { name: "Amazon", kind: "international", url: `https://www.amazon.com/s?k=${q}` },
  ] as const;
}

function scopeIcon(id: MarketScope) {
  if (id === "ukraine") return <Store size={16}/>;
  if (id === "private") return <UserRound size={16}/>;
  if (id === "international") return <Globe2 size={16}/>;
  return <ShoppingBag size={16}/>;
}

function makeSyncKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

function getPriceInsight(points: PricePoint[], currentPrice: number) {
  if (points.length < 2) return { label: "Ще мало історії", detail: "SmartBuy накопичує дані. Після кількох перевірок оцінка стане точнішою.", tone: "neutral" };
  const prices = points.map(point => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const vsAverage = average ? Math.round(((currentPrice - average) / average) * 100) : 0;
  if (currentPrice <= min * 1.02) return { label: "Дуже хороша ціна", detail: `Поточна ціна майже на історичному мінімумі. Від середньої вона ${Math.abs(vsAverage)}% ${vsAverage <= 0 ? "нижча" : "вища"}.`, tone: "good" };
  if (currentPrice <= average * 0.95) return { label: "Хороша ціна", detail: `Зараз приблизно на ${Math.abs(vsAverage)}% нижче історичної середньої.`, tone: "good" };
  if (currentPrice <= average * 1.05) return { label: "Нормальна ціна", detail: "Поточна ціна близька до звичайного рівня за накопиченою історією.", tone: "normal" };
  if (currentPrice >= max * 0.98) return { label: "Ціна висока", detail: `Зараз приблизно на ${Math.abs(vsAverage)}% вище історичної середньої і близько до максимуму.`, tone: "high" };
  return { label: "Вище середньої", detail: `Зараз приблизно на ${Math.abs(vsAverage)}% вище історичної середньої.`, tone: "high" };
}

function PriceHistoryChart({ points, currentPrice }: { points: PricePoint[]; currentPrice: number }) {
  const safe: PricePoint[] = points.length ? points : [{ date: new Date().toISOString(), price: currentPrice }];
  const prices = safe.map(p => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const insight = getPriceInsight(safe, currentPrice);
  const span = Math.max(1, max - min);
  const coords = safe.map((p, i) => ({
    x: safe.length === 1 ? 50 : 4 + (i / (safe.length - 1)) * 92,
    y: 88 - ((p.price - min) / span) * 72,
  }));
  const polyline = coords.map(point => `${point.x},${point.y}`).join(" ");
  const recent = [...safe].slice(-5).reverse();
  return (
    <div className="priceHistoryCard">
      <div className={`historySignal ${insight.tone}`}><TrendingDown size={14}/><div><b>{insight.label}</b><span>{insight.detail}</span></div></div>
      <div className="historyStats four"><div><span>Зараз</span><b>{money.format(currentPrice)}</b></div><div><span>Мінімум</span><b>{money.format(min)}</b></div><div><span>Середня</span><b>{money.format(average)}</b></div><div><span>Максимум</span><b>{money.format(max)}</b></div></div>
      <svg className="priceChart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Графік історії ціни">
        <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
        {coords.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="1.8" fill="currentColor" vectorEffect="non-scaling-stroke"/>)}
      </svg>
      <div className="historyAxis"><span>{safe.length > 1 ? new Date(safe[0].date).toLocaleDateString("uk-UA") : "перший запис"}</span><span>сьогодні</span></div>
      <div className="historyRows">
        {recent.map((point, index) => <div key={`${point.date}-${index}`}><span>{new Date(point.date).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><b>{money.format(point.price)}</b><small>{point.offerCount ? `${point.offerCount} проп. · ` : ""}{point.sourceCount ? `${point.sourceCount} джер.` : ""}</small></div>)}
      </div>
    </div>
  );
}

export default function SmartBuyApp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Усі");
  const [marketScope, setMarketScope] = useState<MarketScope>("all");
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [compare, setCompare] = useState<Product[]>([]);
  const [watching, setWatching] = useState<Record<string, Product>>({});
  const [maxPrice, setMaxPrice] = useState("");
  const [tab, setTab] = useState<Tab>("search");
  const [provider, setProvider] = useState("Весь ринок: Україна + приватні оголошення + закордон");
  const [warning, setWarning] = useState<string | undefined>();
  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceSearchStatus[]>([]);
  const [coverage, setCoverage] = useState<SearchApiResponse["coverage"]>({ totalOffers: 0, storeOffers: 0, privateOffers: 0, newOffers: 0, usedOffers: 0, sourceCount: 0 });
  const [selected, setSelected] = useState<Product | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [targetPrices, setTargetPrices] = useState<Record<string, number>>({});
  const [syncKey, setSyncKey] = useState("");
  const [syncInput, setSyncInput] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState<boolean | null>(null);
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null);
  const [cloudDetail, setCloudDetail] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyCloud, setHistoryCloud] = useState(false);
  const [trackingRefresh, setTrackingRefresh] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState("");
  const [offerViewFilter, setOfferViewFilter] = useState<OfferViewFilter>("all");
  const [offerSort, setOfferSort] = useState<OfferSort>("value");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedCheckLoading, setSavedCheckLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [savedCloudReady, setSavedCloudReady] = useState<boolean | null>(null);
  const [savedCloudMessage, setSavedCloudMessage] = useState("");
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [notificationCloudReady, setNotificationCloudReady] = useState<boolean | null>(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  const selectedOffers = useMemo(() => {
    if (!selected) return [] as Offer[];
    let items = selected.offers.filter(offer => {
      if (offerViewFilter === "new") return offer.condition === "new";
      if (offerViewFilter === "used") return offer.condition !== "new";
      if (offerViewFilter === "store") return offer.sellerType === "store";
      if (offerViewFilter === "private") return offer.sellerType === "private";
      return true;
    });
    const median = medianOfferPrice(selected.offers);
    items = [...items].sort((a, b) => {
      if (offerSort === "value") return offerValueScore(b, median) - offerValueScore(a, median) || a.price - b.price;
      if (offerSort === "price") return Number(a.priceAnomaly) - Number(b.priceAnomaly) || a.price - b.price;
      if (offerSort === "confidence") return Number(a.priceAnomaly) - Number(b.priceAnomaly) || (b.matchConfidence || 0) - (a.matchConfidence || 0) || a.price - b.price;
      return Number(a.priceAnomaly) - Number(b.priceAnomaly)
        || Number(Boolean(b.verifiedSeller)) - Number(Boolean(a.verifiedSeller))
        || Number(Boolean(b.trusted)) - Number(Boolean(a.trusted))
        || (b.matchConfidence || 0) - (a.matchConfidence || 0)
        || a.price - b.price;
    });
    return items;
  }, [selected, offerViewFilter, offerSort]);

  const selectedMetrics = useMemo(() => selected ? marketMetrics(selected.offers) : null, [selected]);
  const selectedBestValue = useMemo(() => {
    if (!selected) return null;
    const median = medianOfferPrice(selected.offers);
    const candidates = validOffers(selected.offers).filter(offer => !offer.priceAnomaly);
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => offerValueScore(b, median) - offerValueScore(a, median) || a.price - b.price)[0];
  }, [selected]);
  const selectedRiskCount = useMemo(() => {
    if (!selected) return 0;
    const median = medianOfferPrice(selected.offers);
    return selected.offers.filter(offer => offerRiskFlags(offer, median).length > 0).length;
  }, [selected]);

  useEffect(() => {
    let key = "";
    try {
      const saved = localStorage.getItem("smartbuy-watchlist-v3");
      if (saved) setWatching(JSON.parse(saved));
      const savedTargets = localStorage.getItem("smartbuy-targets-v1");
      if (savedTargets) setTargetPrices(JSON.parse(savedTargets));
      const savedQueries = localStorage.getItem("smartbuy-saved-searches-v1");
      if (savedQueries) setSavedSearches(JSON.parse(savedQueries));
      key = localStorage.getItem("smartbuy-sync-key-v1") || makeSyncKey();
      localStorage.setItem("smartbuy-sync-key-v1", key);
      setSyncKey(key);
    } catch {}
    if (typeof window !== "undefined" && "Notification" in window) setBrowserPermission(Notification.permission);
    if (key) void initializeCloud(key);
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (browserPermission !== "granted" || notifications.length === 0 || typeof window === "undefined" || !("Notification" in window)) return;
    let shown: string[] = [];
    try { shown = JSON.parse(localStorage.getItem("smartbuy-browser-notified-v1") || "[]"); } catch {}
    const seen = new Set(shown);
    const fresh = notifications.filter(item => !item.readAt && !seen.has(item.id)).slice(0, 3);
    for (const item of fresh) {
      try { new Notification(item.title, { body: item.body, tag: item.id }); } catch {}
      seen.add(item.id);
    }
    try { localStorage.setItem("smartbuy-browser-notified-v1", JSON.stringify(Array.from(seen).slice(-100))); } catch {}
  }, [notifications, browserPermission]);

  useEffect(() => {
    setOfferViewFilter("all");
    setOfferSort("value");
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/history?product=${encodeURIComponent(selected.id)}&days=90`, { cache: "no-store" });
        const data = await response.json();
        if (!cancelled) {
          setHistory(Array.isArray(data.points) ? data.points : []);
          setHistoryCloud(Boolean(data.cloud));
        }
      } catch {
        if (!cancelled) { setHistory(selected.priceHistory || []); setHistoryCloud(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  async function runSearch(nextQuery = query, nextCategory = category, nextScope = marketScope, nextCondition = conditionFilter, nextMaxPrice = maxPrice) {
    setLoading(true);
    setTab("search");
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (nextCategory !== "Усі") params.set("category", nextCategory);
      if (nextMaxPrice) params.set("maxPrice", nextMaxPrice);
      params.set("scope", nextScope);
      params.set("condition", nextCondition);
      const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store" });
      const data: SearchApiResponse = await response.json();
      setProducts(data.results || []);
      setProvider(data.provider || "Україна");
      setWarning(data.warning);
      setSourceLinks(data.sourceLinks || []);
      setSourceStatuses(data.sourceStatuses || []);
      setCoverage(data.coverage || { totalOffers: 0, storeOffers: 0, privateOffers: 0, newOffers: 0, usedOffers: 0, sourceCount: 0 });
      setSearched(Boolean(nextQuery.trim() || nextCategory !== "Усі" || nextMaxPrice || nextScope !== "all" || nextCondition !== "all"));
    } catch {
      setProducts([]);
      setSourceLinks([]);
      setSourceStatuses([]);
      setWarning("Не вдалося виконати пошук. Перевір підключення й спробуй ще раз.");
    } finally {
      setLoading(false);
    }
  }

  function selectCategory(value: string) {
    setCategory(value);
    void runSearch(query, value, marketScope, conditionFilter);
  }

  function selectMarketScope(value: MarketScope) {
    setMarketScope(value);
    void runSearch(query, category, value, conditionFilter);
  }

  function selectCondition(value: ConditionFilter) {
    setConditionFilter(value);
    void runSearch(query, category, marketScope, value);
  }

  function persistSavedSearches(next: SavedSearch[]) {
    setSavedSearches(next);
    try { localStorage.setItem("smartbuy-saved-searches-v1", JSON.stringify(next)); } catch {}
  }

  async function loadCloudSavedSearches(key = syncKey, mergeLocal = true) {
    if (!key) return;
    try {
      const response = await fetchWithRetry(`/api/saved-searches?token=${encodeURIComponent(key)}`, undefined, 3);
      const data = await response.json();
      if (data.cloud && data.tableReady === true) {
        setSavedCloudReady(true);
        setSavedCloudMessage("Збережені пошуки синхронізуються через Supabase і перевіряються автоматично раз на день.");
        const cloudItems = Array.isArray(data.items) ? data.items as SavedSearch[] : [];
        if (mergeLocal) {
          let localItems: SavedSearch[] = [];
          try { localItems = JSON.parse(localStorage.getItem("smartbuy-saved-searches-v1") || "[]"); } catch {}
          const byFingerprint = new Map<string, SavedSearch>();
          for (const item of cloudItems) byFingerprint.set(`${item.query.toLowerCase()}|${item.category}|${item.marketScope}|${item.conditionFilter}|${item.maxPrice}`, item);
          for (const item of localItems) {
            const fp = `${item.query.toLowerCase()}|${item.category}|${item.marketScope}|${item.conditionFilter}|${item.maxPrice}`;
            if (!byFingerprint.has(fp)) {
              byFingerprint.set(fp, item);
              void syncSavedSearchToCloud(item, key, false);
            }
          }
          persistSavedSearches(Array.from(byFingerprint.values()).sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()));
        } else {
          persistSavedSearches(cloudItems);
        }
      } else if (data.cloud && data.tableReady === false) {
        setSavedCloudReady(false);
        setSavedCloudMessage("Для хмарних Saved Searches треба один раз запустити SQL-файл supabase/v1.4_saved_searches.sql. Поки що вони працюють локально.");
      } else {
        setSavedCloudReady(false);
        setSavedCloudMessage("Saved Searches зараз працюють локально.");
      }
    } catch {
      setSavedCloudMessage("Не вдалося оновити хмарні Saved Searches. Локальна копія не втрачена.");
    }
  }

  async function syncSavedSearchToCloud(item: SavedSearch, key = syncKey, announce = true) {
    if (!key) return false;
    try {
      const response = await fetchWithRetry("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: key, search: item }),
      }, 3);
      const data = await response.json();
      if (data.cloud && data.tableReady === true) {
        setSavedCloudReady(true);
        if (data.item?.id) {
          setSavedSearches(current => current.map(search => search.id === item.id ? data.item : search));
        }
        if (announce) setSavedCloudMessage("Збережено в Supabase. Пошук буде доступний на інших пристроях з тим самим кодом синхронізації.");
        return true;
      }
      if (data.cloud && data.tableReady === false) {
        setSavedCloudReady(false);
        setSavedCloudMessage("Запусти supabase/v1.4_saved_searches.sql — після цього Saved Searches стануть хмарними.");
      }
    } catch {
      if (announce) setSavedCloudMessage("Хмарне збереження тимчасово не відповіло. Пошук залишився локально.");
    }
    return false;
  }

  async function saveCurrentSearch() {
    const cleanQuery = query.trim();
    if (!cleanQuery && category === "Усі" && marketScope === "all" && conditionFilter === "all" && !maxPrice) {
      setSavedMessage("Спочатку введи запит або вибери фільтр.");
      return;
    }
    const fingerprint = `${cleanQuery.toLowerCase()}|${category}|${marketScope}|${conditionFilter}|${maxPrice}`;
    const existing = savedSearches.find(item => `${item.query.toLowerCase()}|${item.category}|${item.marketScope}|${item.conditionFilter}|${item.maxPrice}` === fingerprint);
    const currentBest = bestResultPrice(products);
    if (existing) {
      const updated: SavedSearch = { ...existing, enabled: true, lastBestPrice: currentBest ?? existing.lastBestPrice, updatedAt: new Date().toISOString() };
      persistSavedSearches(savedSearches.map(item => item.id === existing.id ? updated : item));
      void syncSavedSearchToCloud(updated);
      setSavedMessage("Цей пошук уже збережено.");
      return;
    }
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: SavedSearch = {
      id,
      query: cleanQuery,
      category,
      marketScope,
      conditionFilter,
      maxPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastBestPrice: currentBest ?? undefined,
      resultCount: products.length,
      offerCount: coverage.totalOffers,
      enabled: true,
      lastCheckStatus: "never",
    };
    persistSavedSearches([item, ...savedSearches]);
    void syncSavedSearchToCloud(item);
    setSavedMessage("Пошук збережено. Поточна найкраща ціна стала базовою.");
  }

  async function openSavedSearch(item: SavedSearch) {
    setQuery(item.query);
    setCategory(item.category);
    setMarketScope(item.marketScope);
    setConditionFilter(item.conditionFilter);
    setMaxPrice(item.maxPrice);
    await runSearch(item.query, item.category, item.marketScope, item.conditionFilter, item.maxPrice);
  }

  async function checkSavedSearchLocal(item: SavedSearch) {
    try {
      const params = new URLSearchParams();
      if (item.query.trim()) params.set("q", item.query.trim());
      if (item.category !== "Усі") params.set("category", item.category);
      if (item.maxPrice) params.set("maxPrice", item.maxPrice);
      params.set("scope", item.marketScope);
      params.set("condition", item.conditionFilter);
      const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const data: SearchApiResponse = await response.json();
      const best = bestResultPrice(data.results || []);
      const previous = item.lastBestPrice;
      const drop = best && previous && best < previous ? previous - best : 0;
      return { ...item, previousBestPrice: previous, lastBestPrice: best ?? previous, lastCheckedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), resultCount: data.results?.length || 0, offerCount: data.coverage?.totalOffers || 0, dealDrop: drop || 0, lastCheckStatus: best ? "ok" : "no_live_data" } as SavedSearch;
    } catch (error) {
      return { ...item, lastCheckedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastCheckStatus: "error", lastError: error instanceof Error ? error.message : "network_error" } as SavedSearch;
    }
  }

  async function checkAllSavedSearches() {
    if (savedCheckLoading || savedSearches.length === 0) return;
    setSavedCheckLoading(true);
    setSavedMessage("Перевіряю збережені пошуки…");
    try {
      if (savedCloudReady === true && syncKey) {
        const response = await fetchWithRetry("/api/saved-searches/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: syncKey }),
        }, 2);
        const data = await response.json();
        if (response.ok && data.tableReady === true) {
          await loadCloudSavedSearches(syncKey, false);
          await loadNotifications(syncKey);
          setSavedMessage(data.deals ? `Знайдено ${data.deals} пошук(и) з нижчою ціною.` : "Перевірено в хмарі. Нових знижень поки немає.");
          return;
        }
      }
      const next: SavedSearch[] = [];
      for (const item of savedSearches) next.push(item.enabled ? await checkSavedSearchLocal(item) : item);
      persistSavedSearches(next);
      const deals = next.filter(item => (item.dealDrop || 0) > 0).length;
      setSavedMessage(deals ? `Знайдено ${deals} пошук(и) з нижчою ціною.` : "Перевірено локально. Нових знижень поки немає.");
    } finally {
      setSavedCheckLoading(false);
    }
  }

  async function checkOneSavedSearch(item: SavedSearch) {
    setSavedMessage(`Перевіряю: ${item.query || item.category}…`);
    if (savedCloudReady === true && syncKey) {
      try {
        const response = await fetchWithRetry("/api/saved-searches/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: syncKey, id: item.id }),
        }, 2);
        const data = await response.json();
        if (response.ok && Array.isArray(data.items) && data.items[0]) {
          const updated = data.items[0] as SavedSearch;
          persistSavedSearches(savedSearches.map(search => search.id === item.id ? updated : search));
          await loadNotifications(syncKey);
          setSavedMessage((updated.dealDrop || 0) > 0 ? `Ціна нижча на ${money.format(updated.dealDrop || 0)}.` : "Перевірено в хмарі. Нової нижчої ціни немає.");
          return;
        }
      } catch {}
    }
    const updated = await checkSavedSearchLocal(item);
    persistSavedSearches(savedSearches.map(search => search.id === item.id ? updated : search));
    void syncSavedSearchToCloud(updated, syncKey, false);
    if ((updated.dealDrop || 0) > 0 && updated.lastBestPrice) {
      await createManualNotification({ dedupeKey: `saved:${updated.id}:price:${Math.round(updated.lastBestPrice)}`, kind: "deal_alert", title: `Ціна впала на ${money.format(updated.dealDrop || 0)}`, body: `${updated.query || updated.category}: зараз від ${money.format(updated.lastBestPrice)}.`, entityType: "saved_search", entityId: updated.id, price: updated.lastBestPrice, previousPrice: updated.previousBestPrice });
      await loadNotifications(syncKey);
    }
    setSavedMessage((updated.dealDrop || 0) > 0 ? `Ціна нижча на ${money.format(updated.dealDrop || 0)}.` : "Перевірено. Нової нижчої ціни немає.");
  }

  async function removeSavedSearch(id: string) {
    persistSavedSearches(savedSearches.filter(item => item.id !== id));
    if (syncKey && savedCloudReady === true) {
      try {
        await fetchWithRetry("/api/saved-searches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, id }) }, 2);
      } catch {}
    }
  }

  async function toggleSavedSearch(id: string) {
    const current = savedSearches.find(item => item.id === id);
    if (!current) return;
    const updated: SavedSearch = { ...current, enabled: !current.enabled, updatedAt: new Date().toISOString() };
    persistSavedSearches(savedSearches.map(item => item.id === id ? updated : item));
    void syncSavedSearchToCloud(updated, syncKey, false);
  }

  function toggleCompare(product: Product) {
    setCompare(current => {
      const exists = current.some(x => x.id === product.id);
      if (exists) return current.filter(x => x.id !== product.id);
      if (current.length >= 3) return current;
      return [...current, product];
    });
  }

  async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3) {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(url, { ...init, cache: "no-store" });
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("network_error");
  }

  async function loadNotifications(key = syncKey) {
    if (!key) return;
    try {
      const response = await fetchWithRetry(`/api/notifications?token=${encodeURIComponent(key)}`, undefined, 3);
      const data = await response.json();
      if (data.cloud && data.tableReady === true) {
        setNotificationCloudReady(true);
        setNotificationMessage("Сповіщення зберігаються в Supabase і синхронізуються між пристроями.");
        setNotifications(Array.isArray(data.items) ? data.items : []);
      } else if (data.cloud && data.tableReady === false) {
        setNotificationCloudReady(false);
        setNotificationMessage("Запусти supabase/v1.5_notifications.sql — після цього центр сповіщень стане хмарним.");
      } else {
        setNotificationCloudReady(false);
        setNotificationMessage("Центр сповіщень потребує підключеного Supabase.");
      }
    } catch {
      setNotificationMessage("Не вдалося оновити центр сповіщень. Спробуй ще раз трохи пізніше.");
    }
  }

  async function requestBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) { setBrowserPermission("unsupported"); return; }
    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
    } catch {
      setBrowserPermission(Notification.permission);
    }
  }

  async function markAllNotificationsRead() {
    if (!syncKey || notifications.every(item => item.readAt)) return;
    try {
      await fetchWithRetry("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, all: true }) }, 2);
      const now = new Date().toISOString();
      setNotifications(current => current.map(item => item.readAt ? item : { ...item, readAt: now }));
    } catch {}
  }

  async function markNotificationRead(id: string) {
    const current = notifications.find(item => item.id === id);
    if (!current || current.readAt || !syncKey) return;
    try {
      await fetchWithRetry("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, id }) }, 2);
      const now = new Date().toISOString();
      setNotifications(items => items.map(item => item.id === id ? { ...item, readAt: now } : item));
    } catch {}
  }

  async function removeNotification(id: string) {
    setNotifications(items => items.filter(item => item.id !== id));
    if (!syncKey) return;
    try { await fetchWithRetry("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, id }) }, 2); } catch {}
  }

  async function createManualNotification(event: { dedupeKey: string; kind: "price_drop" | "target_hit" | "deal_alert" | "info"; title: string; body: string; entityType?: "product" | "saved_search"; entityId?: string; price?: number; previousPrice?: number }) {
    if (!syncKey || notificationCloudReady === false) return;
    try {
      await fetchWithRetry("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, event }) }, 2);
    } catch {}
  }

  async function initializeCloud(key: string) {
    try {
      const response = await fetchWithRetry("/api/cloud/status", undefined, 3);
      const status = await response.json();
      const configured = Boolean(status?.configured);
      setCloudConfigured(configured);
      if (!configured) {
        setCloudEnabled(false);
        setSavedCloudReady(false);
        setSavedCloudMessage("Supabase не налаштований для цього deployment — Saved Searches працюють локально.");
        const missing: string[] = [];
        if (!status?.hasUrl) missing.push("SUPABASE_URL");
        if (!status?.hasServerKey) missing.push("SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY");
        setCloudDetail(missing.length ? `Vercel не бачить: ${missing.join(" + ")}` : "Supabase не налаштований для цього deployment.");
        return;
      }
      setCloudEnabled(true);
      setCloudDetail(status?.keySource === "secret" ? "Supabase підключено через серверний Secret key." : "Supabase підключено через серверний service role key.");
      await loadCloudWatchlist(key, true);
      await loadCloudSavedSearches(key, true);
      await loadNotifications(key);
    } catch {
      // A temporary request failure must not silently reclassify an already-configured project as local.
      setCloudDetail("Не вдалося перевірити статус хмари. Онови сторінку — SmartBuy повторить спробу.");
      setSavedCloudMessage("Не вдалося перевірити хмару для Saved Searches. Локальна копія залишається доступною.");
    }
  }

  async function loadCloudWatchlist(key = syncKey, configured = cloudConfigured === true) {
    if (!key) return;
    setSyncing(true);
    try {
      const response = await fetchWithRetry(`/api/watchlist?token=${encodeURIComponent(key)}`, undefined, 3);
      const data = await response.json();
      if (data.cloud) {
        setCloudConfigured(true);
        setCloudEnabled(true);
        setCloudDetail("Хмарна синхронізація готова. Товари й історія зберігаються в Supabase.");
      } else if (!configured) {
        setCloudEnabled(false);
      }
      if (data.cloud && Array.isArray(data.items)) {
        const cloudProducts: Record<string, Product> = {};
        const cloudTargets: Record<string, number> = {};
        for (const item of data.items) {
          if (item?.product?.id) cloudProducts[item.product.id] = item.product;
          if (item?.product?.id && Number(item.targetPrice) > 0) cloudTargets[item.product.id] = Number(item.targetPrice);
        }
        setWatching(current => {
          const merged = { ...current, ...cloudProducts };
          localStorage.setItem("smartbuy-watchlist-v3", JSON.stringify(merged));
          return merged;
        });
        setTargetPrices(current => {
          const merged = { ...current, ...cloudTargets };
          localStorage.setItem("smartbuy-targets-v1", JSON.stringify(merged));
          return merged;
        });
      }
    } catch {
      if (configured) {
        setCloudEnabled(true);
        setCloudDetail("Supabase налаштовано, але запит синхронізації тимчасово не відповів. Локальні дані не втрачено.");
      } else {
        setCloudDetail("Не вдалося з'єднатися з API хмари. SmartBuy повторить перевірку після оновлення сторінки.");
      }
    } finally { setSyncing(false); }
  }

  async function saveWatchToCloud(product: Product, targetPrice?: number) {
    if (!syncKey) return;
    try {
      const response = await fetchWithRetry("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, product, targetPrice }) }, 3);
      const data = await response.json();
      if (data.cloud) { setCloudConfigured(true); setCloudEnabled(true); }
      else if (cloudConfigured === false) setCloudEnabled(false);
    } catch {
      if (cloudConfigured) setCloudDetail("Хмара налаштована, але останнє збереження не підтвердилося. Дані залишилися локально й можна повторити.");
    }
  }

  async function toggleWatch(product: Product) {
    const exists = Boolean(watching[product.id]);
    setWatching(current => {
      const next = { ...current };
      if (exists) delete next[product.id]; else next[product.id] = product;
      localStorage.setItem("smartbuy-watchlist-v3", JSON.stringify(next));
      return next;
    });
    if (!syncKey) return;
    try {
      const response = await fetchWithRetry("/api/watchlist", {
        method: exists ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exists ? { token: syncKey, productKey: product.id } : { token: syncKey, product, targetPrice: targetPrices[product.id] }),
      }, 3);
      const data = await response.json();
      if (data.cloud) { setCloudConfigured(true); setCloudEnabled(true); }
      else if (cloudConfigured === false) setCloudEnabled(false);
    } catch {
      if (cloudConfigured) setCloudDetail("Хмара налаштована, але остання зміна не підтвердилася сервером. Локальна копія збережена.");
    }
  }

  function updateTarget(product: Product, value: string) {
    const amount = Number(value.replace(/\D/g, ""));
    setTargetPrices(current => {
      const next = { ...current };
      if (amount > 0) next[product.id] = amount; else delete next[product.id];
      localStorage.setItem("smartbuy-targets-v1", JSON.stringify(next));
      return next;
    });
  }

  async function commitTarget(product: Product) {
    if (!watching[product.id]) {
      setWatching(current => { const next = { ...current, [product.id]: product }; localStorage.setItem("smartbuy-watchlist-v3", JSON.stringify(next)); return next; });
    }
    await saveWatchToCloud(product, targetPrices[product.id]);
  }

  async function refreshTrackedNow() {
    if (!syncKey || !cloudEnabled || trackingRefresh) return;
    const tracked: Product[] = Object.values(watching);
    if (!tracked.length) return;
    setTrackingRefresh(true);
    setTrackingMessage(`Перевіряю 0/${tracked.length}…`);
    try {
      let checked = 0, updated = 0, notFound = 0, errors = 0;
      const failures: string[] = [];
      const refreshedLocal: Record<string, Product> = { ...watching };

      // v0.7.3: manual tracking reuses /api/search — the same route already used
      // by the working SmartBuy search. This avoids a second long-running Vercel
      // tracking function and makes manual checks much more reliable.
      for (let index = 0; index < tracked.length; index += 1) {
        const product = tracked[index];
        const checkedAt = new Date().toISOString();
        try {
          const params = new URLSearchParams({ q: product.title, market: "all" });
          const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store" });
          const data: SearchApiResponse = await response.json().catch(() => ({ results: [] } as unknown as SearchApiResponse));
          if (!response.ok) throw new Error(`search_http_${response.status}`);

          const matched = bestProductMatch(product, Array.isArray(data.results) ? data.results : []);
          const match = matched?.product || null;
          checked += 1;
          if (!match) {
            notFound += 1;
            const updatedProduct: Product = {
              ...product,
              tracking: {
                lastCheckedAt: checkedAt,
                status: "not_found",
                message: "SmartBuy відкинув схожі результати, бо не зміг підтвердити точну модель/модифікацію.",
                previousBestPrice: product.bestPrice,
                lastSeenPrice: product.bestPrice,
                sourceNames: [],
                offerCount: 0,
              },
            };
            refreshedLocal[product.id] = updatedProduct;
            await fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: syncKey, product: updatedProduct, targetPrice: targetPrices[product.id] }),
            }).catch(() => undefined);
          } else {
            updated += 1;
            const updatedProduct: Product = {
              ...match,
              id: product.id,
              title: product.title,
              category: product.category || match.category,
              image: match.image || product.image,
              imageUrl: match.imageUrl || product.imageUrl,
              tracking: {
                lastCheckedAt: checkedAt,
                status: "ok",
                message: `Перевірено ${match.offers.length} пропозицій.`,
                previousBestPrice: product.bestPrice,
                lastSeenPrice: match.bestPrice,
                sourceNames: Array.from(new Set(match.offers.map(offer => offer.marketplace))).slice(0, 6),
                offerCount: match.offers.length,
                matchConfidence: matched ? Math.round(matched.match.score * 100) : undefined,
                matchedTitle: match.title,
              },
            };
            refreshedLocal[product.id] = updatedProduct;
            if (match.bestPrice < product.bestPrice) {
              const drop = product.bestPrice - match.bestPrice;
              await createManualNotification({ dedupeKey: `product:${product.id}:price:${Math.round(match.bestPrice)}`, kind: "price_drop", title: `Ціна впала на ${money.format(drop)}`, body: `${product.title}: зараз від ${money.format(match.bestPrice)}.`, entityType: "product", entityId: product.id, price: match.bestPrice, previousPrice: product.bestPrice });
            }
            const target = targetPrices[product.id];
            if (target && match.bestPrice <= target && product.bestPrice > target) {
              await createManualNotification({ dedupeKey: `product:${product.id}:target:${Math.round(target)}`, kind: "target_hit", title: "Цільова ціна досягнута", body: `${product.title}: ${money.format(match.bestPrice)} при цілі ${money.format(target)}.`, entityType: "product", entityId: product.id, price: match.bestPrice, previousPrice: product.bestPrice });
            }
            const saveResponse = await fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: syncKey, product: updatedProduct, targetPrice: targetPrices[product.id] }),
            });
            if (!saveResponse.ok) failures.push(`save_http_${saveResponse.status}`);
          }
        } catch (error) {
          errors += 1;
          failures.push(error instanceof Error ? error.message : "network_error");
        }
        setWatching({ ...refreshedLocal });
        localStorage.setItem("smartbuy-watchlist-v3", JSON.stringify(refreshedLocal));
        setTrackingMessage(`Перевіряю ${index + 1}/${tracked.length}…`);
      }

      const parts = [`перевірено ${checked}`];
      if (updated) parts.push(`оновлено ${updated}`);
      if (notFound) parts.push(`не знайдено ${notFound}`);
      if (errors) parts.push(`помилок ${errors}`);
      if (failures.length) parts.push(`деталі: ${failures[0].slice(0, 80)}`);
      setTrackingMessage(parts.join(" · "));
      if (!errors) await loadCloudWatchlist(syncKey);
      await loadNotifications(syncKey);
    } finally {
      setTrackingRefresh(false);
    }
  }

  async function useSyncCode() {
    const clean = syncInput.trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
    if (clean.length < 8) return;
    localStorage.setItem("smartbuy-sync-key-v1", clean);
    setSyncKey(clean);
    setSyncInput("");
    await loadCloudWatchlist(clean);
    await loadCloudSavedSearches(clean, true);
    await loadNotifications(clean);
  }

  async function copySyncCode() {
    try { await navigator.clipboard.writeText(syncKey); } catch {}
  }

  const watchProducts = useMemo(() => Object.values(watching), [watching]);
  const savedDealCount = useMemo(() => savedSearches.filter(item => (item.dealDrop || 0) > 0).length, [savedSearches]);
  const unreadNotificationCount = useMemo(() => notifications.filter(item => !item.readAt).length, [notifications]);
  const visibleProducts = tab === "watch" ? watchProducts : (tab === "saved" || tab === "notifications") ? [] : products;
  const ukraineSourceLinks = useMemo(() => sourceLinks.filter(source => source.region === "ukraine" && source.kind !== "private"), [sourceLinks]);
  const internationalSourceLinks = useMemo(() => sourceLinks.filter(source => source.region === "international"), [sourceLinks]);
  const privateSourceLinks = useMemo(() => sourceLinks.filter(source => source.kind === "private"), [sourceLinks]);

  return (
    <main>
      <header className="topbar">
        <button className="brand brandButton" onClick={() => setTab("search")}>
          <div className="logo">S</div><span>SmartBuy <b>AI</b></span>
        </button>
        <nav>
          <button className={tab === "search" ? "activeNav" : ""} onClick={() => setTab("search")}>Пошук</button>
          <button className={tab === "compare" ? "activeNav" : ""} onClick={() => { setTab("compare"); setCompareOpen(true); }}>Порівняння</button>
          <button className={tab === "watch" ? "activeNav" : ""} onClick={() => setTab("watch")}>Відстеження</button>
          <button className={tab === "saved" ? "activeNav" : ""} onClick={() => setTab("saved")}>Збережені{savedDealCount > 0 ? ` · ${savedDealCount}` : ""}</button>
        </nav>
        <button className={`iconButton ${tab === "notifications" ? "activeBell" : ""}`} aria-label="Сповіщення" onClick={() => { setTab("notifications"); void loadNotifications(); }}>
          <Bell size={18}/>{unreadNotificationCount > 0 && <span className="badge">{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>}
        </button>
      </header>

      <section className="hero" id="search">
        <div className="eyebrow"><Sparkles size={15}/> SmartBuy AI v1.5 · Notifications Center</div>
        <h1>Знайди потрібну річ.<br/><span>Порівняй увесь ринок.</span></h1>
        <p>Українські магазини, приватні оголошення та закордонні майданчики в одному місці. SmartBuy показує автоматично підтверджені ціни окремо від прямих пошуків, щоб не вигадувати дані.</p>

        <form className="searchBox" onSubmit={e => { e.preventDefault(); void runSearch(); }}>
          <Search size={22}/>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Наприклад: iPhone 15 Pro 256 GB" />
          <button type="submit" disabled={loading}>{loading ? "Шукаю…" : "Знайти"}</button>
        </form>

        <div className="quickRow">
          {quickSearches.map(q => <button key={q} onClick={() => { setQuery(q); void runSearch(q, category, marketScope, conditionFilter); }}>{q}</button>)}
        </div>
      </section>

      <section className="content" id="results">
        {tab === "search" && (
          <>
            <div className="sourceStatus marketStatus">
              <div><BadgeCheck size={18}/><b>SmartBuy AI v1.5</b><span>{provider}</span></div>
              <p><Info size={15}/> Зелені ціни — автоматично підтверджені джерела. OLX, Shafa, AliExpress, Temu, Amazon та недоступні для сервера магазини відкриваються точним прямим пошуком.</p>
            </div>

            <div className="marketControlPanel">
              <div className="marketControlBlock">
                <span className="marketControlLabel">Де шукати</span>
                <div className="marketScopeTabs">
                  {marketScopeTabs.map(item => (
                    <button key={item.id} className={marketScope === item.id ? "active" : ""} onClick={() => selectMarketScope(item.id)}>
                      {scopeIcon(item.id)}<span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="marketControlBlock conditionBlock">
                <span className="marketControlLabel">Стан товару</span>
                <div className="conditionTabs">
                  {conditionTabs.map(item => (
                    <button key={item.id} className={conditionFilter === item.id ? "active" : ""} onClick={() => selectCondition(item.id)}>{item.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="categoriesWrap">
              <span className="marketControlLabel">Категорія</span>
              <div className="categories">
                {categories.map(item => <button key={item.value} className={category === item.value ? "active" : ""} onClick={() => selectCategory(item.value)}>{item.label}</button>)}
              </div>
            </div>

            {searched && (
              <div className="coverageGrid">
                <div><span>Пропозицій</span><b>{coverage.totalOffers}</b></div>
                <div><span>Магазини</span><b>{coverage.storeOffers}</b></div>
                <div><span>Від людей</span><b>{coverage.privateOffers}</b></div>
                <div><span>Нових</span><b>{coverage.newOffers}</b></div>
                <div><span>Б/в</span><b>{coverage.usedOffers}</b></div>
                <div><span>Джерел</span><b>{coverage.sourceCount}</b></div>
              </div>
            )}

            {sourceLinks.length > 0 && (
              <section className="sourceLauncher">
                <div className="sourceLauncherHead">
                  <div><h3>Де SmartBuy шукає цей товар</h3><p>v1.4 чітко розділяє ринок, стан товару, автоматичні ціни та прямі переходи. Ти бачиш весь ринок, але непідтверджена ціна ніколи не видається за live.</p></div>
                  <span>{sourceLinks.filter(s => s.access === "live").length} авто · {sourceLinks.filter(s => s.access === "direct").length} прямий</span>
                </div>

                <div className="sourceGroupSummary">
                  <div><Store size={17}/><span>Україна</span><b>{ukraineSourceLinks.length}</b><small>{coverage.totalOffers ? `${coverage.totalOffers} live-проп.` : "пошук"}</small></div>
                  <div><UserRound size={17}/><span>Приватні</span><b>{privateSourceLinks.length}</b><small>OLX / Shafa</small></div>
                  <div><Globe2 size={17}/><span>Закордон</span><b>{internationalSourceLinks.length}</b><small>прямий пошук</small></div>
                </div>

                {ukraineSourceLinks.length > 0 && (
                  <details className="sourceGroup" open={marketScope !== "international"}>
                    <summary><span><Store size={16}/> Український ринок</span><b>{ukraineSourceLinks.length} джерел</b><ChevronDown size={16}/></summary>
                    <div className="sourceLinks">
                      {ukraineSourceLinks.map(source => {
                        const status = sourceStatuses.find(item => item.id === source.id);
                        const statusText = source.access === "direct" ? "прямий пошук" : !status ? "автоматичне джерело" : status.state === "ok" ? `${status.offerCount} знайдено` : status.state === "blocked" ? "тимчасово недоступне" : status.state === "timeout" ? "не відповіло вчасно" : status.state === "empty" ? "відповіло · карток не знайдено" : status.state === "error" ? "тимчасова помилка" : "автоматичне джерело";
                        return <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className={`sourceChip ${source.kind} access-${source.access} ${status ? `status-${status.state}` : ""}`}><span>{source.kind === "private" ? <UserRound size={16}/> : <Store size={16}/>}</span><div><b>{source.name}</b><small>{statusText}</small></div><ExternalLink size={14}/></a>;
                      })}
                    </div>
                  </details>
                )}

                {privateSourceLinks.length > 0 && (
                  <details className="sourceGroup" open={marketScope === "private"}>
                    <summary><span><UserRound size={16}/> Від людей</span><b>{privateSourceLinks.length} майданчики</b><ChevronDown size={16}/></summary>
                    <div className="sourceLinks privateLinks">
                      {privateSourceLinks.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="sourceChip private access-direct"><span><UserRound size={16}/></span><div><b>{source.name}</b><small>відкрити точний запит</small></div><ExternalLink size={14}/></a>)}
                    </div>
                  </details>
                )}

                {internationalSourceLinks.length > 0 && (
                  <details className="sourceGroup" open={marketScope === "international"}>
                    <summary><span><Globe2 size={16}/> Закордон</span><b>{internationalSourceLinks.length} майданчики</b><ChevronDown size={16}/></summary>
                    <div className="sourceLinks internationalLinks">
                      {internationalSourceLinks.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="sourceChip international access-direct"><span><Globe2 size={16}/></span><div><b>{source.name}</b><small>відкрити точний запит</small></div><ExternalLink size={14}/></a>)}
                    </div>
                  </details>
                )}
              </section>
            )}

            {warning && <div className="previewWarning"><Info size={17}/><p>{warning}</p></div>}
          </>
        )}

        {tab === "watch" && (
          <section className="syncPanel">
            <div className="syncPanelMain">
              <div className={`cloudBadge ${cloudEnabled === true ? "on" : "off"}`}>{cloudEnabled === true ? <Cloud size={18}/> : <CloudOff size={18}/>}<span>{cloudEnabled === true ? "Хмарна синхронізація активна" : cloudEnabled === false ? "Локальне відстеження" : "Перевіряю хмару…"}</span></div>
              <h2>Відстеження цін</h2>
              <p>{cloudEnabled === true ? "Товари, цільові ціни та історія зберігаються в Supabase. SmartBuy автоматично перевіряє відстежувані товари раз на день і дає перевірити їх вручну будь-коли." : cloudEnabled === false ? "Сайт працює без серверного доступу до Supabase для цього deployment. Товари поки зберігаються локально." : "SmartBuy перевіряє серверне підключення до Supabase."}</p>
              {cloudDetail && <small>{cloudDetail}</small>}
              {cloudEnabled === true && <div className="trackingControls"><button onClick={() => void refreshTrackedNow()} disabled={trackingRefresh || watchProducts.length === 0}><RefreshCw size={15} className={trackingRefresh ? "spin" : ""}/>{trackingRefresh ? "Перевіряю…" : "Перевірити ціни зараз"}</button><small>{trackingMessage || "Автоперевірка: щодня через Vercel Cron"}</small></div>}
            </div>
            <div className="syncCodeBox">
              <span>Код синхронізації</span>
              <div><code>{syncKey || "—"}</code><button onClick={copySyncCode} title="Копіювати"><Copy size={15}/></button><button onClick={() => void loadCloudWatchlist()} title="Оновити" disabled={syncing}><RefreshCw size={15}/></button></div>
              <div className="syncImport"><input value={syncInput} onChange={e => setSyncInput(e.target.value)} placeholder="Код з іншого пристрою"/><button onClick={() => void useSyncCode()}>Підключити</button></div>
            </div>
          </section>
        )}

        {tab === "saved" && (
          <section className="savedSearchesPanel">
            <div className="savedSearchesHead">
              <div>
                <div className="savedEyebrow"><Bookmark size={15}/> Збережені пошуки</div>
                <h2>Deal Alerts</h2>
                <p>SmartBuy запам’ятовує запит і базову ціну. У хмарному режимі пошуки синхронізуються між пристроями та автоматично перевіряються раз на день.</p>
              </div>
              <button className="savedCheckAll" onClick={() => void checkAllSavedSearches()} disabled={savedCheckLoading || savedSearches.length === 0}><RefreshCw size={15} className={savedCheckLoading ? "spin" : ""}/>{savedCheckLoading ? "Перевіряю…" : "Перевірити всі"}</button>
            </div>
            <div className={`savedCloudState ${savedCloudReady === true ? "on" : savedCloudReady === false ? "off" : "checking"}`}>
              {savedCloudReady === true ? <Cloud size={16}/> : <CloudOff size={16}/>}
              <div><b>{savedCloudReady === true ? "Saved Searches у хмарі" : savedCloudReady === false ? "Saved Searches локально" : "Перевіряю синхронізацію"}</b><span>{savedCloudMessage || "SmartBuy перевіряє готовність Supabase."}</span></div>
            </div>
            {savedDealCount > 0 && <div className="dealAlertSummary"><Zap size={17}/><div><b>Є нові вигідні ціни</b><span>{savedDealCount} збережених пошук(и) стали дешевшими від попередньої базової ціни.</span></div></div>}
            {savedMessage && <div className="savedMessage">{savedMessage}</div>}
            {savedSearches.length === 0 ? <div className="savedEmpty"><Bookmark size={28}/><h3>Ще немає збережених пошуків</h3><p>Зроби пошук і натисни «Зберегти пошук» біля результатів.</p></div> : <div className="savedSearchGrid">
              {savedSearches.map(item => {
                const hasDrop = (item.dealDrop || 0) > 0;
                return <article className={`savedSearchCard ${hasDrop ? "hasDeal" : ""}`} key={item.id}>
                  <div className="savedCardTop"><div><span className={`savedStatus ${item.enabled ? "on" : "off"}`}>{item.enabled ? "Активний" : "Призупинено"}</span><h3>{item.query || item.category}</h3><p>{savedSearchLabel(item)}</p></div><button className="savedDelete" onClick={() => removeSavedSearch(item.id)} title="Видалити"><Trash2 size={15}/></button></div>
                  <div className="savedPriceRow"><div><span>Остання найкраща</span><b>{item.lastBestPrice ? money.format(item.lastBestPrice) : "ще немає"}</b></div>{hasDrop && <div className="savedDrop"><TrendingDown size={14}/><span>нижче на</span><b>{money.format(item.dealDrop || 0)}</b></div>}</div>
                  <div className="savedMeta"><span>{item.resultCount ?? 0} моделей</span><span>{item.offerCount ?? 0} пропозицій</span><span>{item.lastCheckedAt ? `перевірено ${new Date(item.lastCheckedAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "ще не перевірявся"}</span>{item.lastCheckStatus === "no_live_data" && <span>немає live-ціни</span>}{item.lastCheckStatus === "error" && <span>помилка перевірки</span>}</div>
                  <div className="savedActions"><button onClick={() => void openSavedSearch(item)}><Play size={14}/> Відкрити</button><button onClick={() => void checkOneSavedSearch(item)}><RefreshCw size={14}/> Перевірити</button><button className={item.enabled ? "pause" : "resume"} onClick={() => toggleSavedSearch(item.id)}>{item.enabled ? "Призупинити" : "Увімкнути"}</button></div>
                </article>;
              })}
            </div>}
          </section>
        )}

        {tab === "notifications" && (
          <section className="notificationPanel">
            <div className="notificationHead">
              <div><div className="savedEyebrow"><Bell size={15}/> Центр сповіщень</div><h2>Сповіщення</h2><p>Падіння ціни, досягнення цільової ціни та нові Deal Alerts зберігаються в хмарі.</p></div>
              <div className="notificationHeadActions">
                {browserPermission !== "granted" && browserPermission !== "unsupported" && <button className="browserNotifyButton" onClick={() => void requestBrowserNotifications()}><Bell size={14}/> Увімкнути браузерні</button>}
                <button onClick={() => void markAllNotificationsRead()} disabled={unreadNotificationCount === 0}><Check size={14}/> Прочитати всі</button>
                <button onClick={() => void loadNotifications()}><RefreshCw size={14}/> Оновити</button>
              </div>
            </div>
            <div className={`savedCloudState ${notificationCloudReady === true ? "on" : notificationCloudReady === false ? "off" : "checking"}`}>
              {notificationCloudReady === true ? <Cloud size={16}/> : <CloudOff size={16}/>}
              <div><b>{notificationCloudReady === true ? "Сповіщення у хмарі" : notificationCloudReady === false ? "Потрібна таблиця Notifications" : "Перевіряю центр сповіщень"}</b><span>{notificationMessage || "SmartBuy перевіряє Supabase."}</span></div>
            </div>
            {browserPermission === "granted" && <div className="browserNotifyState"><BadgeCheck size={14}/><span>Браузерні сповіщення дозволені. Нові непрочитані події можуть з’являтися системним повідомленням, коли сайт відкритий.</span></div>}
            {browserPermission === "denied" && <div className="browserNotifyState denied"><Info size={14}/><span>Браузерні сповіщення заблоковані в налаштуваннях браузера. Центр SmartBuy все одно працює.</span></div>}
            {notifications.length === 0 ? <div className="savedEmpty"><Bell size={28}/><h3>Поки немає сповіщень</h3><p>Коли ціна впаде або буде досягнута ціль — подія з’явиться тут.</p></div> : <div className="notificationList">
              {notifications.map(item => <article className={`notificationCard ${item.readAt ? "read" : "unread"} ${item.kind}`} key={item.id}>
                <div className="notificationIcon">{item.kind === "target_hit" ? <Target size={18}/> : item.kind === "deal_alert" ? <Zap size={18}/> : item.kind === "price_drop" ? <TrendingDown size={18}/> : <Info size={18}/>}</div>
                <div className="notificationContent"><div className="notificationTitleRow"><h3>{item.title}</h3>{!item.readAt && <span>Нове</span>}</div><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></div>
                <div className="notificationActions">
                  {!item.readAt && <button onClick={() => void markNotificationRead(item.id)} title="Позначити прочитаним"><Check size={14}/></button>}
                  {item.entityType && <button onClick={() => { void markNotificationRead(item.id); if (item.entityType === "saved_search") setTab("saved"); else { setTab("watch"); const product = item.entityId ? watching[item.entityId] : undefined; if (product) setSelected(product); } }} title="Відкрити"><ExternalLink size={14}/></button>}
                  <button className="notificationDelete" onClick={() => void removeNotification(item.id)} title="Видалити"><Trash2 size={14}/></button>
                </div>
              </article>)}
            </div>}
          </section>
        )}

        {tab !== "saved" && tab !== "notifications" && <>
        <div className="resultsHeader">
          <div>
            <h2>{tab === "watch" ? "Відстеження" : searched ? "Знайдені варіанти" : "Приклад об'єднаного ринку"}</h2>
            <p>{loading ? "Шукаю…" : tab === "watch" ? `${watchProducts.length} збережено` : `${products.length} моделей · ${coverage.totalOffers} пропозицій`}</p>
          </div>
          {tab === "search" && <div className="resultsTools"><button className="saveSearchButton" onClick={saveCurrentSearch}><Bookmark size={15}/> Зберегти пошук</button><div className="filter"><SlidersHorizontal size={17}/><span>До</span><input inputMode="numeric" value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/\D/g, ""))} placeholder="ціна, ₴"/><button onClick={() => void runSearch()}>OK</button></div></div>}
        </div>
        {tab === "search" && savedMessage && <div className="searchSaveNotice"><Bookmark size={13}/>{savedMessage}</div>}

        {loading && tab === "search" ? <div className="loadingGrid">{[1,2,3].map(x => <div className="skeleton" key={x}/>)}</div> : visibleProducts.length === 0 ? (
          <div className="empty"><ShoppingBag size={32}/><h3>{tab === "watch" ? "Тут поки порожньо" : "Нічого не знайшов"}</h3><p>{tab === "watch" ? "Натисни сердечко на товарі — він зʼявиться тут." : "Спробуй коротший запит або вибери «Весь ринок»."}</p></div>
        ) : (
          <div className="grid">
            {visibleProducts.map((product, index) => {
              const newPrice = bestByCondition(product.offers, "new");
              const usedPrice = bestByCondition(product.offers, "used");
              const saving = newPrice && usedPrice && usedPrice < newPrice ? Math.round((1 - usedPrice / newPrice) * 100) : null;
              const previousTrackedPrice = Number(product.tracking?.previousBestPrice || 0);
              const trackedDelta = previousTrackedPrice > 0 ? product.bestPrice - previousTrackedPrice : 0;
              const bestOffer = product.offers[0];
              return (
                <article className="card" key={product.id}>
                  <div className="cardTop">
                    <span className="rank">#{index + 1}</span>
                    <button className={`heart ${watching[product.id] ? "saved" : ""}`} onClick={() => toggleWatch(product)} aria-label="Відстежувати"><Heart size={19} fill={watching[product.id] ? "currentColor" : "none"}/></button>
                  </div>
                  <button className="productVisual productVisualButton" onClick={() => setSelected(product)}>
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.title}/> : product.image}
                  </button>
                  <div className="score"><Sparkles size={14}/> Smart score {product.score}/100</div>
                  <button className="titleButton" onClick={() => setSelected(product)}><h3>{product.title}</h3></button>
                  <p className="subtitle">{product.subtitle}</p>
                  {(product.rating > 0 || product.reviewCount > 0) && <div className="rating"><Star size={15} fill="currentColor"/> {product.rating > 0 ? product.rating.toFixed(1) : "—"} <span>{product.reviewCount > 0 ? `(${product.reviewCount})` : ""}</span></div>}

                  <div className="segmentPrices">
                    {newPrice !== null && <div><span><Store size={14}/> Нове від</span><b>{money.format(newPrice)}</b></div>}
                    {usedPrice !== null && <div><span><UserRound size={14}/> Б/в від</span><b>{money.format(usedPrice)}</b></div>}
                  </div>
                  {saving !== null && <div className="savingNote">Б/в дешевше нового приблизно на <b>{saving}%</b></div>}

                  <div className="priceRow priceWithSource"><strong>від {money.format(product.bestPrice)}</strong>{bestOffer?.marketplace && <span><Store size={12}/>{bestOffer.marketplace}</span>}</div>
                  <p className="stores">{product.offers.length} пропозицій · {product.source || "SmartBuy"}</p>
                  <div className="highlights">{product.highlights.slice(0,3).map(x => <span key={x}><Check size={13}/>{x}</span>)}</div>
                  {product.caution && <div className="caution">⚠ {product.caution}</div>}
                  <div className="aiBox"><b><Sparkles size={14}/> Smart-висновок</b><p>{product.aiSummary}</p></div>

                  <div className="marketJump">
                    <span>Перевірити ще:</span>
                    {marketJumpLinks(product.title).map(link => <a key={link.name} href={link.url} target="_blank" rel="noreferrer" className={link.kind}><span>{link.kind === "private" ? <UserRound size={12}/> : <Globe2 size={12}/>}</span>{link.name}<ExternalLink size={11}/></a>)}
                  </div>

                  <details className="offers">
                    <summary>Усі пропозиції <ChevronDown size={16}/></summary>
                    {product.offers.map((o, offerIndex) => (
                      <div className={`offer marketOffer ${o.sellerType}`} key={`${o.store}-${offerIndex}`}>
                        <div className="offerMain">
                          <div className="offerTitle"><b>{o.marketplace}</b><span className={`conditionTag ${o.condition}`}>{conditionLabel(o.condition)}</span></div>
                          <small>{o.sellerType === "private" ? "Приватний продавець" : o.sellerName || o.store}{o.city ? ` · ${o.city}` : ""}</small>
                          <small>{o.delivery} · {o.warranty}</small>
                          {(o.matchConfidence || o.priceAnomaly) && <small className="offerSignals">{o.matchConfidence ? <span className="matchPill">збіг {o.matchConfidence}%</span> : null}{o.priceAnomaly ? <span className="anomalyPill">цінова аномалія</span> : null}</small>}
                        </div>
                        <strong>{money.format(o.price)}</strong>
                        {o.verifiedSeller && <ShieldCheck size={16}/>} 
                        {o.url && <a className="offerLink" href={o.url} target="_blank" rel="noreferrer" aria-label="Відкрити"><ExternalLink size={15}/></a>}
                      </div>
                    ))}
                  </details>

                  {tab === "watch" && product.tracking && (
                    <div className={`trackingStatus ${product.tracking.status}`}>
                      <div><Clock3 size={14}/><span>{product.tracking.lastCheckedAt ? `Остання перевірка: ${new Date(product.tracking.lastCheckedAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Ще не перевірялось"}</span></div>
                      <b>{product.tracking.status === "ok" ? trackedDelta < 0 ? `Ціна впала на ${money.format(Math.abs(trackedDelta))}` : trackedDelta > 0 ? `Ціна зросла на ${money.format(trackedDelta)}` : "Ціна без змін" : product.tracking.status === "not_found" ? "Товар тимчасово не знайдено" : "Помилка перевірки"}</b>
                      {product.tracking.sourceNames && product.tracking.sourceNames.length > 0 && <div className="trackingSources"><span>Джерело ціни:</span>{product.tracking.sourceNames.map(source => <b key={source}>{source}</b>)}</div>}
                      {product.tracking.matchConfidence && <div className="matchConfidence">Точність збігу: <b>{product.tracking.matchConfidence}%</b>{product.tracking.offerCount ? ` · ${product.tracking.offerCount} проп.` : ""}</div>}
                      {product.tracking.message && <small>{product.tracking.message}</small>}
                    </div>
                  )}

                  {tab === "watch" && (
                    <div className="targetPriceBox">
                      <div><Target size={15}/><span>Цільова ціна</span></div>
                      <div><input inputMode="numeric" value={targetPrices[product.id] || ""} onChange={e => updateTarget(product, e.target.value)} placeholder="наприклад 25000"/><span>₴</span><button onClick={() => void commitTarget(product)}>Зберегти</button></div>
                      {targetPrices[product.id] && <small className={product.bestPrice <= targetPrices[product.id] ? "targetHit" : ""}>{product.bestPrice <= targetPrices[product.id] ? "Ціль уже досягнута" : `До цілі ще ${money.format(product.bestPrice - targetPrices[product.id])}`}</small>}
                    </div>
                  )}

                  <div className="cardActions">
                    <button className={`compare ${compare.some(x => x.id === product.id) ? "selected" : ""}`} onClick={() => toggleCompare(product)}><GitCompareArrows size={15}/>{compare.some(x => x.id === product.id) ? "Додано" : "Порівняти"}</button>
                    {product.productUrl && <a className="buyButton" href={product.productUrl} target="_blank" rel="noreferrer">Відкрити <ExternalLink size={14}/></a>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </>}
      </section>

      {compare.length > 0 && <div className="compareBar"><div><b>Порівняння</b><span>{compare.length}/3 товари</span></div><div className="compareNames">{compare.map(p => <span key={p.id}>{p.title}<button onClick={() => toggleCompare(p)}><X size={13}/></button></span>)}</div><button className="primary" onClick={() => setCompareOpen(true)}>Порівняти</button></div>}

      {compareOpen && <div className="modalBackdrop" onMouseDown={() => setCompareOpen(false)}><div className="compareModal" onMouseDown={e => e.stopPropagation()}><div className="modalHeader"><div><h2>Порівняння</h2><p>До 3 моделей поруч.</p></div><button className="closeButton" onClick={() => setCompareOpen(false)}><X/></button></div>{compare.length === 0 ? <div className="empty"><p>Додай товари кнопкою «Порівняти».</p></div> : <div className="compareTableWrap"><table className="compareTable"><thead><tr><th></th>{compare.map(p => <th key={p.id}>{p.title}</th>)}</tr></thead><tbody><tr><td>Найнижча ціна</td>{compare.map(p => <td key={p.id}><b>{money.format(p.bestPrice)}</b></td>)}</tr><tr><td>Нове від</td>{compare.map(p => <td key={p.id}>{bestByCondition(p.offers,"new") ? money.format(bestByCondition(p.offers,"new")!) : "—"}</td>)}</tr><tr><td>Б/в від</td>{compare.map(p => <td key={p.id}>{bestByCondition(p.offers,"used") ? money.format(bestByCondition(p.offers,"used")!) : "—"}</td>)}</tr><tr><td>Smart score</td>{compare.map(p => <td key={p.id}>{p.score}/100</td>)}</tr><tr><td>Пропозицій</td>{compare.map(p => <td key={p.id}>{p.offers.length}</td>)}</tr><tr><td>Медіана ринку</td>{compare.map(p => <td key={p.id}>{medianOfferPrice(p.offers) ? money.format(medianOfferPrice(p.offers)!) : "—"}</td>)}</tr><tr><td>Джерел</td>{compare.map(p => <td key={p.id}>{new Set(p.offers.map(o => o.marketplace)).size}</td>)}</tr></tbody></table></div>}</div></div>}

      {selected && <div className="modalBackdrop detailBackdrop" onMouseDown={() => setSelected(null)}>
        <aside className="detailDrawer detailDrawerV11" onMouseDown={e => e.stopPropagation()}>
          <button className="closeButton drawerClose" onClick={() => setSelected(null)}><X/></button>
          <div className="detailHeroV11">
            <div className="detailVisual">{selected.imageUrl ? <img src={selected.imageUrl} alt={selected.title}/> : selected.image}</div>
            <div className="detailHeroInfo">
              <div className="score"><Sparkles size={14}/> Smart score {selected.score}/100</div>
              <h2>{selected.title}</h2>
              <p className="subtitle">{selected.subtitle}</p>
              <div className="detailPrice">від {money.format(selected.bestPrice)}</div>
              <div className="drawerTrackRow">
                <button className={`trackButton ${watching[selected.id] ? "saved" : ""}`} onClick={() => void toggleWatch(selected)}><Heart size={16} fill={watching[selected.id] ? "currentColor" : "none"}/>{watching[selected.id] ? "Відстежується" : "Відстежувати"}</button>
                <div className="drawerTarget"><Target size={14}/><input inputMode="numeric" value={targetPrices[selected.id] || ""} onChange={e => updateTarget(selected, e.target.value)} placeholder="цільова ціна"/><span>₴</span><button onClick={() => void commitTarget(selected)}>OK</button></div>
              </div>
            </div>
          </div>

          {selectedMetrics && <section className="dealDashboard">
            <div className="dealDashboardHeader"><div><span>SmartBuy Market Check</span><h3>Де вигідніше купити зараз</h3></div>{selectedMetrics.best?.marketplace && <b>{selectedMetrics.best.marketplace}</b>}</div>
            {selectedBestValue && <div className="bestValueBanner">
              <div><Sparkles size={16}/><span><b>Найкращий баланс</b><small>{selectedBestValue.marketplace} · {conditionLabel(selectedBestValue.condition)} · Smart Value {offerValueScore(selectedBestValue, selectedMetrics.median)}/100</small></span></div>
              <strong>{money.format(selectedBestValue.price)}</strong>
            </div>}
            <div className="dealStats">
              <div><span>Найкраща підтверджена</span><b>{selectedMetrics.best ? money.format(selectedMetrics.best.price) : "—"}</b></div>
              <div><span>Медіана ринку</span><b>{selectedMetrics.median ? money.format(selectedMetrics.median) : "—"}</b></div>
              <div><span>Економія до медіани</span><b>{selectedMetrics.savingVsMedian > 0 ? money.format(selectedMetrics.savingVsMedian) : "—"}</b></div>
              <div><span>Джерел у порівнянні</span><b>{selectedMetrics.sources}</b></div><div><span>Потребують перевірки</span><b>{selectedRiskCount}</b></div>
            </div>
            <div className="marketChannelRows">
              {bestBySellerType(selected.offers, "store") && <div><span><Store size={14}/> Магазини України</span><b>{bestBySellerType(selected.offers, "store")!.marketplace}</b><strong>{money.format(bestBySellerType(selected.offers, "store")!.price)}</strong></div>}
              {bestBySellerType(selected.offers, "private") ? <div><span><UserRound size={14}/> Від людей</span><b>{bestBySellerType(selected.offers, "private")!.marketplace}</b><strong>{money.format(bestBySellerType(selected.offers, "private")!.price)}</strong></div> : <div className="channelUnavailable"><span><UserRound size={14}/> Від людей</span><b>OLX / Shafa</b><strong>відкрити пошук</strong></div>}
              {bestBySellerType(selected.offers, "international") ? <div><span><Globe2 size={14}/> Закордон</span><b>{bestBySellerType(selected.offers, "international")!.marketplace}</b><strong>{money.format(bestBySellerType(selected.offers, "international")!.price)}</strong></div> : <div className="channelUnavailable"><span><Globe2 size={14}/> Закордон</span><b>AliExpress / Temu / Amazon</b><strong>ціни не підключені</strong></div>}
            </div>
          </section>}

          <h3><TrendingDown size={16}/> Історія ціни</h3>
          <PriceHistoryChart points={history.length ? history : (selected.priceHistory || [])} currentPrice={selected.bestPrice}/>
          <p className="historyHint">{historyCloud ? "Дані з Supabase. Історія оновлюється під час пошуку, ручної перевірки та автоматичної щоденної перевірки." : "Підключи Supabase, щоб SmartBuy накопичував реальну історію ціни між пошуками."}</p>

          <div className="aiBox detailAiBox"><b><Sparkles size={14}/> Smart-висновок</b><p>{selected.aiSummary}</p></div>
          <div className="drawerMarketJump"><b>Перевірити на інших майданчиках</b><div>{marketJumpLinks(selected.title).map(link => <a key={link.name} href={link.url} target="_blank" rel="noreferrer">{link.kind === "private" ? <UserRound size={13}/> : <Globe2 size={13}/>} {link.name}<ExternalLink size={12}/></a>)}</div></div>

          <h3>Ключове</h3>
          <div className="highlights">{selected.highlights.map(x => <span key={x}><Check size={13}/>{x}</span>)}</div>

          <section className="offerExplorer">
            <div className="offerExplorerTitle"><div><h3>Усі продавці</h3><p>{selectedOffers.length} із {selected.offers.length} пропозицій</p></div><span>{selectedMetrics?.best?.marketplace ? `мінімум: ${selectedMetrics.best.marketplace}` : "SmartBuy"}</span></div>
            <div className="offerExplorerControls">
              <div className="offerFilterTabs">
                {([['all','Усі'],['new','Нові'],['used','Б/в'],['store','Магазини'],['private','Від людей']] as [OfferViewFilter,string][]).map(([id,label]) => <button key={id} className={offerViewFilter === id ? "active" : ""} onClick={() => setOfferViewFilter(id)}>{label}</button>)}
              </div>
              <select value={offerSort} onChange={e => setOfferSort(e.target.value as OfferSort)} aria-label="Сортування пропозицій"><option value="value">За вигідністю</option><option value="recommended">Рекомендовані</option><option value="price">Від дешевих</option><option value="confidence">За точністю збігу</option></select>
            </div>
            <div className="detailOfferList">
              {selectedOffers.length === 0 ? <div className="offerExplorerEmpty">У цьому фільтрі поки немає автоматично підтверджених пропозицій.</div> : selectedOffers.map((o, i) => {
                const bestPrice = selectedMetrics?.best?.price;
                const isBest = !o.priceAnomaly && bestPrice === o.price;
                const median = selectedMetrics?.median || null;
                const valueScore = offerValueScore(o, median);
                const riskFlags = offerRiskFlags(o, median);
                const isBestValue = selectedBestValue === o;
                return <div className={`detailOffer detailOfferV11 ${o.sellerType} ${o.priceAnomaly ? "priceAnomaly" : ""}`} key={`${o.store}-${o.externalId || i}`}>
                  <div className="offerRankBox">#{i + 1}</div>
                  <div className="detailOfferInfo">
                    <div className="detailOfferHead"><b>{o.marketplace}</b>{isBestValue && <span className="bestValueBadge"><Sparkles size={10}/> Найкращий баланс</span>}{isBest && <span className="bestDealBadge">Найнижча ціна</span>}<span className={`conditionTag ${o.condition}`}>{conditionLabel(o.condition)}</span></div>
                    <small>{o.sellerType === "private" ? "Приватний продавець" : o.sellerName || o.store}</small>
                    <div className="offerMetaRow">{o.city && <span><MapPin size={11}/> {o.city}</span>}{o.delivery && <span>{o.delivery}</span>}{o.warranty && <span>{o.warranty}</span>}</div>
                    <div className="offerTrustRow"><span className={`valuePill ${valueScore >= 80 ? "good" : valueScore < 68 ? "warn" : ""}`}>Smart Value {valueScore}/100 · {valueScoreLabel(valueScore)}</span>{o.matchConfidence ? <span className="matchPill">збіг {o.matchConfidence}%</span> : null}{o.verifiedSeller ? <span className="verifiedPill"><ShieldCheck size={11}/> перевірений</span> : null}{o.priceAnomaly ? <span className="anomalyPill">цінова аномалія</span> : null}{riskFlags.slice(0,2).map(flag => <span className="riskPill" key={flag}>{flag}</span>)}</div>
                  </div>
                  <div className="detailOfferBuy"><strong>{money.format(o.price)}</strong>{o.url && <a href={o.url} target="_blank" rel="noreferrer">До продавця <ExternalLink size={13}/></a>}</div>
                </div>;
              })}
            </div>
          </section>
        </aside>
      </div>}


      <footer><div className="brand"><div className="logo">S</div><span>SmartBuy AI</span></div><p>v1.4 · Cloud Saved Searches · Deal Alerts · Smart Value · історія та відстеження цін.</p></footer>
    </main>
  );
}
