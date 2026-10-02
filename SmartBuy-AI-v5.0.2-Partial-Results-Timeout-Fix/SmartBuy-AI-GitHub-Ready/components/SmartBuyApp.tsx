"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BadgeCheck, Bell, Bookmark, Bug, Check, ChevronDown, Clock3, Cloud, CloudOff, Copy, Database, ExternalLink, GitCompareArrows,
  ArrowLeftRight, Banknote, Globe2, Heart, Info, MapPin, MessageSquareText, Play, RefreshCw, Search, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Server, Sparkles, Star, Store, Target, ThumbsUp, Trash2, TrendingDown, TriangleAlert, UserRound, Wifi, X, Zap, Link2
} from "lucide-react";
import type { DiagnosticsResponse, Offer, PricePoint, Product, ProductBatchImportResponse, ProductImportResponse, SavedSearch, SearchApiResponse, SmartNotification, SmartSearchMeta, SourceCapabilityKey, SourceCapabilityLevel, SourceLink, SourceSearchStatus } from "@/lib/types";
import { bestProductMatch } from "@/lib/matching";
import { analyzeImportedProducts, mergeImportedProductGroup } from "@/lib/import-intelligence";
import { comparisonSpecKeys, specValue } from "@/lib/specs";
import { sellerTrustProfile } from "@/lib/seller-intelligence";
import { rankOfferDecisions } from "@/lib/offer-decision";
import { buildBuyTimingInsight } from "@/lib/buy-timing";
import { buildFairPriceInsight, positionAgainstFairPrice } from "@/lib/fair-price";
import { capabilityLabels, capabilityLevelLabels } from "@/lib/source-capabilities";

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

const sourceCapabilityOrder: SourceCapabilityKey[] = [
  "automaticSearch", "directSearch", "assistedImport", "privateListings", "productSpecs", "ratings", "reviewSignals", "deliveryInfo", "warrantyInfo", "sellerSignals", "internationalCost",
];

function capabilityTone(level?: SourceCapabilityLevel) {
  return level === "full" ? "full" : level === "partial" ? "partial" : level === "manual" ? "manual" : "none";
}

function usefulCapabilityCount(source: SourceLink) {
  if (!source.capabilities) return 0;
  return sourceCapabilityOrder.filter(key => source.capabilities?.[key] && source.capabilities[key] !== "none").length;
}

function adaptiveSourceStatusText(source: SourceLink, status?: SourceSearchStatus) {
  if (source.access === "direct") return "прямий пошук";
  const prefix = source.access === "probe" ? "проба · " : source.access === "live" ? "live · " : "";
  if (!status) return `${prefix}ще не перевірялось`;
  const score = typeof status.routerScore === "number" ? ` · роутер ${status.routerScore}` : "";
  if (status.state === "ok") { const q = status.queryExpanded ? ` · запит ${status.queryVariantsTried || 2}` : ""; return `${prefix}${status.offerCount} знайдено${status.cached ? " · кеш" : ""}${q}${score}`; }
  if (status.state === "blocked") return `${prefix}сайт блокує сервер${score}`;
  if (status.state === "timeout") return `${prefix}тайм-аут${score}`;
  if (status.state === "empty") return `${prefix}відповіло · точних карток нема${score}`;
  if (status.state === "error") return `${prefix}тимчасова помилка${score}`;
  if (status.routerPhase === "cooldown") return `${prefix}адаптивна пауза${score}`;
  if (status.routerPhase === "not-selected" && status.message?.includes("уже є")) return `${prefix}не знадобилось · результатів достатньо${score}`;
  if (status.routerPhase === "not-selected") return `${prefix}не вибрано в цю хвилю${score}`;
  return `${prefix}не запускалось${score}`;
}
const quickSearches = ["iPhone 17 256GB", "Lenovo LOQ 15", "Makita DHP486", "Roborock Q8 Max+"];
const money = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 });

type SupportedCurrency = "UAH" | "USD" | "EUR" | "PLN" | "GBP";
const supportedCurrencies: SupportedCurrency[] = ["UAH", "USD", "EUR", "PLN", "GBP"];
const currencyNames: Record<SupportedCurrency, string> = { UAH: "Гривня", USD: "Долар США", EUR: "Євро", PLN: "Злотий", GBP: "Фунт" };
const currencySymbols: Record<SupportedCurrency, string> = { UAH: "₴", USD: "$", EUR: "€", PLN: "zł", GBP: "£" };

function formatCurrency(value: number, currency: SupportedCurrency) {
  try {
    return new Intl.NumberFormat("uk-UA", { style: "currency", currency, maximumFractionDigits: currency === "UAH" ? 0 : 2 }).format(value || 0);
  } catch {
    return `${Math.round((value || 0) * 100) / 100} ${currency}`;
  }
}

type PurchaseChecklistItem = { id: string; label: string; detail?: string };

function purchaseChecklist(product: Product, bestOffer: Offer | null): PurchaseChecklistItem[] {
  const items: PurchaseChecklistItem[] = [
    { id: "model", label: "Звір точну модель і модифікацію", detail: "Пам’ять, колір, ревізія, комплект і артикул мають збігатися з тим, що ти шукав." },
    { id: "seller", label: "Перевір продавця", detail: "Рейтинг, відгуки, контакти, реквізити та історія продажів." },
    { id: "warranty", label: "Уточни гарантію та повернення", detail: "Хто надає гарантію, на який строк і як працює повернення." },
    { id: "total", label: "Порахуй повну суму", detail: "Ціна товару + доставка + комісії + можливі додаткові витрати." },
    { id: "payment", label: "Перевір умови оплати", detail: bestOffer?.sellerType === "private" ? "Для приватної угоди не поспішай з повною передоплатою без перевірки товару й продавця." : "Переконайся, що оплата проходить через офіційний сайт або безпечний платіжний спосіб." },
  ];
  if (bestOffer?.condition !== "new") items.splice(2, 0, { id: "condition", label: "Перевір стан товару", detail: "Фото, дефекти, батарея/знос, серійний номер або IMEI — якщо це доречно для категорії." });
  return items;
}

type TotalCostProfile = {
  productId: string;
  sourceId: string;
  sourceName: string;
  sourceKind: "offer" | "manual";
  itemPrice: number;
  delivery: number;
  fees: number;
  taxes: number;
  discount: number;
  currency?: SupportedCurrency;
  exchangeRate?: number;
  rateUpdatedAt?: string;
  updatedAt: string;
};

type CostSourceOption = {
  id: string;
  label: string;
  sourceName: string;
  kind: "offer" | "manual";
  offer?: Offer;
};

const manualCostSources = ["AliExpress", "Temu", "Amazon"] as const;

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

type CostMathInput = Pick<TotalCostProfile, "itemPrice" | "delivery" | "fees" | "taxes" | "discount"> & Partial<Pick<TotalCostProfile, "currency" | "exchangeRate">>;

function sourceTotalCost(profile: CostMathInput) {
  return Math.max(0, numberOrZero(profile.itemPrice) + numberOrZero(profile.delivery) + numberOrZero(profile.fees) + numberOrZero(profile.taxes) - numberOrZero(profile.discount));
}

function profileCurrency(profile: Partial<TotalCostProfile>): SupportedCurrency {
  return supportedCurrencies.includes(profile.currency as SupportedCurrency) ? (profile.currency as SupportedCurrency) : "UAH";
}

function profileExchangeRate(profile: Partial<TotalCostProfile>) {
  const currency = profileCurrency(profile);
  if (currency === "UAH") return 1;
  return numberOrZero(profile.exchangeRate);
}

function totalCost(profile: CostMathInput) {
  const sourceTotal = sourceTotalCost(profile);
  const rate = profileExchangeRate(profile);
  return rate > 0 ? sourceTotal * rate : 0;
}

function isInternationalCostProfile(profile: TotalCostProfile) {
  return manualCostSources.includes(profile.sourceName as (typeof manualCostSources)[number]);
}

function costOfferId(productId: string, offer: Offer) {
  const raw = offer.externalId || offer.url || `${offer.marketplace}-${offer.store}-${offer.price}-${offer.condition}`;
  return `offer:${productId}:${encodeURIComponent(raw)}`;
}

function costProfileKey(productId: string, sourceId: string) {
  return `${productId}::${sourceId}`;
}

function costSourceOptions(product: Product): CostSourceOption[] {
  const offerOptions = validOffers(product.offers).map(offer => ({
    id: costOfferId(product.id, offer),
    label: `${offer.marketplace} · ${money.format(offer.price)} · ${conditionLabel(offer.condition)}`,
    sourceName: offer.marketplace,
    kind: "offer" as const,
    offer,
  }));
  const manualOptions = manualCostSources.map(name => ({
    id: `manual:${product.id}:${name.toLowerCase()}`,
    label: `${name} · ввести ціну вручну`,
    sourceName: name,
    kind: "manual" as const,
  }));
  return [...offerOptions, ...manualOptions];
}

type Tab = "search" | "compare" | "watch" | "shortlist" | "saved" | "notifications" | "diagnostics";

type ClientDiagnosticIssue = { id: string; at: string; type: string; message: string };
type ClientRuntimeState = { online: boolean; serviceWorker: "active" | "supported" | "unsupported"; notification: string; localStorage: boolean; installed: boolean };
const DIAGNOSTIC_LOG_KEY = "smartbuy-diagnostic-log-v1";

function scrubDiagnosticMessage(value: unknown) {
  return String(value || "невідома помилка")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9._-]+/gi, "sb_[redacted]")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "[token redacted]")
    .replace(/[?&](?:token|key|secret|apikey)=[^&\s]+/gi, match => match.split("=")[0] + "=[redacted]")
    .slice(0, 260);
}

function readClientDiagnosticLog(): ClientDiagnosticIssue[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(DIAGNOSTIC_LOG_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch { return []; }
}

function recordClientIssue(type: string, error: unknown) {
  if (typeof window === "undefined") return;
  try {
    const current = readClientDiagnosticLog();
    const issue: ClientDiagnosticIssue = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(), type, message: scrubDiagnosticMessage(error instanceof Error ? error.message : error),
    };
    localStorage.setItem(DIAGNOSTIC_LOG_KEY, JSON.stringify([issue, ...current].slice(0, 20)));
  } catch {}
}

function getClientRuntimeState(): ClientRuntimeState {
  if (typeof window === "undefined") return { online: true, serviceWorker: "unsupported", notification: "unknown", localStorage: false, installed: false };
  let storageOk = false;
  try { const key = "__smartbuy_diag__"; localStorage.setItem(key, "1"); localStorage.removeItem(key); storageOk = true; } catch {}
  const sw = !("serviceWorker" in navigator) ? "unsupported" : navigator.serviceWorker.controller ? "active" : "supported";
  const notification = "Notification" in window ? Notification.permission : "unsupported";
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return { online: navigator.onLine, serviceWorker: sw, notification, localStorage: storageOk, installed };
}


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
type OfferSort = "value" | "recommended" | "price" | "confidence" | "total" | "trust";
type ComparePriority = "balanced" | "price" | "fit";

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

function marketConfidence(product: Product) {
  const offers = validOffers(product.offers);
  const sources = new Set(offers.map(offer => offer.marketplace)).size;
  const avgMatch = averageOfferConfidence(product) || 0;
  const trustedCount = offers.filter(offer => offer.verifiedSeller || offer.trusted).length;
  const anomalyCount = product.offers.filter(offer => offer.priceAnomaly).length;
  const median = medianOfferPrice(offers);
  const prices = offers.map(offer => offer.price).sort((a, b) => a - b);
  const min = prices[0] || 0;
  const max = prices[prices.length - 1] || 0;
  const spreadPct = median && median > 0 && max > 0 ? Math.round(((max - min) / median) * 100) : 0;

  let score = 18;
  score += Math.min(34, sources * 9);
  score += Math.min(18, offers.length * 3);
  score += Math.min(22, Math.round(avgMatch * .22));
  if (offers.length) score += Math.round((trustedCount / offers.length) * 10);
  if (sources <= 1) score -= 12;
  if (offers.length <= 2) score -= 8;
  if (spreadPct > 70) score -= 16;
  else if (spreadPct > 45) score -= 9;
  if (offers.length) score -= Math.round((anomalyCount / offers.length) * 20);
  score = Math.max(8, Math.min(100, Math.round(score)));

  const level = score >= 82 ? 'high' : score >= 65 ? 'good' : score >= 45 ? 'medium' : 'preliminary';
  const label = score >= 82 ? 'Висока впевненість' : score >= 65 ? 'Добра впевненість' : score >= 45 ? 'Середня впевненість' : 'Попередній висновок';
  const detail = sources <= 1
    ? 'Поки є дані лише з одного автоматично підтвердженого джерела.'
    : `${sources} джер. · ${offers.length} проп. · середня точність збігу ${avgMatch || 0}%`;
  return { score, level, label, detail, sources, offers: offers.length, avgMatch, trustedCount, anomalyCount, spreadPct, min, max, median };
}

function priceDifferenceReasons(product: Product) {
  const offers = validOffers(product.offers);
  const median = medianOfferPrice(offers);
  const reasons: { title: string; detail: string; tone: 'neutral' | 'warn' | 'good' }[] = [];
  const newOffers = offers.filter(offer => offer.condition === 'new');
  const usedOffers = offers.filter(offer => offer.condition !== 'new');
  const stores = offers.filter(offer => offer.sellerType === 'store');
  const privateOffers = offers.filter(offer => offer.sellerType === 'private');
  const anomalous = product.offers.filter(offer => offer.priceAnomaly);
  const lowerConfidence = product.offers.filter(offer => (offer.matchConfidence || 100) < 90);

  if (newOffers.length && usedOffers.length) {
    const bestNew = Math.min(...newOffers.map(offer => offer.price));
    const bestUsed = Math.min(...usedOffers.map(offer => offer.price));
    const diff = bestNew > 0 ? Math.round(((bestNew - bestUsed) / bestNew) * 100) : 0;
    reasons.push({ title: 'Стан товару', detail: diff > 0 ? `Б/в стартує приблизно на ${diff}% дешевше за новий.` : 'Нові та б/в пропозиції мають близькі стартові ціни.', tone: 'neutral' });
  }
  if (stores.length && privateOffers.length) reasons.push({ title: 'Тип продавця', detail: 'Приватні оголошення можуть бути дешевшими, але умови гарантії та повернення відрізняються від магазинів.', tone: 'neutral' });
  if (anomalous.length) reasons.push({ title: 'Аномальні ціни', detail: `${anomalous.length} проп. відхиляються від ринку і не повинні автоматично вважатися найкращою покупкою.`, tone: 'warn' });
  if (lowerConfidence.length) reasons.push({ title: 'Схожі модифікації', detail: `${lowerConfidence.length} проп. мають нижчу точність збігу — перевір пам’ять, версію та комплектацію.`, tone: 'warn' });
  if (median) {
    const deliveryMissing = offers.filter(offer => !offer.delivery).length;
    const warrantyMissing = offers.filter(offer => !offer.warranty).length;
    if (deliveryMissing || warrantyMissing) reasons.push({ title: 'Умови покупки', detail: 'Частина різниці в ціні може бути через доставку, гарантію, комплектацію або сервіс продавця.', tone: 'neutral' });
  }
  if (!reasons.length) reasons.push({ title: 'Ціни близькі', detail: 'Суттєвих причин для великої різниці SmartBuy не бачить у доступних даних.', tone: 'good' });
  return reasons.slice(0, 4);
}

function priceVsMedian(price: number, median: number | null) {
  if (!median || median <= 0) return null;
  const pct = Math.round(((price - median) / median) * 100);
  if (Math.abs(pct) <= 2) return { label: 'біля медіани', tone: 'normal' };
  return { label: `${pct < 0 ? '' : '+'}${pct}% до медіани`, tone: pct < 0 ? 'good' : 'high' };
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

function sellerRiskScore(offer: Offer, median: number | null) {
  let score = 8;
  const reasons: string[] = [];
  const confidence = offer.matchConfidence || 0;

  if (offer.priceAnomaly) { score += 38; reasons.push("цінова аномалія"); }
  if (confidence > 0 && confidence < 90) { score += 24; reasons.push("нижча точність збігу"); }
  else if (confidence > 0 && confidence < 95) { score += 10; reasons.push("варто звірити модифікацію"); }
  if (!offer.verifiedSeller && !offer.trusted) { score += 18; reasons.push("продавець не підтверджений SmartBuy"); }
  if (offer.sellerType === "private") { score += 8; reasons.push("приватне оголошення"); }
  if (offer.sellerType === "private" && !offer.warranty) { score += 10; reasons.push("гарантія не підтверджена"); }
  if (offer.sellerRating != null && offer.sellerRating < 3.6) { score += 16; reasons.push("низький рейтинг продавця"); }
  if (offer.sellerReviewCount != null && offer.sellerReviewCount > 0 && offer.sellerReviewCount < 5) { score += 6; reasons.push("мало відгуків продавця"); }
  const sellerYear = Number(String(offer.sellerSince || "").match(/\b(19\d{2}|20\d{2})\b/)?.[1] || 0);
  const sellerAgeDays = offer.sellerAgeDays || (sellerYear ? Math.max(0, Math.floor((Date.now() - Date.UTC(sellerYear, 0, 1)) / 86_400_000)) : 0);
  if (offer.sellerType === "private" && sellerAgeDays > 0 && sellerAgeDays < 30) { score += 14; reasons.push("дуже новий профіль продавця"); }
  if (offer.sellerType === "private" && !offer.sellerSince && !offer.sellerAgeDays) { score += 5; reasons.push("історію профілю не отримано"); }
  if (offer.sellerType === "private" && offer.delivery && !/(olx достав|післяплат|накладен|самовивіз|зустріч|оплата при отрим)/i.test(offer.delivery)) { score += 7; reasons.push("немає підтвердженого безпечнішого сценарію оплати"); }
  if (median && offer.price < median * 0.72) { score += 20; reasons.push("ціна значно нижча за ринок"); }
  if (!offer.delivery) { score += 3; reasons.push("умови доставки не підтверджені"); }
  if (offer.sellerType === "store" && !offer.returnPolicy) { score += 3; reasons.push("умови повернення не отримані"); }

  score = Math.max(1, Math.min(100, Math.round(score)));
  const level = score <= 24 ? "low" : score <= 48 ? "medium" : "high";
  const label = score <= 24 ? "Низький ризик даних" : score <= 48 ? "Потрібна перевірка" : "Підвищений ризик даних";
  return { score, level, label, reasons: reasons.slice(0, 3) };
}

function purchaseReadiness(product: Product, bestOffer: Offer | null, confidence: ReturnType<typeof marketConfidence> | null) {
  if (!bestOffer || !confidence) return { score: 20, level: "low", label: "Даних замало", summary: "SmartBuy ще не має достатньо підтверджених даних для впевненого висновку.", positives: [] as string[], checks: ["Звір модель і модифікацію", "Перевір продавця та умови оплати"] };
  const median = medianOfferPrice(product.offers);
  const value = offerValueScore(bestOffer, median);
  const risk = sellerRiskScore(bestOffer, median);
  const match = bestOffer.matchConfidence || 0;
  let score = Math.round(confidence.score * .42 + value * .33 + match * .2 + (bestOffer.verifiedSeller ? 5 : bestOffer.trusted ? 3 : 0));
  score -= Math.round(risk.score * .18);
  if (confidence.sources <= 1) score -= 8;
  score = Math.max(8, Math.min(100, score));

  const positives: string[] = [];
  const checks: string[] = [];
  if (match >= 98) positives.push("точний збіг моделі");
  else checks.push("звір точну модель, пам’ять і комплектацію");
  if (bestOffer.verifiedSeller || bestOffer.trusted) positives.push("є сигнал довіри до продавця");
  else checks.push("перевір рейтинг, реквізити й історію продавця");
  if (median && bestOffer.price <= median) positives.push("ціна не вища за медіану ринку");
  if (bestOffer.warranty) positives.push("гарантія вказана");
  else checks.push("уточни гарантію та повернення");
  if (!bestOffer.delivery) checks.push("уточни доставку й повну кінцеву вартість");
  if (bestOffer.sellerType === "private") checks.push("для б/в перевір стан, комплект і серійний номер/IMEI, якщо це доречно");
  if (risk.level === "high") checks.push("не поспішай з передоплатою: є кілька ризикових сигналів у даних");
  if (confidence.sources <= 1) checks.push("порівняй ще хоча б з одним незалежним джерелом");

  const level = score >= 78 ? "ready" : score >= 58 ? "check" : "wait";
  const label = score >= 78 ? "Можна переходити до перевірки продавця" : score >= 58 ? "Варто перевірити кілька деталей" : "Краще ще порівняти ринок";
  const summary = score >= 78
    ? "Ціна, збіг моделі та доступні сигнали виглядають достатньо узгоджено, але перед оплатою все одно перевір продавця й умови покупки."
    : score >= 58
      ? "Пропозиція може бути нормальною, але SmartBuy бачить деталі, які варто підтвердити перед оплатою."
      : "Доступних даних або підтверджень поки недостатньо, щоб поспішати з покупкою.";
  return { score, level, label, summary, positives: positives.slice(0, 4), checks: Array.from(new Set(checks)).slice(0, 5), risk };
}

function purchaseActionSummary(product: Product, bestOffer: Offer | null, readiness: ReturnType<typeof purchaseReadiness> | null, confidence: ReturnType<typeof marketConfidence> | null, history: PricePoint[]) {
  if (!bestOffer || !readiness || !confidence) {
    return {
      score: 20,
      level: "compare" as const,
      label: "Краще ще порівняти",
      summary: "SmartBuy поки не має достатньо підтверджених даних, щоб робити сильний висновок по цій покупці.",
      reasons: ["замало підтверджених пропозицій"],
      priceSignal: "даних про ціну замало",
      historyLow: null as number | null,
      historyAvg: null as number | null,
    };
  }
  const median = medianOfferPrice(product.offers);
  const risk = sellerRiskScore(bestOffer, median);
  const prices = history.map(point => Number(point.price)).filter(price => Number.isFinite(price) && price > 0);
  const historyLow = prices.length ? Math.min(...prices) : null;
  const historyAvg = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;
  let score = Math.round(readiness.score * .62 + confidence.score * .23 + offerValueScore(bestOffer, median) * .15);
  const reasons: string[] = [];

  if (median) {
    const ratio = bestOffer.price / median;
    if (ratio <= .94) { score += 9; reasons.push("ціна помітно нижча за медіану ринку"); }
    else if (ratio <= 1.02) { score += 4; reasons.push("ціна близька до медіани ринку"); }
    else if (ratio >= 1.10) { score -= 10; reasons.push("ціна вища за медіану ринку"); }
  }
  if (historyLow && prices.length >= 2) {
    if (bestOffer.price <= historyLow * 1.03) { score += 8; reasons.push("ціна близька до мінімуму в історії"); }
    else if (historyAvg && bestOffer.price > historyAvg * 1.08) { score -= 8; reasons.push("ціна вища за середню в історії"); }
  }
  if (confidence.sources <= 1) { score -= 8; reasons.push("підтверджено лише одне джерело"); }
  if (risk.level === "high") { score -= 16; reasons.push("у кращої пропозиції є ризикові сигнали"); }
  else if (risk.level === "medium") { score -= 5; reasons.push("перед оплатою треба перевірити продавця"); }
  if ((bestOffer.matchConfidence || 0) >= 98) reasons.push("точний збіг моделі");
  score = Math.max(5, Math.min(100, Math.round(score)));

  const level = score >= 80 && risk.level !== "high" ? "buy" as const : score >= 60 ? "watch" as const : "compare" as const;
  const label = level === "buy" ? "Можна розглядати покупку зараз" : level === "watch" ? "Можна купувати після перевірки деталей" : "Краще ще порівняти або зачекати";
  const summary = level === "buy"
    ? "За доступними даними ціна й якість пропозиції виглядають достатньо сильними. Перед оплатою все одно звір продавця, гарантію та комплектацію."
    : level === "watch"
      ? "Пропозиція виглядає нормально, але є кілька факторів, які варто підтвердити або порівняти перед оплатою."
      : "SmartBuy бачить недостатньо підтверджень, завищену ціну або ризикові сигнали. Поспішати з оплатою не варто.";
  const priceSignal = historyLow && prices.length >= 2
    ? bestOffer.price <= historyLow * 1.03 ? "біля історичного мінімуму" : historyAvg && bestOffer.price > historyAvg * 1.08 ? "вище історичної середньої" : "у звичному діапазоні"
    : median ? bestOffer.price <= median ? "не вище медіани ринку" : "вище медіани ринку" : "історії ще замало";
  return { score, level, label, summary, reasons: Array.from(new Set(reasons)).slice(0, 4), priceSignal, historyLow, historyAvg };
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

function bestValueOffer(product: Product) {
  const median = medianOfferPrice(product.offers);
  const candidates = validOffers(product.offers).filter(offer => !offer.priceAnomaly);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => offerValueScore(b, median) - offerValueScore(a, median) || a.price - b.price)[0];
}

function averageOfferConfidence(product: Product) {
  const values = product.offers.map(offer => Number(offer.matchConfidence || 0)).filter(value => value > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function comparisonProfile(product: Product, allProducts: Product[], priority: ComparePriority) {
  const sourceCount = new Set(product.offers.map(offer => offer.marketplace)).size;
  const allSourceCounts = allProducts.map(item => new Set(item.offers.map(offer => offer.marketplace)).size);
  const maxSources = Math.max(1, ...allSourceCounts);
  const positivePrices = allProducts.map(item => Number(item.bestPrice)).filter(price => Number.isFinite(price) && price > 0);
  const minPrice = positivePrices.length ? Math.min(...positivePrices) : Number(product.bestPrice || 0);
  const priceScore = product.bestPrice > 0 && minPrice > 0 ? Math.min(100, Math.round((minPrice / product.bestPrice) * 100)) : 50;
  const coverageScore = Math.round((sourceCount / maxSources) * 100);
  const valueOffer = bestValueOffer(product);
  const median = medianOfferPrice(product.offers);
  const valueScore = valueOffer ? offerValueScore(valueOffer, median) : product.score;
  const fitScore = product.fitScore ?? product.score;
  let decisionScore = 0;
  if (priority === "price") {
    decisionScore = priceScore * .62 + valueScore * .18 + product.score * .12 + coverageScore * .08;
  } else if (priority === "fit") {
    decisionScore = fitScore * .52 + valueScore * .18 + product.score * .14 + priceScore * .11 + coverageScore * .05;
  } else {
    decisionScore = fitScore * .28 + valueScore * .25 + priceScore * .20 + product.score * .17 + coverageScore * .10;
  }
  const verifiedOffers = product.offers.filter(offer => offer.verifiedSeller || offer.trusted).length;
  const riskyOffers = product.offers.filter(offer => offerRiskFlags(offer, median).length > 0).length;
  const history = product.priceHistory || [];
  const historyInsight = getPriceInsight(history, product.bestPrice);
  return {
    product, sourceCount, priceScore, coverageScore, valueOffer, valueScore, fitScore,
    decisionScore: Math.round(decisionScore), verifiedOffers, riskyOffers,
    averageConfidence: averageOfferConfidence(product), median, historyInsight,
  };
}

function compareStrengths(profile: ReturnType<typeof comparisonProfile>, profiles: ReturnType<typeof comparisonProfile>[]) {
  const strengths: string[] = [];
  const minPrice = Math.min(...profiles.map(item => item.product.bestPrice));
  const maxSources = Math.max(...profiles.map(item => item.sourceCount));
  const maxSmart = Math.max(...profiles.map(item => item.product.score));
  const maxFit = Math.max(...profiles.map(item => item.fitScore));
  const maxValue = Math.max(...profiles.map(item => item.valueScore));
  if (profile.product.bestPrice === minPrice) strengths.push("Найнижча ціна");
  if (profile.sourceCount === maxSources && maxSources > 1) strengths.push("Найбільше джерел");
  if (profile.product.score === maxSmart) strengths.push("Найвищий Smart score");
  if (profile.fitScore === maxFit && profile.product.fitScore != null) strengths.push("Найкраще під запит");
  if (profile.valueScore === maxValue) strengths.push("Найкращий Smart Value");
  return strengths.slice(0, 3);
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

function vapidKeyToBytes(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
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
  const [searchQuality, setSearchQuality] = useState<SearchApiResponse["quality"]>();
  const [selected, setSelected] = useState<Product | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePriority, setComparePriority] = useState<ComparePriority>("balanced");
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
  const [offerSort, setOfferSort] = useState<OfferSort>("recommended");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedCheckLoading, setSavedCheckLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [savedCloudReady, setSavedCloudReady] = useState<boolean | null>(null);
  const [savedCloudMessage, setSavedCloudMessage] = useState("");
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [notificationCloudReady, setNotificationCloudReady] = useState<boolean | null>(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushState, setPushState] = useState<"checking" | "ready" | "off" | "unsupported" | "needs_sql" | "needs_keys" | "error">("checking");
  const [smartSearchActive, setSmartSearchActive] = useState(false);
  const [smartMeta, setSmartMeta] = useState<SmartSearchMeta | null>(null);
  const [shortlist, setShortlist] = useState<Record<string, Product>>({});
  const [purchaseChecks, setPurchaseChecks] = useState<Record<string, string[]>>({});
  const [costProfiles, setCostProfiles] = useState<Record<string, TotalCostProfile>>({});
  const [workspaceCloudReady, setWorkspaceCloudReady] = useState<boolean | null>(null);
  const [workspaceCloudMessage, setWorkspaceCloudMessage] = useState("");
  const [workspaceSyncing, setWorkspaceSyncing] = useState(false);
  const [costSourceId, setCostSourceId] = useState("");
  const [costDraft, setCostDraft] = useState<Omit<TotalCostProfile, "productId" | "sourceId" | "updatedAt"> | null>(null);
  const [fxRates, setFxRates] = useState<Partial<Record<SupportedCurrency, number>>>({ UAH: 1 });
  const [fxUpdatedAt, setFxUpdatedAt] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [fxMessage, setFxMessage] = useState("");
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSequenceRef = useRef(0);
  const diagnosticsAutoRef = useRef(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticMessage, setDiagnosticMessage] = useState("");
  const [clientIssues, setClientIssues] = useState<ClientDiagnosticIssue[]>([]);
  const [clientRuntime, setClientRuntime] = useState<ClientRuntimeState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ProductImportResponse | null>(null);
  const [importManualTitle, setImportManualTitle] = useState("");
  const [importManualPrice, setImportManualPrice] = useState("");
  const [importManualCondition, setImportManualCondition] = useState<"new" | "used" | "refurbished">("new");
  const [importBatchMode, setImportBatchMode] = useState(false);
  const [batchImportText, setBatchImportText] = useState("");
  const [batchImportLoading, setBatchImportLoading] = useState(false);
  const [batchImportResult, setBatchImportResult] = useState<ProductBatchImportResponse | null>(null);
  const batchImportedProducts = useMemo(() => (batchImportResult?.results || []).flatMap(item => item.product ? [item.product] : []), [batchImportResult]);
  const batchImportInsight = useMemo(() => analyzeImportedProducts(batchImportedProducts), [batchImportedProducts]);

  const selectedOfferDecision = useMemo(() => {
    if (!selected) return null;
    return rankOfferDecisions(selected.offers, offer => {
      const profile = costProfiles[costProfileKey(selected.id, costOfferId(selected.id, offer))];
      const value = profile ? totalCost(profile) : 0;
      return value > 0 ? value : undefined;
    });
  }, [selected, costProfiles]);

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
    const decisionScores = new Map<Offer, number>((selectedOfferDecision?.ranked || []).map(item => [item.offer, item.score] as const));
    items = [...items].sort((a, b) => {
      if (offerSort === "recommended") return (decisionScores.get(b) || 0) - (decisionScores.get(a) || 0) || offerValueScore(b, median) - offerValueScore(a, median) || a.price - b.price;
      if (offerSort === "value") return offerValueScore(b, median) - offerValueScore(a, median) || a.price - b.price;
      if (offerSort === "price") return Number(a.priceAnomaly) - Number(b.priceAnomaly) || a.price - b.price;
      if (offerSort === "confidence") return Number(a.priceAnomaly) - Number(b.priceAnomaly) || (b.matchConfidence || 0) - (a.matchConfidence || 0) || a.price - b.price;
      if (offerSort === "trust") {
        const aTrust = sellerTrustProfile(a, median).score;
        const bTrust = sellerTrustProfile(b, median).score;
        return bTrust - aTrust || a.price - b.price;
      }
      if (offerSort === "total" && selected) {
        const aProfile = costProfiles[costProfileKey(selected.id, costOfferId(selected.id, a))];
        const bProfile = costProfiles[costProfileKey(selected.id, costOfferId(selected.id, b))];
        const aTotal = aProfile ? totalCost(aProfile) : Number.POSITIVE_INFINITY;
        const bTotal = bProfile ? totalCost(bProfile) : Number.POSITIVE_INFINITY;
        return aTotal - bTotal || a.price - b.price;
      }
      return Number(a.priceAnomaly) - Number(b.priceAnomaly)
        || Number(Boolean(b.verifiedSeller)) - Number(Boolean(a.verifiedSeller))
        || Number(Boolean(b.trusted)) - Number(Boolean(a.trusted))
        || (b.matchConfidence || 0) - (a.matchConfidence || 0)
        || a.price - b.price;
    });
    return items;
  }, [selected, offerViewFilter, offerSort, costProfiles, selectedOfferDecision]);

  const selectedMetrics = useMemo(() => selected ? marketMetrics(selected.offers) : null, [selected]);
  const selectedBestValue = useMemo(() => selectedOfferDecision?.recommended?.offer || null, [selectedOfferDecision]);
  const selectedSellerTrust = useMemo(() => {
    if (!selectedBestValue || !selectedMetrics) return null;
    return sellerTrustProfile(selectedBestValue, selectedMetrics.median);
  }, [selectedBestValue, selectedMetrics]);

  const selectedRiskCount = useMemo(() => {
    if (!selected) return 0;
    const median = medianOfferPrice(selected.offers);
    return selected.offers.filter(offer => offerRiskFlags(offer, median).length > 0).length;
  }, [selected]);

  const selectedConfidence = useMemo(() => selected ? marketConfidence(selected) : null, [selected]);
  const selectedReadiness = useMemo(() => selected ? purchaseReadiness(selected, selectedBestValue, selectedConfidence) : null, [selected, selectedBestValue, selectedConfidence]);
  const selectedPurchaseAction = useMemo(() => selected ? purchaseActionSummary(selected, selectedBestValue, selectedReadiness, selectedConfidence, history.length ? history : (selected.priceHistory || [])) : null, [selected, selectedBestValue, selectedReadiness, selectedConfidence, history]);
  const selectedBuyTiming = useMemo(() => selected ? buildBuyTimingInsight(history.length ? history : (selected.priceHistory || []), selected.bestPrice) : null, [selected, history]);
  const selectedFairPrice = useMemo(() => selected ? buildFairPriceInsight(selected, selectedBestValue, history.length ? history : (selected.priceHistory || [])) : null, [selected, selectedBestValue, history]);
  const selectedPriceReasons = useMemo(() => selected ? priceDifferenceReasons(selected) : [], [selected]);
  const selectedPurchaseChecklist = useMemo(() => selected ? purchaseChecklist(selected, selectedBestValue) : [], [selected, selectedBestValue]);
  const selectedCompletedChecks = selected ? (purchaseChecks[selected.id] || []) : [];
  const selectedChecklistProgress = selectedPurchaseChecklist.length ? Math.round((selectedCompletedChecks.length / selectedPurchaseChecklist.length) * 100) : 0;
  const selectedCostOptions = useMemo(() => selected ? costSourceOptions(selected) : [], [selected]);
  const selectedCostOption = useMemo(() => selectedCostOptions.find(option => option.id === costSourceId) || null, [selectedCostOptions, costSourceId]);
  const selectedCostTotal = costDraft ? totalCost(costDraft) : 0;
  const selectedCostSourceTotal = costDraft ? sourceTotalCost(costDraft) : 0;
  const selectedCostCurrency = costDraft ? profileCurrency(costDraft) : "UAH";
  const selectedCostProfiles = useMemo<TotalCostProfile[]>(() => selected ? (Object.values(costProfiles) as TotalCostProfile[]).filter(profile => profile.productId === selected.id && totalCost(profile) > 0).sort((a, b) => totalCost(a) - totalCost(b)) : [], [selected, costProfiles]);
  const selectedCrossMarket = useMemo(() => {
    const domestic = selectedCostProfiles.filter(profile => !isInternationalCostProfile(profile))[0] || null;
    const international = selectedCostProfiles.filter(profile => isInternationalCostProfile(profile))[0] || null;
    if (!domestic && !international) return null;
    if (!domestic || !international) return { domestic, international, cheaper: null as "domestic" | "international" | null, difference: 0, percent: 0 };
    const domesticTotal = totalCost(domestic);
    const internationalTotal = totalCost(international);
    const difference = Math.abs(domesticTotal - internationalTotal);
    const higher = Math.max(domesticTotal, internationalTotal);
    return { domestic, international, cheaper: domesticTotal <= internationalTotal ? "domestic" as const : "international" as const, difference, percent: higher > 0 ? Math.round((difference / higher) * 1000) / 10 : 0 };
  }, [selectedCostProfiles]);

  const comparisonProfiles = useMemo(() => compare.map(product => comparisonProfile(product, compare, comparePriority)), [compare, comparePriority]);
  const comparisonWinner = useMemo(() => comparisonProfiles.length ? [...comparisonProfiles].sort((a, b) => b.decisionScore - a.decisionScore || a.product.bestPrice - b.product.bestPrice)[0] : null, [comparisonProfiles]);
  const comparisonMinPrice = useMemo(() => comparisonProfiles.length ? Math.min(...comparisonProfiles.map(item => item.product.bestPrice)) : null, [comparisonProfiles]);
  const comparisonMaxSources = useMemo(() => comparisonProfiles.length ? Math.max(...comparisonProfiles.map(item => item.sourceCount)) : 0, [comparisonProfiles]);
  const comparisonMaxSmart = useMemo(() => comparisonProfiles.length ? Math.max(...comparisonProfiles.map(item => item.product.score)) : 0, [comparisonProfiles]);
  const comparisonHasFit = useMemo(() => comparisonProfiles.some(item => item.product.fitScore != null), [comparisonProfiles]);
  const comparisonSpecs = useMemo(() => comparisonSpecKeys(compare, 7), [compare]);

  useEffect(() => {
    if (comparePriority === "fit" && !comparisonHasFit) setComparePriority("balanced");
  }, [comparePriority, comparisonHasFit]);

  useEffect(() => {
    let key = "";
    try {
      const saved = localStorage.getItem("smartbuy-watchlist-v3");
      if (saved) setWatching(JSON.parse(saved));
      const savedTargets = localStorage.getItem("smartbuy-targets-v1");
      if (savedTargets) setTargetPrices(JSON.parse(savedTargets));
      const savedQueries = localStorage.getItem("smartbuy-saved-searches-v1");
      if (savedQueries) setSavedSearches(JSON.parse(savedQueries));
      const savedShortlist = localStorage.getItem("smartbuy-shortlist-v1");
      if (savedShortlist) setShortlist(JSON.parse(savedShortlist));
      const savedPurchaseChecks = localStorage.getItem("smartbuy-purchase-checks-v1");
      if (savedPurchaseChecks) setPurchaseChecks(JSON.parse(savedPurchaseChecks));
      const savedCosts = localStorage.getItem("smartbuy-total-cost-v1");
      if (savedCosts) setCostProfiles(JSON.parse(savedCosts));
      key = localStorage.getItem("smartbuy-sync-key-v1") || makeSyncKey();
      localStorage.setItem("smartbuy-sync-key-v1", key);
      setSyncKey(key);
    } catch {}
    if (typeof window !== "undefined" && "Notification" in window) setBrowserPermission(Notification.permission);
    if (typeof window !== "undefined") {
      const initialTab = new URLSearchParams(window.location.search).get("tab");
      if (["search", "watch", "saved", "notifications", "diagnostics"].includes(initialTab || "")) setTab(initialTab as Tab);
    }
    if (key) {
      void initializeCloud(key);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") void ensurePushSubscription(key, false);
    }
    void runSearch();
    void loadFxRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setClientIssues(readClientDiagnosticLog());
    setClientRuntime(getClientRuntimeState());
    const refreshRuntime = () => setClientRuntime(getClientRuntimeState());
    const onError = (event: ErrorEvent) => {
      recordClientIssue("window_error", event.error || event.message);
      setClientIssues(readClientDiagnosticLog());
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      recordClientIssue("unhandled_rejection", event.reason);
      setClientIssues(readClientDiagnosticLog());
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("online", refreshRuntime);
    window.addEventListener("offline", refreshRuntime);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("online", refreshRuntime);
      window.removeEventListener("offline", refreshRuntime);
    };
  }, []);

  useEffect(() => {
    if (tab === "diagnostics" && !diagnosticsAutoRef.current) {
      diagnosticsAutoRef.current = true;
      void runDiagnostics(false);
    }
  }, [tab]);

  useEffect(() => {
    if (pushState === "ready" || browserPermission !== "granted" || notifications.length === 0 || typeof window === "undefined" || !("Notification" in window)) return;
    let shown: string[] = [];
    try { shown = JSON.parse(localStorage.getItem("smartbuy-browser-notified-v1") || "[]"); } catch {}
    const seen = new Set(shown);
    const fresh = notifications.filter(item => !item.readAt && !seen.has(item.id)).slice(0, 3);
    for (const item of fresh) {
      try { new Notification(item.title, { body: item.body, tag: item.id }); } catch {}
      seen.add(item.id);
    }
    try { localStorage.setItem("smartbuy-browser-notified-v1", JSON.stringify(Array.from(seen).slice(-100))); } catch {}
  }, [notifications, browserPermission, pushState]);

  useEffect(() => () => { searchAbortRef.current?.abort(); }, []);

  useEffect(() => {
    setOfferViewFilter("all");
    setOfferSort("value");
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setCostSourceId(""); setCostDraft(null); return; }
    const options = costSourceOptions(selected);
    const preferred = selectedBestValue ? costOfferId(selected.id, selectedBestValue) : options[0]?.id || "";
    setCostSourceId(current => options.some(option => option.id === current) ? current : preferred);
  }, [selected, selectedBestValue]);

  useEffect(() => {
    if (!selected || !costSourceId) { setCostDraft(null); return; }
    const option = costSourceOptions(selected).find(item => item.id === costSourceId);
    if (!option) { setCostDraft(null); return; }
    const stored = costProfiles[costProfileKey(selected.id, costSourceId)];
    if (stored) {
      const { productId: _productId, sourceId: _sourceId, updatedAt: _updatedAt, ...draft } = stored;
      setCostDraft(draft);
      return;
    }
    setCostDraft({
      sourceName: option.sourceName,
      sourceKind: option.kind,
      itemPrice: option.offer?.price || 0,
      delivery: option.offer?.shippingCost || 0,
      fees: 0,
      taxes: 0,
      discount: 0,
      currency: "UAH",
      exchangeRate: 1,
      rateUpdatedAt: fxUpdatedAt || undefined,
    });
  }, [selected, costSourceId, costProfiles]);

  useEffect(() => {
    if (!costDraft) return;
    const currency = profileCurrency(costDraft);
    if (currency === "UAH") {
      if (costDraft.exchangeRate !== 1) setCostDraft(current => current ? { ...current, exchangeRate: 1 } : current);
      return;
    }
    const liveRate = fxRates[currency];
    if ((!costDraft.exchangeRate || costDraft.exchangeRate <= 0) && liveRate && liveRate > 0) {
      setCostDraft(current => current ? { ...current, exchangeRate: liveRate, rateUpdatedAt: fxUpdatedAt || current.rateUpdatedAt } : current);
    }
  }, [fxRates, fxUpdatedAt, costDraft?.currency]);

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

  async function runDiagnostics(deep = false) {
    setDiagnosticsLoading(true);
    setDiagnosticMessage(deep ? "Перевіряю стабільні live-джерела…" : "Перевіряю систему…");
    setClientRuntime(getClientRuntimeState());
    setClientIssues(readClientDiagnosticLog());
    try {
      const response = await fetch("/api/diagnostics", {
        method: deep ? "POST" : "GET",
        headers: deep ? { "Content-Type": "application/json" } : undefined,
        body: deep ? JSON.stringify({ deep: true }) : undefined,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`diagnostics_http_${response.status}`);
      const data = await response.json() as DiagnosticsResponse;
      setDiagnostics(data);
      setDiagnosticMessage(deep ? "Глибока перевірка завершена." : "Перевірка завершена.");
    } catch (error) {
      recordClientIssue("diagnostics", error);
      setClientIssues(readClientDiagnosticLog());
      setDiagnosticMessage(`Не вдалося виконати діагностику: ${scrubDiagnosticMessage(error instanceof Error ? error.message : error)}`);
    } finally {
      setDiagnosticsLoading(false);
      setClientRuntime(getClientRuntimeState());
    }
  }

  function clearDiagnosticLog() {
    try { localStorage.removeItem(DIAGNOSTIC_LOG_KEY); } catch {}
    setClientIssues([]);
    setDiagnosticMessage("Локальний журнал помилок очищено.");
  }

  async function copyDiagnosticReport() {
    const report = {
      server: diagnostics,
      client: clientRuntime,
      recentClientIssues: clientIssues.slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setDiagnosticMessage("Звіт скопійовано. Секретні ключі в нього не входять.");
    } catch {
      setDiagnosticMessage("Не вдалося скопіювати звіт у буфер обміну.");
    }
  }

  async function runSearch(nextQuery = query, nextCategory = category, nextScope = marketScope, nextCondition = conditionFilter, nextMaxPrice = maxPrice, smart = false) {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const sequence = ++searchSequenceRef.current;
    const searchTimeoutMs = 50000;
    const timeout = window.setTimeout(() => controller.abort(), searchTimeoutMs);

    setLoading(true);
    setTab("search");
    setSmartSearchActive(smart);
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (nextCategory !== "Усі") params.set("category", nextCategory);
      if (nextMaxPrice) params.set("maxPrice", nextMaxPrice);
      params.set("scope", nextScope);
      params.set("condition", nextCondition);
      if (smart) params.set("smart", "1");
      const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`search_http_${response.status}`);
      const data: SearchApiResponse = await response.json();
      if (sequence !== searchSequenceRef.current) return;
      setProducts(data.results || []);
      setProvider(data.provider || "Україна");
      setWarning(data.warning);
      setSmartMeta(data.smart || null);
      setSourceLinks(data.sourceLinks || []);
      setSourceStatuses(data.sourceStatuses || []);
      setCoverage(data.coverage || { totalOffers: 0, storeOffers: 0, privateOffers: 0, newOffers: 0, usedOffers: 0, sourceCount: 0 });
      setSearchQuality(data.quality);
      if (smart && data.smart) {
        if (nextCategory === "Усі" && data.smart.category) setCategory(data.smart.category);
        if (!nextMaxPrice && data.smart.budget) setMaxPrice(String(data.smart.budget));
        if (nextScope === "all" && data.smart.marketScope && data.smart.marketScope !== "all") setMarketScope(data.smart.marketScope);
        if (nextCondition === "all" && data.smart.condition && data.smart.condition !== "all") setConditionFilter(data.smart.condition);
      }
      setSearched(Boolean(nextQuery.trim() || nextCategory !== "Усі" || nextMaxPrice || nextScope !== "all" || nextCondition !== "all"));
    } catch (error) {
      if (sequence !== searchSequenceRef.current) return;
      setProducts([]);
      setSourceLinks([]);
      setSourceStatuses([]);
      setSmartMeta(null);
      setSearchQuality(undefined);
      setCoverage({ totalOffers: 0, storeOffers: 0, privateOffers: 0, newOffers: 0, usedOffers: 0, sourceCount: 0 });
      const aborted = error instanceof DOMException && error.name === "AbortError";
      recordClientIssue(aborted ? "search_timeout" : "search_error", error);
      setClientIssues(readClientDiagnosticLog());
      setWarning(aborted ? "Сервер не відповів у резервні 50 секунд. У v5.0.2 основний пошук має завершуватись значно раніше й повертати часткові результати без очікування повільних джерел. Спробуй повторити запит." : "Не вдалося виконати пошук. Перевір підключення й спробуй ще раз.");
    } finally {
      window.clearTimeout(timeout);
      if (sequence === searchSequenceRef.current) {
        setLoading(false);
        if (searchAbortRef.current === controller) searchAbortRef.current = null;
      }
    }
  }


  async function importProductUrl(manual = false) {
    const url = importUrl.trim();
    if (!url) {
      setImportResult({ ok: false, extraction: "manual", message: "Встав посилання на конкретний товар." });
      return;
    }
    setImportLoading(true);
    try {
      const manualPrice = Number(importManualPrice.replace(/[^0-9.]/g, ""));
      const response = await fetch("/api/import-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manual ? {
          url,
          manual: {
            title: importManualTitle.trim(),
            priceUah: manualPrice,
            imageUrl: importResult?.fields?.imageUrl,
            condition: importManualCondition,
          },
        } : { url }),
      });
      const data = await response.json() as ProductImportResponse;
      setImportResult(data);
      if (data.fields?.title) setImportManualTitle(data.fields.title);
      if (data.fields?.priceUah) setImportManualPrice(String(Math.round(data.fields.priceUah)));
      if (data.fields?.condition) setImportManualCondition(data.fields.condition);
      if (!response.ok && !data.message) throw new Error(`import_http_${response.status}`);
    } catch (error) {
      recordClientIssue("product_import", error);
      setClientIssues(readClientDiagnosticLog());
      setImportResult({ ok: false, extraction: "manual", message: "Імпорт не відповів. Перевір посилання або підтвердь назву й ціну вручну." });
    } finally {
      setImportLoading(false);
    }
  }

  function addImportedToResults(product: Product) {
    setProducts(current => [product, ...current.filter(item => item.id !== product.id)]);
    setSearched(true);
    setTab("search");
    setSelected(product);
  }

  function resetProductImport() {
    setImportUrl("");
    setImportResult(null);
    setImportManualTitle("");
    setImportManualPrice("");
    setImportManualCondition("new");
  }

  async function importProductBatch() {
    const urls = batchImportText.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 5);
    if (!urls.length) {
      setBatchImportResult({ ok: false, requestedCount: 0, successCount: 0, manualCount: 0, message: "Додай від 1 до 5 посилань — по одному в рядку.", results: [] });
      return;
    }
    setBatchImportLoading(true);
    try {
      const response = await fetch("/api/import-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await response.json() as ProductBatchImportResponse;
      setBatchImportResult(data);
      if (!response.ok && !data.message) throw new Error(`batch_import_http_${response.status}`);
    } catch (error) {
      recordClientIssue("product_batch_import", error);
      setClientIssues(readClientDiagnosticLog());
      setBatchImportResult({ ok: false, requestedCount: urls.length, successCount: 0, manualCount: urls.length, message: "Груповий імпорт не відповів. Спробуй ще раз або відкрий посилання по одному.", results: [] });
    } finally {
      setBatchImportLoading(false);
    }
  }

  function addBatchImportedToResults() {
    const imported = (batchImportResult?.results || []).flatMap(item => item.product ? [item.product] : []);
    if (!imported.length) return;
    setProducts(current => {
      const importedIds = new Set(imported.map(item => item.id));
      return [...imported, ...current.filter(item => !importedIds.has(item.id))];
    });
    setSearched(true);
    setTab("search");
    setSelected(imported[0]);
  }

  function compareBatchImported() {
    const imported = (batchImportResult?.results || []).flatMap(item => item.product ? [item.product] : []);
    if (!imported.length) return;
    setCompare(current => {
      const merged = [...current];
      for (const product of imported) {
        if (merged.length >= 3) break;
        if (!merged.some(item => item.id === product.id)) merged.push(product);
      }
      return merged;
    });
    setCompareOpen(true);
  }

  function moveBatchItemToManual(result: ProductImportResponse) {
    setImportBatchMode(false);
    setImportUrl(result.finalUrl || result.url || "");
    setImportResult(result);
    setImportManualTitle(result.fields?.title || "");
    setImportManualPrice(result.fields?.priceUah ? String(Math.round(result.fields.priceUah)) : "");
    setImportManualCondition(result.fields?.condition || "new");
  }

  function openMergedImportGroup(productIds: string[]) {
    const wanted = new Set(productIds);
    const productsToMerge = batchImportedProducts.filter(product => wanted.has(product.id));
    const merged = mergeImportedProductGroup(productsToMerge);
    if (!merged) return;
    addImportedToResults(merged);
  }

  function selectCategory(value: string) {
    setCategory(value);
    void runSearch(query, value, marketScope, conditionFilter, maxPrice, smartSearchActive);
  }

  function selectMarketScope(value: MarketScope) {
    setMarketScope(value);
    void runSearch(query, category, value, conditionFilter, maxPrice, smartSearchActive);
  }

  function selectCondition(value: ConditionFilter) {
    setConditionFilter(value);
    void runSearch(query, category, marketScope, value, maxPrice, smartSearchActive);
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

  function productCostProfiles(productId: string, source: Record<string, TotalCostProfile> = costProfiles) {
    return Object.values(source).filter(profile => profile.productId === productId);
  }

  async function syncPurchaseWorkspaceProduct(
    product: Product,
    overrides?: { shortlisted?: boolean; checklist?: string[]; costProfiles?: TotalCostProfile[] },
    key = syncKey,
    announce = false,
  ) {
    if (!key || !product?.id) return false;
    const item = {
      product,
      shortlisted: overrides?.shortlisted ?? Boolean(shortlist[product.id]),
      checklist: overrides?.checklist ?? (purchaseChecks[product.id] || []),
      costProfiles: overrides?.costProfiles ?? productCostProfiles(product.id),
    };
    try {
      const response = await fetchWithRetry("/api/purchase-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: key, item }),
      }, 3);
      const data = await response.json();
      if (data.cloud && data.tableReady === true) {
        setWorkspaceCloudReady(true);
        if (announce) setWorkspaceCloudMessage("До покупки, чекліст і розрахунки збережено в Supabase.");
        return true;
      }
      if (data.cloud && data.tableReady === false) {
        setWorkspaceCloudReady(false);
        setWorkspaceCloudMessage("Запусти supabase/update_to_latest.sql — після цього «До покупки», чекліст і кінцева ціна синхронізуватимуться між пристроями.");
      }
    } catch {
      if (announce) setWorkspaceCloudMessage("Хмарне збереження тимчасово не відповіло. Локальна копія залишилася на цьому пристрої.");
    }
    return false;
  }

  async function loadCloudPurchaseWorkspace(key = syncKey, mergeLocal = true) {
    if (!key) return;
    setWorkspaceSyncing(true);
    try {
      const response = await fetchWithRetry(`/api/purchase-workspace?token=${encodeURIComponent(key)}`, undefined, 3);
      const data = await response.json();
      if (data.cloud && data.tableReady === true) {
        setWorkspaceCloudReady(true);
        setWorkspaceCloudMessage("Кандидати на покупку, чеклісти та розрахунки кінцевої ціни синхронізуються через Supabase.");
        const items = Array.isArray(data.items) ? data.items : [];
        const cloudShortlist: Record<string, Product> = {};
        const cloudChecks: Record<string, string[]> = {};
        const cloudCosts: Record<string, TotalCostProfile> = {};
        const cloudIds = new Set<string>();
        for (const item of items) {
          const product = item?.product as Product | undefined;
          if (!product?.id) continue;
          cloudIds.add(product.id);
          if (item.shortlisted) cloudShortlist[product.id] = product;
          if (Array.isArray(item.checklist)) cloudChecks[product.id] = item.checklist.map(String);
          for (const profile of Array.isArray(item.costProfiles) ? item.costProfiles : []) {
            if (!profile?.productId || !profile?.sourceId) continue;
            cloudCosts[costProfileKey(profile.productId, profile.sourceId)] = profile as TotalCostProfile;
          }
        }

        let localShortlist: Record<string, Product> = {};
        let localWatchlist: Record<string, Product> = {};
        let localChecks: Record<string, string[]> = {};
        let localCosts: Record<string, TotalCostProfile> = {};
        if (mergeLocal) {
          try { localShortlist = JSON.parse(localStorage.getItem("smartbuy-shortlist-v1") || "{}"); } catch {}
          try { localWatchlist = JSON.parse(localStorage.getItem("smartbuy-watchlist-v3") || "{}"); } catch {}
          try { localChecks = JSON.parse(localStorage.getItem("smartbuy-purchase-checks-v1") || "{}"); } catch {}
          try { localCosts = JSON.parse(localStorage.getItem("smartbuy-total-cost-v1") || "{}"); } catch {}
        }

        const mergedShortlist = { ...localShortlist };
        for (const item of items) {
          const product = item?.product as Product | undefined;
          if (!product?.id) continue;
          if (item.shortlisted) mergedShortlist[product.id] = product; else delete mergedShortlist[product.id];
        }
        const mergedChecks = { ...localChecks, ...cloudChecks };
        const mergedCosts = { ...localCosts, ...cloudCosts };
        setShortlist(mergedShortlist);
        setPurchaseChecks(mergedChecks);
        setCostProfiles(mergedCosts);
        try {
          localStorage.setItem("smartbuy-shortlist-v1", JSON.stringify(mergedShortlist));
          localStorage.setItem("smartbuy-purchase-checks-v1", JSON.stringify(mergedChecks));
          localStorage.setItem("smartbuy-total-cost-v1", JSON.stringify(mergedCosts));
        } catch {}

        if (mergeLocal) {
          const localProducts = { ...localWatchlist, ...localShortlist };
          const localProductIds = new Set<string>([
            ...Object.keys(localShortlist),
            ...Object.keys(localChecks),
            ...Object.values(localCosts).map(profile => profile.productId),
          ]);
          for (const productId of localProductIds) {
            if (cloudIds.has(productId)) continue;
            const product = localProducts[productId];
            if (!product?.id) continue;
            const localProductCosts = Object.values(localCosts).filter(profile => profile.productId === product.id);
            void syncPurchaseWorkspaceProduct(product, { shortlisted: Boolean(localShortlist[product.id]), checklist: localChecks[product.id] || [], costProfiles: localProductCosts }, key, false);
          }
        }
        return;
      }
      if (data.cloud && data.tableReady === false) {
        setWorkspaceCloudReady(false);
        setWorkspaceCloudMessage("Потрібна таблиця Purchase Workspace. Запусти один накопичувальний файл supabase/update_to_latest.sql. Поки дані зберігаються локально.");
      } else {
        setWorkspaceCloudReady(false);
        setWorkspaceCloudMessage("Purchase Workspace зараз працює локально.");
      }
    } catch {
      setWorkspaceCloudMessage("Не вдалося оновити Purchase Workspace. Локальні дані не втрачено.");
    } finally {
      setWorkspaceSyncing(false);
    }
  }

  function toggleShortlist(product: Product) {
    const exists = Boolean(shortlist[product.id]);
    const next = { ...shortlist };
    if (exists) delete next[product.id]; else next[product.id] = product;
    setShortlist(next);
    try { localStorage.setItem("smartbuy-shortlist-v1", JSON.stringify(next)); } catch {}
    void syncPurchaseWorkspaceProduct(product, { shortlisted: !exists }, syncKey, false);
  }

  function togglePurchaseCheck(productId: string, checkId: string) {
    const existing = purchaseChecks[productId] || [];
    const nextForProduct = existing.includes(checkId) ? existing.filter(id => id !== checkId) : [...existing, checkId];
    const next = { ...purchaseChecks, [productId]: nextForProduct };
    setPurchaseChecks(next);
    try { localStorage.setItem("smartbuy-purchase-checks-v1", JSON.stringify(next)); } catch {}
    const product = shortlist[productId] || (selected?.id === productId ? selected : undefined);
    if (product) void syncPurchaseWorkspaceProduct(product, { checklist: nextForProduct }, syncKey, false);
  }

  function resetPurchaseChecklist(productId: string) {
    const next = { ...purchaseChecks, [productId]: [] };
    setPurchaseChecks(next);
    try { localStorage.setItem("smartbuy-purchase-checks-v1", JSON.stringify(next)); } catch {}
    const product = shortlist[productId] || (selected?.id === productId ? selected : undefined);
    if (product) void syncPurchaseWorkspaceProduct(product, { checklist: [] }, syncKey, false);
  }

  function updateCostDraft(field: "itemPrice" | "delivery" | "fees" | "taxes" | "discount", value: string) {
    const nextValue = Math.max(0, Number(String(value).replace(",", ".")) || 0);
    setCostDraft(current => current ? { ...current, [field]: nextValue } : current);
  }

  function updateCostCurrency(currency: SupportedCurrency) {
    setCostDraft(current => {
      if (!current) return current;
      const rate = currency === "UAH" ? 1 : (fxRates[currency] || 0);
      return { ...current, currency, exchangeRate: rate, rateUpdatedAt: rate > 0 ? fxUpdatedAt || current.rateUpdatedAt : current.rateUpdatedAt };
    });
  }

  function updateCostExchangeRate(value: string) {
    const nextValue = Math.max(0, Number(String(value).replace(",", ".")) || 0);
    setCostDraft(current => current ? { ...current, exchangeRate: nextValue } : current);
  }

  async function loadFxRates() {
    setFxLoading(true);
    setFxMessage("");
    try {
      const response = await fetch(`/api/fx`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.rates) throw new Error(data?.error || "fx_unavailable");
      const next: Partial<Record<SupportedCurrency, number>> = { UAH: 1 };
      for (const currency of supportedCurrencies) {
        const rate = Number(data.rates[currency]);
        if (Number.isFinite(rate) && rate > 0) next[currency] = rate;
      }
      setFxRates(next);
      setFxUpdatedAt(String(data.updatedAt || ""));
      setFxMessage("Курс оновлено");
      setCostDraft(current => {
        if (!current) return current;
        const currency = profileCurrency(current);
        const rate = currency === "UAH" ? 1 : next[currency];
        return rate ? { ...current, exchangeRate: rate, rateUpdatedAt: String(data.updatedAt || current.rateUpdatedAt || "") } : current;
      });
    } catch {
      setFxMessage("Не вдалося отримати курс — його можна ввести вручну");
    } finally {
      setFxLoading(false);
    }
  }

  function saveCostCalculation() {
    if (!selected || !costSourceId || !costDraft) return;
    const profile: TotalCostProfile = { ...costDraft, productId: selected.id, sourceId: costSourceId, updatedAt: new Date().toISOString() };
    const next = { ...costProfiles, [costProfileKey(selected.id, costSourceId)]: profile };
    setCostProfiles(next);
    try { localStorage.setItem("smartbuy-total-cost-v1", JSON.stringify(next)); } catch {}
    void syncPurchaseWorkspaceProduct(selected, { costProfiles: productCostProfiles(selected.id, next) }, syncKey, true);
  }

  function clearCostCalculation() {
    if (!selected || !costSourceId) return;
    const next = { ...costProfiles };
    delete next[costProfileKey(selected.id, costSourceId)];
    setCostProfiles(next);
    try { localStorage.setItem("smartbuy-total-cost-v1", JSON.stringify(next)); } catch {}
    void syncPurchaseWorkspaceProduct(selected, { costProfiles: productCostProfiles(selected.id, next) }, syncKey, false);
    const option = selectedCostOptions.find(item => item.id === costSourceId);
    setCostDraft(option ? { sourceName: option.sourceName, sourceKind: option.kind, itemPrice: option.offer?.price || 0, delivery: 0, fees: 0, taxes: 0, discount: 0, currency: "UAH", exchangeRate: 1, rateUpdatedAt: fxUpdatedAt || undefined } : null);
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

  async function ensurePushSubscription(key = syncKey, announce = true) {
    if (!key || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("unsupported"); return false;
    }
    if (Notification.permission !== "granted") { setPushState("off"); return false; }
    try {
      const configResponse = await fetchWithRetry("/api/push", undefined, 2);
      const config = await configResponse.json();
      if (!config?.supported || !config.publicKey) { setPushState("needs_keys"); return false; }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(config.publicKey) });
      const response = await fetchWithRetry("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: key, subscription: subscription.toJSON() }) }, 2);
      const data = await response.json();
      if (data?.tableReady === false) { setPushState("needs_sql"); if (announce) setNotificationMessage("Для Web Push запусти supabase/v5.0_production.sql."); return false; }
      if (!response.ok || !data?.ok) { setPushState("error"); return false; }
      setPushState("ready");
      if (announce) setNotificationMessage("Web Push активний: сповіщення можуть приходити навіть коли SmartBuy закритий.");
      return true;
    } catch {
      setPushState("error"); return false;
    }
  }

  async function requestBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) { setBrowserPermission("unsupported"); setPushState("unsupported"); return; }
    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission === "granted") await ensurePushSubscription(syncKey, true); else setPushState("off");
    } catch {
      setBrowserPermission(Notification.permission);
      setPushState("error");
    }
  }

  async function testWebPush() {
    if (pushState !== "ready" || !syncKey) return;
    try {
      const response = await fetchWithRetry("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, test: true }) }, 2);
      const data = await response.json();
      setNotificationMessage(data?.sent > 0 ? "Тестовий Web Push відправлено. Можеш закрити вкладку й перевірити наступні сповіщення." : "Push-підписка є, але тест не доставився. Перевір VAPID та дозволи браузера.");
    } catch { setNotificationMessage("Не вдалося відправити тестовий Web Push."); }
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
      await loadCloudPurchaseWorkspace(key, true);
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

  async function applySuggestedTarget(product: Product, amount: number) {
    const rounded = Math.max(100, Math.round(amount / 100) * 100);
    setTargetPrices(current => {
      const next = { ...current, [product.id]: rounded };
      localStorage.setItem("smartbuy-targets-v1", JSON.stringify(next));
      return next;
    });
    if (!watching[product.id]) {
      setWatching(current => { const next = { ...current, [product.id]: product }; localStorage.setItem("smartbuy-watchlist-v3", JSON.stringify(next)); return next; });
    }
    await saveWatchToCloud(product, rounded);
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
                lastSuccessfulAt: product.tracking?.lastSuccessfulAt || (product.tracking?.status === "ok" ? product.tracking.lastCheckedAt : undefined),
                lastSuccessfulPrice: product.tracking?.lastSuccessfulPrice || product.tracking?.lastSeenPrice || product.bestPrice,
                consecutiveMisses: (product.tracking?.consecutiveMisses || 0) + 1,
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
                lastSuccessfulAt: checkedAt,
                lastSuccessfulPrice: match.bestPrice,
                consecutiveMisses: 0,
              },
            };
            refreshedLocal[product.id] = updatedProduct;
            if (match.bestPrice < product.bestPrice) {
              const drop = product.bestPrice - match.bestPrice;
              const dropPercent = product.bestPrice > 0 ? drop / product.bestPrice * 100 : 0;
              await createManualNotification({ dedupeKey: `product:${product.id}:price:${Math.round(match.bestPrice)}`, kind: "price_drop", title: `Ціна впала на ${money.format(drop)}`, body: `${product.title}: ${money.format(product.bestPrice)} → ${money.format(match.bestPrice)} (−${dropPercent.toFixed(1)}%).`, entityType: "product", entityId: product.id, price: match.bestPrice, previousPrice: product.bestPrice });
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
    await loadCloudPurchaseWorkspace(clean, true);
    await loadNotifications(clean);
  }

  async function copySyncCode() {
    try { await navigator.clipboard.writeText(syncKey); } catch {}
  }

  const watchProducts = useMemo(() => Object.values(watching), [watching]);
  const shortlistProducts = useMemo(() => Object.values(shortlist), [shortlist]);
  const shortlistLowest = useMemo(() => shortlistProducts.length ? Math.min(...shortlistProducts.map(product => product.bestPrice)) : null, [shortlistProducts]);
  const savedDealCount = useMemo(() => savedSearches.filter(item => (item.dealDrop || 0) > 0).length, [savedSearches]);
  const unreadNotificationCount = useMemo(() => notifications.filter(item => !item.readAt).length, [notifications]);
  const visibleProducts = tab === "watch" ? watchProducts : tab === "shortlist" ? shortlistProducts : (tab === "saved" || tab === "notifications" || tab === "diagnostics") ? [] : products;
  const ukraineSourceLinks = useMemo(() => sourceLinks.filter(source => source.region === "ukraine" && source.kind !== "private"), [sourceLinks]);
  const internationalSourceLinks = useMemo(() => sourceLinks.filter(source => source.region === "international"), [sourceLinks]);
  const privateSourceLinks = useMemo(() => sourceLinks.filter(source => source.kind === "private"), [sourceLinks]);
  const diagnosticSourceStatuses = diagnostics?.sourceStatuses ?? [];
  const sourceReliability = useMemo(() => {
    const attempted = sourceStatuses.filter(item => item.state !== "not-run");
    const ok = attempted.filter(item => item.state === "ok");
    const stableOk = ok.filter(item => item.tier === "stable");
    const probeOk = ok.filter(item => item.tier === "probe");
    const blocked = attempted.filter(item => item.state === "blocked");
    const timedOut = attempted.filter(item => item.state === "timeout");
    const cached = attempted.filter(item => item.cached);
    const primary = attempted.filter(item => item.routerPhase === "primary");
    const expanded = attempted.filter(item => item.routerPhase === "expanded");
    const cooldown = sourceStatuses.filter(item => item.routerPhase === "cooldown");
    const strong = sourceStatuses.filter(item => item.routerHealth === "strong");
    const weak = sourceStatuses.filter(item => item.routerHealth === "weak");
    const scored = sourceStatuses.filter(item => typeof item.routerScore === "number");
    const avgRouterScore = scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.routerScore || 0), 0) / scored.length) : 0;
    const avgMs = attempted.length ? Math.round(attempted.reduce((sum, item) => sum + (item.durationMs || 0), 0) / attempted.length) : 0;
    return { attempted: attempted.length, ok: ok.length, stableOk: stableOk.length, probeOk: probeOk.length, blocked: blocked.length, timedOut: timedOut.length, cached: cached.length, avgMs, primary: primary.length, expanded: expanded.length, cooldown: cooldown.length, strong: strong.length, weak: weak.length, avgRouterScore };
  }, [sourceStatuses]);

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
          <button className={tab === "shortlist" ? "activeNav" : ""} onClick={() => setTab("shortlist")}>До покупки{shortlistProducts.length > 0 ? ` · ${shortlistProducts.length}` : ""}</button>
          <button className={tab === "saved" ? "activeNav" : ""} onClick={() => setTab("saved")}>Збережені{savedDealCount > 0 ? ` · ${savedDealCount}` : ""}</button>
          <button className={tab === "diagnostics" ? "activeNav" : ""} onClick={() => setTab("diagnostics")}><Activity size={14}/> Статус</button>
        </nav>
        <button className={`iconButton ${tab === "notifications" ? "activeBell" : ""}`} aria-label="Сповіщення" onClick={() => { setTab("notifications"); void loadNotifications(); }}>
          <Bell size={18}/>{unreadNotificationCount > 0 && <span className="badge">{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>}
        </button>
      </header>

      {tab !== "diagnostics" && <section className="hero" id="search">
        <div className="eyebrow"><Sparkles size={15}/> SmartBuy AI v5.0.2 · Partial Results & Timeout Fix</div>
        <h1>Знайди потрібну річ.<br/><span>Порівняй увесь ринок.</span></h1>
        <p>Українські магазини, приватні оголошення та закордонні майданчики в одному місці. SmartBuy показує автоматично підтверджені ціни окремо від прямих пошуків, щоб не вигадувати дані.</p>

        <form className="searchBox smartSearchBox" onSubmit={e => { e.preventDefault(); void runSearch(query, category, marketScope, conditionFilter, maxPrice, false); }}>
          <Search size={22}/>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Наприклад: ноутбук до 45 000 грн для ігор і роботи" />
          <div className="searchActions">
            <button type="submit" className="plainSearchButton" disabled={loading}>{loading && !smartSearchActive ? "Шукаю…" : "Знайти"}</button>
            <button type="button" className="smartSearchButton" disabled={loading || !query.trim()} onClick={() => void runSearch(query, category, marketScope, conditionFilter, maxPrice, true)}><Sparkles size={15}/>{loading && smartSearchActive ? "Підбираю…" : "Розумний підбір"}</button>
          </div>
        </form>

        <div className="quickRow">
          {quickSearches.map(q => <button key={q} onClick={() => { setQuery(q); void runSearch(q, category, marketScope, conditionFilter, maxPrice, false); }}>{q}</button>)}
        </div>
        <div className="smartExamples"><span>Можна написати звичайними словами:</span><button onClick={() => { const q = "ноутбук до 45000 грн для ігор і роботи, бажано хороша батарея"; setQuery(q); void runSearch(q, "Усі", marketScope, "all", "", true); }}>ноутбук до 45 000 грн для ігор</button><button onClick={() => { const q = "робот-пилосос до 20000 грн для шерсті тварин зі станцією"; setQuery(q); void runSearch(q, "Усі", marketScope, "all", "", true); }}>робот-пилосос для шерсті</button></div>
        <div className="importToggleRow">
          <button type="button" className={importOpen ? "active" : ""} onClick={() => setImportOpen(value => !value)}><Link2 size={15}/> Імпорт товару за посиланням</button>
          <span>OLX · Rozetka · Prom · Amazon · AliExpress · Temu та інші джерела з матриці</span>
        </div>
        {importOpen && <section className="productImportPanel">
          <div className="productImportHead">
            <div><Link2 size={18}/><span><b>Assisted Product Import</b><small>Імпортуй один товар або одразу 2–5 посилань для швидкого порівняння. SmartBuy не обходить captcha: заблоковані сторінки можна підтвердити вручну.</small></span></div>
            <button type="button" className="importClose" onClick={() => setImportOpen(false)}><X size={15}/></button>
          </div>
          <div className="importModeSwitch" role="tablist" aria-label="Режим імпорту">
            <button type="button" className={!importBatchMode ? "active" : ""} onClick={() => setImportBatchMode(false)}>1 посилання</button>
            <button type="button" className={importBatchMode ? "active" : ""} onClick={() => setImportBatchMode(true)}>2–5 посилань</button>
          </div>
          {!importBatchMode ? <>
            <div className="productImportForm">
              <input value={importUrl} onChange={e => { setImportUrl(e.target.value); if (importResult) setImportResult(null); }} placeholder="https://www.olx.ua/... або https://www.amazon.com/..." />
              <button type="button" onClick={() => void importProductUrl(false)} disabled={importLoading || !importUrl.trim()}>{importLoading ? <RefreshCw size={15} className="spin"/> : <Link2 size={15}/>} {importLoading ? "Читаю сторінку…" : "Імпортувати"}</button>
            </div>
            {importResult && <div className={`importResult ${importResult.ok ? "success" : importResult.blocked ? "blocked" : "manual"}`}>
              <div className="importResultMessage"><span>{importResult.ok ? <Check size={16}/> : importResult.blocked ? <ShieldCheck size={16}/> : <Info size={16}/>}</span><div><b>{importResult.sourceName || "Імпорт"} · {importResult.extraction === "automatic" ? "автоматично" : importResult.extraction === "partial" ? "частково" : "ручне підтвердження"}</b><p>{importResult.message}</p></div>{importResult.finalUrl && <a href={importResult.finalUrl} target="_blank" rel="noreferrer" title="Відкрити оригінал"><ExternalLink size={15}/></a>}</div>
              {importResult.product ? <div className="importProductPreview">
                <div className="importPreviewImage">{importResult.product.imageUrl ? <img src={importResult.product.imageUrl} alt=""/> : <span>{importResult.product.image}</span>}</div>
                <div className="importPreviewBody"><small>{importResult.sourceName}</small><h3>{importResult.product.title}</h3><div><b>{money.format(importResult.product.bestPrice)}</b>{importResult.fields?.currency && importResult.fields.currency !== "UAH" && importResult.fields.price ? <span>{formatCurrency(importResult.fields.price, supportedCurrencies.includes(importResult.fields.currency as SupportedCurrency) ? importResult.fields.currency as SupportedCurrency : "UAH")} · конвертовано в ₴</span> : null}</div></div>
                <div className="importPreviewActions"><button type="button" onClick={() => addImportedToResults(importResult.product!)}>Відкрити в SmartBuy</button><button type="button" onClick={() => toggleCompare(importResult.product!)}><GitCompareArrows size={14}/> Порівняти</button><button type="button" onClick={() => void toggleWatch(importResult.product!)}><Heart size={14}/> Відстежувати</button></div>
              </div> : <div className="manualImportForm">
                <div><label>Назва товару</label><input value={importManualTitle} onChange={e => setImportManualTitle(e.target.value)} placeholder="Точна назва / модель" /></div>
                <div><label>Ціна в гривні</label><input inputMode="numeric" value={importManualPrice} onChange={e => setImportManualPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="38999" /></div>
                <div><label>Стан</label><select value={importManualCondition} onChange={e => setImportManualCondition(e.target.value as "new" | "used" | "refurbished")}><option value="new">Новий</option><option value="used">Б/в</option><option value="refurbished">Відновлений</option></select></div>
                <button type="button" className="confirmManualImport" disabled={importLoading || !importManualTitle.trim() || Number(importManualPrice) <= 0 || !importResult.sourceId} onClick={() => void importProductUrl(true)}><Check size={15}/> Підтвердити й додати</button>
              </div>}
              <div className="importResultFoot"><span>SmartBuy зберігає оригінальне посилання.</span><button type="button" onClick={resetProductImport}>Очистити</button></div>
            </div>}
          </> : <>
            <div className="batchImportForm">
              <textarea value={batchImportText} onChange={e => { setBatchImportText(e.target.value); if (batchImportResult) setBatchImportResult(null); }} rows={5} placeholder={`Встав 2–5 посилань, кожне з нового рядка:\nhttps://rozetka.com.ua/...\nhttps://www.olx.ua/...\nhttps://www.amazon.com/...`} />
              <div className="batchImportAside"><b>Швидке порівняння</b><p>SmartBuy перевірить до 5 URL паралельно. У порівняння можна додати до 3 товарів.</p><button type="button" onClick={() => void importProductBatch()} disabled={batchImportLoading || !batchImportText.trim()}>{batchImportLoading ? <RefreshCw size={15} className="spin"/> : <GitCompareArrows size={15}/>} {batchImportLoading ? "Перевіряю…" : "Імпортувати список"}</button></div>
            </div>
            {batchImportResult && <div className="batchImportResult">
              <div className="batchImportSummary"><div><b>{batchImportResult.successCount} / {batchImportResult.requestedCount}</b><span>імпортовано автоматично</span></div><p>{batchImportResult.message}</p>{batchImportResult.successCount > 0 && <div><button type="button" onClick={addBatchImportedToResults}>Додати всі в SmartBuy</button><button type="button" onClick={compareBatchImported}><GitCompareArrows size={14}/> Порівняти до 3</button></div>}</div>
              {batchImportInsight.productCount >= 2 && <section className="batchVariantGuard">
                <div className="batchVariantGuardHead"><div><ShieldCheck size={16}/><span><b>Перевірка модифікацій</b><small>{batchImportInsight.summary}</small></span></div><strong>{batchImportInsight.variantConflicts.length ? `${batchImportInsight.variantConflicts.length} ризик` : "OK"}</strong></div>
                <div className="batchVariantGroups">
                  {batchImportInsight.groups.map(group => <div className={`batchVariantGroup ${group.count > 1 ? "mergeable" : "single"}`} key={group.id}>
                    <div><small>{group.count > 1 ? "Одна модифікація" : "Окремий товар"}</small><b>{group.label}</b><span>{group.sourceNames.join(" · ") || "джерело не визначено"}</span></div>
                    <div className="batchVariantPrice"><b>{group.minPrice ? money.format(group.minPrice) : "—"}</b>{group.count > 1 && group.spread > 0 && <small>різниця {money.format(group.spread)}</small>}</div>
                    {group.count > 1 && <button type="button" onClick={() => openMergedImportGroup(group.productIds)}><Store size={13}/> Об’єднати {group.count} продавців</button>}
                  </div>)}
                </div>
                {batchImportInsight.variantConflicts.length > 0 && <div className="batchVariantWarnings">
                  {batchImportInsight.variantConflicts.slice(0, 3).map(conflict => <div key={`${conflict.leftId}-${conflict.rightId}`}><TriangleAlert size={14}/><span><b>{conflict.message}</b><small>{conflict.leftTitle} ↔ {conflict.rightTitle}</small></span></div>)}
                </div>}
              </section>}
              <div className="batchImportList">
                {batchImportResult.results.map((item, index) => <div key={`${item.finalUrl || item.url || index}-${index}`} className={`batchImportItem ${item.product ? "success" : "manual"}`}>
                  <div className="batchImportStatus">{item.product ? <Check size={15}/> : item.blocked ? <ShieldCheck size={15}/> : <Info size={15}/>}</div>
                  <div className="batchImportBody"><small>{item.sourceName || `Посилання ${index + 1}`}</small>{item.product ? <><b>{item.product.title}</b><span>{money.format(item.product.bestPrice)} · {item.extraction === "automatic" ? "автоматично" : "підтверджено"}</span></> : <><b>Потрібне підтвердження</b><span>{item.message}</span></>}</div>
                  <div className="batchImportActions">{item.product ? <><button type="button" onClick={() => addImportedToResults(item.product!)}>Відкрити</button><button type="button" onClick={() => toggleCompare(item.product!)}><GitCompareArrows size={13}/></button></> : <button type="button" onClick={() => moveBatchItemToManual(item)}>Заповнити вручну</button>}{item.finalUrl && <a href={item.finalUrl} target="_blank" rel="noreferrer" title="Оригінальна сторінка"><ExternalLink size={14}/></a>}</div>
                </div>)}
              </div>
              <div className="importResultFoot"><span>Неповні товари не потрапляють у порівняння автоматично.</span><button type="button" onClick={() => { setBatchImportText(""); setBatchImportResult(null); }}>Очистити</button></div>
            </div>}
          </>}
        </section>}
      </section>}

      <section className="content" id="results">
        {tab === "search" && (
          <>
            <div className="sourceStatus marketStatus">
              <div><BadgeCheck size={18}/><b>SmartBuy AI v5.0.2</b><span>{provider}</span></div>
              <p><Info size={15}/> Зелені ціни — автоматично підтверджені. Adaptive Router ставить на перше місце джерела, які реально відповідають, розширює пошук лише коли потрібно й не обходить захист сайтів.</p>
            </div>

            {smartMeta && <section className="smartIntentCard">
              <div className="smartIntentIcon"><Sparkles size={20}/></div>
              <div className="smartIntentBody">
                <div className="smartIntentHead"><div><span>Розумний підбір</span><b>SmartBuy зрозумів твій запит</b></div><strong>{smartMeta.confidence}%</strong></div>
                <p>{smartMeta.explanation}</p>
                <div className="smartIntentPills">
                  {smartMeta.category && <span>{smartMeta.category}</span>}
                  {smartMeta.budget && <span>до {smartMeta.budget.toLocaleString("uk-UA")} ₴</span>}
                  {smartMeta.priorities.map(item => <span key={item}>{item}</span>)}
                </div>
                <div className="smartDerivedQuery"><small>Технічний запит для магазинів</small><code>{smartMeta.derivedQuery}</code></div>
              </div>
            </section>}

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

            {searched && searchQuality && (
              <section className="searchQualityCard">
                <div className="searchQualityHead"><div><BadgeCheck size={17}/><span>Якість групування</span><b>{searchQuality.averageGroupingConfidence || 0}%</b></div><small>v5.0.2 Variant + Timeout Guard</small></div>
                <div className="searchQualityGrid">
                  <div><span>Сирих пропозицій</span><b>{searchQuality.rawOfferCount}</b></div>
                  <div><span>Унікальних</span><b>{searchQuality.uniqueOfferCount}</b><small>{searchQuality.duplicateOffersRemoved ? `-${searchQuality.duplicateOffersRemoved} дублів` : "без дублів"}</small></div>
                  <div><span>Моделей</span><b>{searchQuality.productGroupCount}</b><small>{searchQuality.highConfidenceGroupCount} впевнено</small></div>
                  <div><span>Identity coverage</span><b>{searchQuality.identityCoverage}%</b><small>{searchQuality.ambiguousGroupCount ? `${searchQuality.ambiguousGroupCount} потребують уваги` : "без неоднозначних груп"}</small></div>
                  <div><span>Варіантів запиту</span><b>{searchQuality.queryVariants?.length || 1}</b><small>{searchQuality.queryExpansionSources ? `${searchQuality.queryExpansionSources} джерел спробували розширення` : "точного запиту вистачило"}</small></div>
                  <div><span>Expansion hits</span><b>{searchQuality.queryExpansionHits || 0}</b><small>{searchQuality.queryExpansionHits ? "джерел знайшли товар після переформулювання" : "без додаткових збігів"}</small></div>
                </div>
                {searchQuality.queryChanged && <p><Info size={14}/> Запит нормалізовано для магазинів: <code>{searchQuality.normalizedQuery}</code></p>}
                {searchQuality.queryVariants && searchQuality.queryVariants.length > 1 && <p className="queryExpansionLine"><Sparkles size={14}/> Безпечні варіанти запиту: {searchQuality.queryVariants.map((item, index) => <code key={`${item}-${index}`}>{item}</code>)}</p>}
              </section>
            )}

            {searched && sourceStatuses.length > 0 && (
              <div className="reliabilityStrip adaptiveReliability">
                <div><span>Автоперевірено</span><b>{sourceReliability.attempted}</b><small>{sourceReliability.primary} основних · {sourceReliability.expanded} додаткових</small></div>
                <div><span>Дали товари</span><b>{sourceReliability.ok}</b><small>{sourceReliability.stableOk} стабільних · {sourceReliability.probeOk} пробних</small></div>
                <div><span>Adaptive Router</span><b>{sourceReliability.avgRouterScore || "—"}</b><small>{sourceReliability.strong} сильних · {sourceReliability.cooldown} на паузі</small></div>
                <div><span>Захист сайтів</span><b>{sourceReliability.blocked}</b><small>{sourceReliability.timedOut ? `${sourceReliability.timedOut} тайм-аут` : "без тайм-аутів"}</small></div>
                <div><span>Швидкість</span><b>{sourceReliability.avgMs ? `${sourceReliability.avgMs} мс` : "—"}</b><small>{sourceReliability.cached ? `${sourceReliability.cached} з кешу` : "live-запити"}</small></div>
              </div>
            )}
            {searched && sourceStatuses.length > 0 && (
              <div className="sourceRouterHint"><ShieldCheck size={16}/><p><b>Adaptive Source Router:</b> SmartBuy спочатку опитує найнадійніші джерела. Якщо результатів уже достатньо, слабкі пробні джерела не запускаються; після captcha, блокування або повторних тайм-аутів джерело тимчасово ставиться на паузу.</p></div>
            )}

            {sourceLinks.length > 0 && (
              <section className="sourceLauncher">
                <div className="sourceLauncherHead">
                  <div><h3>Де SmartBuy шукає цей товар</h3><p>v5.0.2 повертає часткові результати без очікування повільних джерел; v5.0 додає International Live, посилені OLX/Rozetka конектори, seller data, точніший Variant Guard за кольором/SKU/регіоном і production-захист. Fair Price, Adaptive Router, Query Expansion та Seller Decision Engine залишаються.</p></div>
                  <span>{sourceLinks.filter(s => s.access === "live").length} стабільні · {sourceLinks.filter(s => s.access === "probe").length} пробні · {sourceLinks.filter(s => s.access === "direct").length} прямі</span>
                </div>

                <div className="sourceGroupSummary">
                  <div><Store size={17}/><span>Україна</span><b>{ukraineSourceLinks.length}</b><small>{coverage.totalOffers ? `${coverage.totalOffers} live-проп.` : "пошук"}</small></div>
                  <div><UserRound size={17}/><span>Приватні</span><b>{privateSourceLinks.length}</b><small>OLX / Shafa</small></div>
                  <div><Globe2 size={17}/><span>Закордон</span><b>{internationalSourceLinks.length}</b><small>прямий пошук</small></div>
                </div>

                <details className="sourceCapabilitiesPanel">
                  <summary><span><SlidersHorizontal size={15}/> Матриця можливостей джерел</span><b>{sourceLinks.length} джерел</b><ChevronDown size={15}/></summary>
                  <div className="sourceCapabilitiesIntro">
                    <p>Це не рейтинг магазинів. Матриця показує, <b>які дані SmartBuy реально може отримати або попросити ввести вручну</b> для кожного джерела.</p>
                    <div className="capabilityLegend"><span className="full">повністю</span><span className="partial">частково</span><span className="manual">вручну</span><span className="none">немає</span></div>
                  </div>
                  <div className="capabilityTableWrap">
                    <table className="capabilityTable">
                      <thead><tr><th>Джерело</th><th>Режим</th>{sourceCapabilityOrder.map(key => <th key={key}>{capabilityLabels[key]}</th>)}</tr></thead>
                      <tbody>
                        {sourceLinks.map(source => <tr key={source.id}>
                          <td><b>{source.name}</b><small>{source.region === "international" ? "закордон" : source.kind === "private" ? "від людей" : "Україна"} · {source.connectorAdapter || "—"} · {source.capabilityScore ?? 0}/100</small></td>
                          <td><span className={`capabilityAccess access-${source.access}`}>{source.access === "live" ? "live" : source.access === "probe" ? "проба" : source.access === "direct" ? "прямий" : "план"}</span></td>
                          {sourceCapabilityOrder.map(key => { const level: SourceCapabilityLevel = source.capabilities?.[key] ?? "none"; return <td key={key}><span title={`${capabilityLabels[key]}: ${capabilityLevelLabels[level]}`} className={`capabilityDot ${capabilityTone(level)}`}>{level === "full" ? "●" : level === "partial" ? "◐" : level === "manual" ? "M" : "—"}</span></td>; })}
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                </details>

                {ukraineSourceLinks.length > 0 && (
                  <details className="sourceGroup" open={marketScope !== "international"}>
                    <summary><span><Store size={16}/> Український ринок</span><b>{ukraineSourceLinks.length} джерел</b><ChevronDown size={16}/></summary>
                    <div className="sourceLinks">
                      {ukraineSourceLinks.map(source => {
                        const status = sourceStatuses.find(item => item.id === source.id);
                        const statusText = adaptiveSourceStatusText(source, status);
                        return <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className={`sourceChip ${source.kind} access-${source.access} ${status ? `status-${status.state} router-${status.routerPhase || "none"} health-${status.routerHealth || "unknown"}` : ""}`}><span>{source.kind === "private" ? <UserRound size={16}/> : <Store size={16}/>}</span><div><b>{source.name}</b><small>{statusText}</small><em>{usefulCapabilityCount(source)}/11 можливостей · {source.capabilityScore ?? 0}/100</em></div><ExternalLink size={14}/></a>;
                      })}
                    </div>
                  </details>
                )}

                {privateSourceLinks.length > 0 && (
                  <details className="sourceGroup" open={marketScope === "private"}>
                    <summary><span><UserRound size={16}/> Від людей</span><b>{privateSourceLinks.length} майданчики</b><ChevronDown size={16}/></summary>
                    <div className="sourceLinks privateLinks">
                      {privateSourceLinks.map(source => {
                        const status = sourceStatuses.find(item => item.id === source.id);
                        const statusText = adaptiveSourceStatusText(source, status);
                        return <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className={`sourceChip private access-${source.access} ${status ? `status-${status.state} router-${status.routerPhase || "none"} health-${status.routerHealth || "unknown"}` : ""}`}><span><UserRound size={16}/></span><div><b>{source.name}</b><small>{statusText}</small><em>{usefulCapabilityCount(source)}/11 можливостей · {source.capabilityScore ?? 0}/100</em></div><ExternalLink size={14}/></a>;
                      })}
                    </div>
                  </details>
                )}

                {internationalSourceLinks.length > 0 && (
                  <details className="sourceGroup" open={marketScope === "international"}>
                    <summary><span><Globe2 size={16}/> Закордон</span><b>{internationalSourceLinks.length} майданчики</b><ChevronDown size={16}/></summary>
                    <div className="sourceLinks internationalLinks">
                      {internationalSourceLinks.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="sourceChip international access-direct"><span><Globe2 size={16}/></span><div><b>{source.name}</b><small>відкрити точний запит</small><em>{usefulCapabilityCount(source)}/11 можливостей · {source.capabilityScore ?? 0}/100</em></div><ExternalLink size={14}/></a>)}
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

        {tab === "shortlist" && (
          <section className="buyingWorkspace">
            <div className="buyingWorkspaceHead">
              <div><div className="savedEyebrow"><ShoppingBag size={15}/> До покупки</div><h2>Кандидати на покупку</h2><p>Тут зберігаються товари, які ти реально розглядаєш. Відкрий товар, пройди чекліст і тільки після цього переходь до оплати.</p></div>
              <div className="buyingWorkspaceStats"><div><span>Товарів</span><b>{shortlistProducts.length}</b></div><div><span>Найнижча ціна</span><b>{shortlistLowest ? money.format(shortlistLowest) : "—"}</b></div></div>
            </div>
            <div className={`savedCloudState ${workspaceCloudReady === true ? "on" : workspaceCloudReady === false ? "off" : "checking"}`}>
              {workspaceCloudReady === true ? <Cloud size={16}/> : <CloudOff size={16}/>}
              <div><b>{workspaceCloudReady === true ? "Purchase Workspace у хмарі" : workspaceCloudReady === false ? "Purchase Workspace локально" : "Перевіряю Purchase Workspace"}</b><span>{workspaceCloudMessage || "SmartBuy перевіряє синхронізацію списку «До покупки», чеклістів і кінцевої ціни."}</span></div>
              <button className="workspaceRefresh" onClick={() => void loadCloudPurchaseWorkspace()} disabled={workspaceSyncing} title="Оновити з хмари"><RefreshCw size={14} className={workspaceSyncing ? "spin" : ""}/></button>
            </div>
            {shortlistProducts.length > 0 && <div className="buyingWorkflowNote"><ShieldCheck size={16}/><div><b>Покупка — це не тільки найнижча ціна</b><span>SmartBuy зберігає кандидатів окремо від відстеження ціни. Відкрий картку товару, щоб пройти перевірку продавця, гарантії, доставки й оплати.</span></div></div>}
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

        {tab === "diagnostics" && (
          <section className="diagnosticsPanel">
            <div className="diagnosticsHead">
              <div>
                <div className="savedEyebrow"><Activity size={15}/> Стан системи</div>
                <h2>SmartBuy Diagnostics</h2>
                <p>Перевіряє Vercel, Supabase, PWA та live-джерела без показу секретних ключів. Це допомагає швидко зрозуміти, що зламалось після Deploy.</p>
              </div>
              <div className="diagnosticsActions">
                <button onClick={() => void runDiagnostics(false)} disabled={diagnosticsLoading}><RefreshCw size={14} className={diagnosticsLoading ? "spin" : ""}/> Швидка перевірка</button>
                <button className="deepCheck" onClick={() => void runDiagnostics(true)} disabled={diagnosticsLoading}><Wifi size={14}/> Перевірити live-джерела</button>
                <button onClick={() => void copyDiagnosticReport()} disabled={!diagnostics}><Copy size={14}/> Копіювати звіт</button>
              </div>
            </div>

            {diagnosticMessage && <div className="diagnosticMessage"><Info size={14}/>{diagnosticMessage}</div>}

            <div className={`diagnosticsOverall ${diagnostics?.summary.error ? "error" : diagnostics?.summary.warn ? "warn" : diagnostics ? "ok" : "checking"}`}>
              <div className="diagnosticsOverallIcon">{diagnostics?.summary.error ? <TriangleAlert size={22}/> : diagnostics ? <ShieldCheck size={22}/> : <RefreshCw size={22} className={diagnosticsLoading ? "spin" : ""}/>}</div>
              <div>
                <b>{!diagnostics ? "Ще не перевірено" : diagnostics.summary.error ? "Є проблема, яку треба виправити" : diagnostics.summary.warn ? "Система працює, але є попередження" : "Основні компоненти працюють"}</b>
                <span>{diagnostics ? `Перевірено ${new Date(diagnostics.checkedAt).toLocaleString("uk-UA")} · ${diagnostics.summary.ok} OK · ${diagnostics.summary.warn} попереджень · ${diagnostics.summary.error} помилок` : "Відкрий цю вкладку або натисни «Швидка перевірка»."}</span>
              </div>
            </div>

            <div className="diagnosticSummaryGrid">
              <div><Server size={17}/><span>Версія</span><b>{diagnostics?.version || "5.0.2"}</b><small>{diagnostics?.environment || "—"}</small></div>
              <div><Database size={17}/><span>Supabase</span><b>{diagnostics?.cloudConfigured ? "Підключено" : diagnostics ? "Не налаштовано" : "—"}</b><small>ключі не показуються</small></div>
              <div><Wifi size={17}/><span>Інтернет</span><b>{clientRuntime ? (clientRuntime.online ? "Online" : "Offline") : "—"}</b><small>{clientRuntime?.serviceWorker === "active" ? "Service Worker активний" : clientRuntime?.serviceWorker === "supported" ? "Service Worker підтримується" : "Service Worker недоступний"}</small></div>
              <div><Bell size={17}/><span>Браузерні сповіщення</span><b>{clientRuntime?.notification === "granted" ? "Дозволені" : clientRuntime?.notification === "denied" ? "Заблоковані" : clientRuntime?.notification === "default" ? "Не запитані" : "Недоступні"}</b><small>{clientRuntime?.installed ? "PWA встановлена" : "веб-режим"}</small></div>
              <div><Bug size={17}/><span>Локальний журнал</span><b>{clientIssues.length}</b><small>останні помилки браузера</small></div>
            </div>

            <div className="diagnosticSection">
              <div className="diagnosticSectionHead"><div><h3>Перевірки сервера</h3><p>Кожен пункт перевіряється окремо, тому одна помилка не ховає інші.</p></div></div>
              {!diagnostics ? <div className="diagnosticEmpty">Натисни «Швидка перевірка».</div> : <div className="diagnosticCheckList">
                {diagnostics.checks.map(check => <article className={`diagnosticCheck ${check.status}`} key={check.id}>
                  <div className="diagnosticCheckIcon">{check.status === "ok" ? <Check size={16}/> : check.status === "error" ? <TriangleAlert size={16}/> : check.status === "warn" ? <Info size={16}/> : <Activity size={16}/>}</div>
                  <div><div className="diagnosticCheckTitle"><b>{check.label}</b><span>{check.status === "ok" ? "OK" : check.status === "error" ? "Помилка" : check.status === "warn" ? "Увага" : "Інфо"}</span>{check.durationMs != null && <small>{check.durationMs} мс</small>}</div><p>{check.summary}</p>{check.detail && <small>{check.detail}</small>}</div>
                </article>)}
              </div>}
            </div>

            {diagnosticSourceStatuses.length > 0 && <div className="diagnosticSection">
              <div className="diagnosticSectionHead"><div><h3>Стабільні live-джерела</h3><p>Глибока перевірка робить один тестовий пошук. Captcha та антибот SmartBuy не обходить.</p></div></div>
              <div className="diagnosticSourceGrid">
                {diagnosticSourceStatuses.map(source => <article className={`diagnosticSource ${source.state}`} key={source.id}>
                  <div><b>{source.name}</b><span>{source.tier === "stable" ? "stable" : "probe"}</span></div>
                  <strong>{source.state === "ok" ? `${source.offerCount} проп.` : source.state}</strong>
                  <small>{source.cached ? "кеш · " : ""}{source.durationMs} мс{source.attempts ? ` · ${source.attempts} спроб.` : ""}</small>
                  {source.message && <p>{source.message}</p>}
                </article>)}
              </div>
            </div>}

            <div className="diagnosticSection">
              <div className="diagnosticSectionHead"><div><h3>Останні помилки браузера</h3><p>Зберігаються тільки локально на цьому пристрої. Повідомлення очищаються від схожих на токени значень.</p></div><button className="diagClear" onClick={clearDiagnosticLog} disabled={clientIssues.length === 0}><Trash2 size={14}/> Очистити</button></div>
              {clientIssues.length === 0 ? <div className="diagnosticEmpty good"><BadgeCheck size={17}/> Зафіксованих помилок немає.</div> : <div className="clientIssueList">
                {clientIssues.map(issue => <article key={issue.id}><div><b>{issue.type}</b><span>{new Date(issue.at).toLocaleString("uk-UA")}</span></div><p>{issue.message}</p></article>)}
              </div>}
            </div>

            <div className="diagnosticPrivacy"><ShieldCheck size={16}/><div><b>Без секретів у звіті</b><span>Diagnostics показує лише факт наявності конфігурації. Значення `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, токени та паролі в API-відповідь не повертаються.</span></div></div>
          </section>
        )}

        {tab === "notifications" && (
          <section className="notificationPanel">
            <div className="notificationHead">
              <div><div className="savedEyebrow"><Bell size={15}/> Центр сповіщень</div><h2>Сповіщення</h2><p>Падіння ціни, досягнення цільової ціни та нові Deal Alerts зберігаються в хмарі.</p></div>
              <div className="notificationHeadActions">
                {(browserPermission !== "granted" || pushState !== "ready") && browserPermission !== "unsupported" && <button className="browserNotifyButton" onClick={() => void requestBrowserNotifications()}><Bell size={14}/> Увімкнути Web Push</button>}
                {pushState === "ready" && <button className="browserNotifyButton" onClick={() => void testWebPush()}><Zap size={14}/> Тест push</button>}
                <button onClick={() => void markAllNotificationsRead()} disabled={unreadNotificationCount === 0}><Check size={14}/> Прочитати всі</button>
                <button onClick={() => void loadNotifications()}><RefreshCw size={14}/> Оновити</button>
              </div>
            </div>
            <div className={`savedCloudState ${notificationCloudReady === true ? "on" : notificationCloudReady === false ? "off" : "checking"}`}>
              {notificationCloudReady === true ? <Cloud size={16}/> : <CloudOff size={16}/>}
              <div><b>{notificationCloudReady === true ? "Сповіщення у хмарі" : notificationCloudReady === false ? "Потрібна таблиця Notifications" : "Перевіряю центр сповіщень"}</b><span>{notificationMessage || "SmartBuy перевіряє Supabase."}</span></div>
            </div>
            {browserPermission === "granted" && pushState === "ready" && <div className="browserNotifyState"><BadgeCheck size={14}/><span><b>Справжній Web Push активний.</b> Сповіщення про ціну можуть приходити через service worker навіть коли вкладка SmartBuy повністю закрита.</span></div>}
            {browserPermission === "granted" && pushState === "needs_sql" && <div className="browserNotifyState denied"><Info size={14}/><span>Дозвіл браузера є, але потрібна таблиця push-підписок. Запусти <code>supabase/v5.0_production.sql</code>.</span></div>}
            {browserPermission === "granted" && pushState === "needs_keys" && <div className="browserNotifyState denied"><Info size={14}/><span>Для Web Push додай у Vercel <code>WEB_PUSH_PUBLIC_KEY</code>, <code>WEB_PUSH_PRIVATE_KEY</code> і <code>WEB_PUSH_SUBJECT</code>.</span></div>}
            {browserPermission === "granted" && pushState === "error" && <div className="browserNotifyState denied"><Info size={14}/><span>Web Push не активувався. Перевір VAPID, service worker та таблицю push-підписок.</span></div>}
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

        {tab !== "saved" && tab !== "notifications" && tab !== "diagnostics" && <>
        <div className="resultsHeader">
          <div>
            <h2>{tab === "watch" ? "Відстеження" : tab === "shortlist" ? "До покупки" : searched ? "Знайдені варіанти" : "Приклад об'єднаного ринку"}</h2>
            <p>{loading ? "Шукаю…" : tab === "watch" ? `${watchProducts.length} відстежується` : tab === "shortlist" ? `${shortlistProducts.length} кандидатів` : `${products.length} моделей · ${coverage.totalOffers} пропозицій`}</p>
          </div>
          {tab === "search" && <div className="resultsTools"><button className="saveSearchButton" onClick={saveCurrentSearch}><Bookmark size={15}/> Зберегти пошук</button><div className="filter"><SlidersHorizontal size={17}/><span>До</span><input inputMode="numeric" value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/\D/g, ""))} placeholder="ціна, ₴"/><button onClick={() => void runSearch(query, category, marketScope, conditionFilter, maxPrice, smartSearchActive)}>OK</button></div></div>}
        </div>
        {tab === "search" && savedMessage && <div className="searchSaveNotice"><Bookmark size={13}/>{savedMessage}</div>}

        {loading && tab === "search" ? <div className="loadingGrid">{[1,2,3].map(x => <div className="skeleton" key={x}/>)}</div> : visibleProducts.length === 0 ? (
          <div className="empty"><ShoppingBag size={32}/><h3>{tab === "watch" || tab === "shortlist" ? "Тут поки порожньо" : "Нічого не знайшов"}</h3><p>{tab === "watch" ? "Натисни сердечко на товарі — він зʼявиться тут." : tab === "shortlist" ? "Натисни «До покупки» на товарі, який реально розглядаєш." : "Спробуй коротший запит або вибери «Весь ринок»."}</p></div>
        ) : (
          <div className="grid">
            {visibleProducts.map((product, index) => {
              const newPrice = bestByCondition(product.offers, "new");
              const usedPrice = bestByCondition(product.offers, "used");
              const saving = newPrice && usedPrice && usedPrice < newPrice ? Math.round((1 - usedPrice / newPrice) * 100) : null;
              const previousTrackedPrice = Number(product.tracking?.previousBestPrice || 0);
              const currentTrackedPrice = Number(product.tracking?.lastSeenPrice || product.bestPrice || 0);
              const trackedDelta = previousTrackedPrice > 0 ? currentTrackedPrice - previousTrackedPrice : 0;
              const trackedPercent = previousTrackedPrice > 0 ? Math.abs(trackedDelta) / previousTrackedPrice * 100 : 0;
              const lastSuccessfulAt = product.tracking?.lastSuccessfulAt || (product.tracking?.status === "ok" ? product.tracking.lastCheckedAt : undefined);
              const lastSuccessfulPrice = Number(product.tracking?.lastSuccessfulPrice || product.tracking?.lastSeenPrice || product.bestPrice || 0);
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
                  <div className="scoreRow"><div className="score"><Sparkles size={14}/> Smart score {product.score}/100</div>{product.fitScore ? <div className={`fitScore ${product.fitScore >= 80 ? "great" : product.fitScore >= 65 ? "good" : "check"}`}><Target size={13}/> Підходить {product.fitScore}%</div> : null}</div>
                  <button className="titleButton" onClick={() => setSelected(product)}><h3>{product.title}</h3></button>
                  {product.fitReasons && product.fitReasons.length > 0 && <div className="fitReasons">{product.fitReasons.slice(0,3).map(reason => <span key={reason}><Check size={11}/>{reason}</span>)}</div>}
                  {product.fitWarnings && product.fitWarnings.length > 0 && <div className="fitWarnings">{product.fitWarnings.slice(0,2).map(reason => <span key={reason}>{reason}</span>)}</div>}
                  <p className="subtitle">{product.subtitle}</p>
                  {product.specs && product.specs.length > 0 && <div className="specChips">{product.specs.slice(0,4).map(spec => <span key={spec.key}><b>{spec.label}</b>{spec.value}</span>)}</div>}
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
                      {product.tracking.status === "ok" && previousTrackedPrice > 0 && <div className="trackingPriceFlow"><div><span>Було</span><strong>{money.format(previousTrackedPrice)}</strong></div><span className="trackingArrow">→</span><div><span>Зараз</span><strong>{money.format(currentTrackedPrice)}</strong></div>{trackedDelta !== 0 && <em className={trackedDelta < 0 ? "drop" : "rise"}>{trackedDelta < 0 ? "−" : "+"}{trackedPercent.toFixed(1)}%</em>}</div>}
                      {product.tracking.status === "not_found" && lastSuccessfulPrice > 0 && <div className="lastSeenBox"><span>Остання підтверджена ціна</span><b>{money.format(lastSuccessfulPrice)}</b>{lastSuccessfulAt && <small>{new Date(lastSuccessfulAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>}{(product.tracking.consecutiveMisses || 0) > 1 && <small>{product.tracking.consecutiveMisses} перевірки поспіль без точного збігу</small>}</div>}
                      {product.tracking.sourceNames && product.tracking.sourceNames.length > 0 && <div className="trackingSources"><span>Джерело ціни:</span>{product.tracking.sourceNames.map(source => <b key={source}>{source}</b>)}</div>}
                      {product.tracking.matchConfidence && <div className="matchConfidence">Точність збігу: <b>{product.tracking.matchConfidence}%</b>{product.tracking.offerCount ? ` · ${product.tracking.offerCount} проп.` : ""}</div>}
                      {product.tracking.message && <small>{product.tracking.message}</small>}
                      <button className="trackingOffersButton" onClick={() => setSelected(product)}>{product.tracking.status === "not_found" ? "Подивитися останні пропозиції" : "Подивитися пропозиції"}<ExternalLink size={13}/></button>
                    </div>
                  )}

                  {tab === "watch" && (
                    <div className="targetPriceBox">
                      <div><Target size={15}/><span>Цільова ціна</span></div>
                      <div><input inputMode="numeric" value={targetPrices[product.id] || ""} onChange={e => updateTarget(product, e.target.value)} placeholder="наприклад 25000"/><span>₴</span><button onClick={() => void commitTarget(product)}>Зберегти</button></div>
                      {targetPrices[product.id] && <small className={product.bestPrice <= targetPrices[product.id] ? "targetHit" : ""}>{product.bestPrice <= targetPrices[product.id] ? "Ціль уже досягнута" : `До цілі ще ${money.format(product.bestPrice - targetPrices[product.id])}`}</small>}
                    </div>
                  )}

                  <div className="cardActions cardActionsV21">
                    <button className={`compare ${compare.some(x => x.id === product.id) ? "selected" : ""}`} onClick={() => toggleCompare(product)}><GitCompareArrows size={15}/>{compare.some(x => x.id === product.id) ? "Додано" : "Порівняти"}</button>
                    <button className={`shortlistButton ${shortlist[product.id] ? "selected" : ""}`} onClick={() => toggleShortlist(product)}><ShoppingBag size={15}/>{shortlist[product.id] ? "До покупки ✓" : "До покупки"}</button>
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

      {compareOpen && <div className="modalBackdrop" onMouseDown={() => setCompareOpen(false)}>
        <div className="compareModal compareModalV17" onMouseDown={e => e.stopPropagation()}>
          <div className="modalHeader">
            <div><h2>Розумне порівняння</h2><p>Ціна, ринок, продавці та відповідність твоїм вимогам — в одному місці.</p></div>
            <button className="closeButton" onClick={() => setCompareOpen(false)}><X/></button>
          </div>

          {compare.length === 0 ? <div className="empty"><p>Додай товари кнопкою «Порівняти».</p></div> : <>
            <div className="comparePriorityBar">
              <div>
                <b>Що для тебе важливіше?</b>
                <span>{compare.length < 2 ? "Додай ще один товар для повного порівняння." : "SmartBuy перерахує рекомендацію без прихованих даних."}</span>
              </div>
              <div className="comparePriorityTabs">
                <button className={comparePriority === "balanced" ? "active" : ""} onClick={() => setComparePriority("balanced")}>Баланс</button>
                <button className={comparePriority === "price" ? "active" : ""} onClick={() => setComparePriority("price")}>Найнижча ціна</button>
                <button className={comparePriority === "fit" ? "active" : ""} disabled={!comparisonHasFit} title={!comparisonHasFit ? "Спочатку використай «Розумний підбір», щоб SmartBuy знав твої вимоги." : undefined} onClick={() => setComparePriority("fit")}>Під мої вимоги</button>
              </div>
            </div>

            {comparisonWinner && compare.length > 1 && <section className="compareDecision">
              <div className="compareDecisionTop">
                <div><Sparkles size={17}/><span><small>SmartBuy Decision Assistant</small><b>{comparePriority === "price" ? "Найвигідніша ціна за поточними даними" : comparePriority === "fit" ? "Найкраще під твої вимоги" : "Найкращий баланс зараз"}</b></span></div>
                <strong>{comparisonWinner.decisionScore}/100</strong>
              </div>
              <div className="compareDecisionBody">
                <div>
                  <h3>{comparisonWinner.product.title}</h3>
                  <p>{comparePriority === "price" ? `Має найсильнішу комбінацію ціни та надійності пропозицій серед ${compare.length} моделей.` : comparePriority === "fit" && comparisonWinner.product.fitScore != null ? `Відповідність твоєму запиту ${comparisonWinner.product.fitScore}%. SmartBuy також врахував ціну, Smart Value та покриття ринку.` : `SmartBuy врахував ціну, Smart Value, Smart score, кількість джерел і доступні сигнали відповідності.`}</p>
                </div>
                <div className="compareDecisionPrice"><span>від</span><b>{money.format(comparisonWinner.product.bestPrice)}</b></div>
              </div>
              <div className="compareDecisionReasons">
                {compareStrengths(comparisonWinner, comparisonProfiles).map(reason => <span key={reason}><Check size={12}/>{reason}</span>)}
                {comparisonWinner.valueOffer && <span><ShieldCheck size={12}/>{comparisonWinner.valueOffer.marketplace} · Smart Value {comparisonWinner.valueScore}/100</span>}
              </div>
              <p className="compareDecisionNote">Рекомендація базується тільки на даних, які SmartBuy реально бачить. Невідомі характеристики не домислюються.</p>
            </section>}

            <div className="comparisonCards">
              {comparisonProfiles.map(profile => {
                const product = profile.product;
                const strengths = compareStrengths(profile, comparisonProfiles);
                const isWinner = comparisonWinner?.product.id === product.id && compare.length > 1;
                return <article key={product.id} className={`comparisonCard ${isWinner ? "winner" : ""}`}>
                  <div className="comparisonCardTop">
                    <div className="comparisonThumb">{product.imageUrl ? <img src={product.imageUrl} alt={product.title}/> : product.image}</div>
                    <button className="comparisonRemove" onClick={() => toggleCompare(product)} aria-label="Прибрати з порівняння"><X size={14}/></button>
                  </div>
                  {isWinner && <div className="comparisonWinnerBadge"><Sparkles size={12}/> SmartBuy вибір</div>}
                  <h3>{product.title}</h3>
                  <p>{product.subtitle}</p>
                  <div className="comparisonMainPrice">{money.format(product.bestPrice)}</div>
                  <div className="comparisonScoreRow">
                    <span>Рішення <b>{profile.decisionScore}/100</b></span>
                    <span>Smart <b>{product.score}/100</b></span>
                    {product.fitScore != null && <span>Підходить <b>{product.fitScore}%</b></span>}
                  </div>
                  <div className="comparisonStrengths">{strengths.map(item => <span key={item}><Check size={11}/>{item}</span>)}</div>
                  <div className="comparisonMiniGrid">
                    <div><span>Пропозицій</span><b>{product.offers.length}</b></div>
                    <div><span>Джерел</span><b>{profile.sourceCount}</b></div>
                    <div><span>Smart Value</span><b>{profile.valueScore}/100</b></div>
                    <div><span>Перевірених</span><b>{profile.verifiedOffers}</b></div>
                  </div>
                </article>;
              })}
            </div>

            <div className="compareTableWrap">
              <table className="compareTable compareTableV17">
                <thead><tr><th>Показник</th>{comparisonProfiles.map(item => <th key={item.product.id}>{item.product.title}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Найнижча ціна</td>{comparisonProfiles.map(item => <td key={item.product.id} className={item.product.bestPrice === comparisonMinPrice ? "bestCell" : ""}><b>{money.format(item.product.bestPrice)}</b></td>)}</tr>
                  <tr><td>Нове від</td>{comparisonProfiles.map(item => <td key={item.product.id}>{bestByCondition(item.product.offers,"new") ? money.format(bestByCondition(item.product.offers,"new")!) : "—"}</td>)}</tr>
                  <tr><td>Б/в від</td>{comparisonProfiles.map(item => <td key={item.product.id}>{bestByCondition(item.product.offers,"used") ? money.format(bestByCondition(item.product.offers,"used")!) : "—"}</td>)}</tr>
                  <tr><td>Медіана ринку</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.median ? money.format(item.median) : "—"}</td>)}</tr>
                  <tr><td>Smart Value</td>{comparisonProfiles.map(item => <td key={item.product.id}><b>{item.valueScore}/100</b>{item.valueOffer ? <small className="compareCellSub">{item.valueOffer.marketplace}</small> : null}</td>)}</tr>
                  <tr><td>Smart score</td>{comparisonProfiles.map(item => <td key={item.product.id} className={item.product.score === comparisonMaxSmart ? "bestCell" : ""}>{item.product.score}/100</td>)}</tr>
                  {comparisonHasFit && <tr><td>Підходить під запит</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.product.fitScore != null ? `${item.product.fitScore}%` : "—"}</td>)}</tr>}
                  {comparisonSpecs.map(spec => <tr key={`spec-${spec.key}`} className="specCompareRow"><td>{spec.label}</td>{comparisonProfiles.map(item => <td key={item.product.id}>{specValue(item.product, spec.key) || "—"}</td>)}</tr>)}
                  <tr><td>Підтверджено характеристик</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.product.specCoverage != null ? `${item.product.specCoverage}%` : "—"}</td>)}</tr>
                  <tr><td>Відгуки</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.product.reviewInsights ? <><b>{item.product.reviewInsights.rating ? `${item.product.reviewInsights.rating.toFixed(1)}/5` : "є дані"}</b><small className="compareCellSub">{item.product.reviewInsights.reviewCount > 0 ? `${item.product.reviewInsights.reviewCount.toLocaleString("uk-UA")} оц.` : `${item.product.reviewInsights.snippetCount} текст. сигналів`}</small></> : "—"}</td>)}</tr>
                  <tr><td>Надійність відгуків</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.product.reviewInsights ? `${item.product.reviewInsights.confidence}%` : "—"}</td>)}</tr>
                  <tr><td>Джерел</td>{comparisonProfiles.map(item => <td key={item.product.id} className={item.sourceCount === comparisonMaxSources ? "bestCell" : ""}>{item.sourceCount}</td>)}</tr>
                  <tr><td>Пропозицій</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.product.offers.length}</td>)}</tr>
                  <tr><td>Перевірених продавців</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.verifiedOffers}</td>)}</tr>
                  <tr><td>Середня точність збігу</td>{comparisonProfiles.map(item => <td key={item.product.id}>{item.averageConfidence ? `${item.averageConfidence}%` : "—"}</td>)}</tr>
                  <tr><td>Ризикових пропозицій</td>{comparisonProfiles.map(item => <td key={item.product.id} className={item.riskyOffers === 0 ? "bestCell" : ""}>{item.riskyOffers}</td>)}</tr>
                  <tr><td>Сигнал ціни</td>{comparisonProfiles.map(item => <td key={item.product.id}><b>{item.historyInsight.label}</b><small className="compareCellSub">{item.historyInsight.detail}</small></td>)}</tr>
                </tbody>
              </table>
            </div>

            <section className="compareProsCons">
              {comparisonProfiles.map(profile => <div key={profile.product.id}>
                <h3>{profile.product.title}</h3>
                <div className="comparePros">{(profile.product.fitReasons?.length ? profile.product.fitReasons : profile.product.highlights).slice(0, 4).map(item => <span key={item}><Check size={12}/>{item}</span>)}</div>
                {(profile.product.fitWarnings?.length || profile.product.caution) ? <div className="compareCons">
                  {profile.product.fitWarnings?.slice(0, 3).map(item => <span key={item}><Info size={12}/>{item}</span>)}
                  {profile.product.caution && <span><Info size={12}/>{profile.product.caution}</span>}
                </div> : <small className="compareNoWarnings">Додаткових попереджень у доступних даних немає.</small>}
              </div>)}
            </section>
          </>}
        </div>
      </div>}

      
{selected && <div className="modalBackdrop detailBackdrop" onMouseDown={() => setSelected(null)}>
        <aside className="detailDrawer detailDrawerV11" onMouseDown={e => e.stopPropagation()}>
          <button className="closeButton drawerClose" onClick={() => setSelected(null)}><X/></button>
          <div className="detailHeroV11">
            <div className="detailVisual">{selected.imageUrl ? <img src={selected.imageUrl} alt={selected.title}/> : selected.image}</div>
            <div className="detailHeroInfo">
              <div className="scoreRow"><div className="score"><Sparkles size={14}/> Smart score {selected.score}/100</div>{selected.fitScore ? <div className={`fitScore ${selected.fitScore >= 80 ? "great" : selected.fitScore >= 65 ? "good" : "check"}`}><Target size={13}/> Підходить {selected.fitScore}%</div> : null}</div>
              <h2>{selected.title}</h2>
              {selected.fitReasons && selected.fitReasons.length > 0 && <div className="fitReasons detailFitReasons">{selected.fitReasons.map(reason => <span key={reason}><Check size={11}/>{reason}</span>)}</div>}
              <p className="subtitle">{selected.subtitle}</p>
              {selected.reviewInsights && <div className="detailReviewMini"><Star size={13} fill={selected.reviewInsights.rating ? "currentColor" : "none"}/><b>{selected.reviewInsights.rating ? selected.reviewInsights.rating.toFixed(1) : "Відгуки"}</b><span>{selected.reviewInsights.reviewCount > 0 ? `${selected.reviewInsights.reviewCount.toLocaleString("uk-UA")} оц.` : `${selected.reviewInsights.snippetCount} текст. сигналів`}</span><small>надійність {selected.reviewInsights.confidence}%</small></div>}
              <div className="detailPrice">від {money.format(selected.bestPrice)}</div>
              <div className="drawerTrackRow">
                <button className={`trackButton ${watching[selected.id] ? "saved" : ""}`} onClick={() => void toggleWatch(selected)}><Heart size={16} fill={watching[selected.id] ? "currentColor" : "none"}/>{watching[selected.id] ? "Відстежується" : "Відстежувати"}</button>
                <button className={`trackButton shortlistTrack ${shortlist[selected.id] ? "saved" : ""}`} onClick={() => toggleShortlist(selected)}><ShoppingBag size={16}/>{shortlist[selected.id] ? "У списку покупки" : "До покупки"}</button>
                <div className="drawerTarget"><Target size={14}/><input inputMode="numeric" value={targetPrices[selected.id] || ""} onChange={e => updateTarget(selected, e.target.value)} placeholder="цільова ціна"/><span>₴</span><button onClick={() => void commitTarget(selected)}>OK</button></div>
              </div>
            </div>
          </div>

          {selected.specs && selected.specs.length > 0 && <section className="productSpecsCard">
            <div className="productSpecsHead"><div><SlidersHorizontal size={17}/><span><small>Характеристики</small><h3>Що SmartBuy підтвердив із назв і пропозицій</h3></span></div><strong>{selected.specCoverage || 0}%</strong></div>
            <div className="productSpecsGrid">{selected.specs.map(spec => <div key={spec.key}><span>{spec.label}</span><b>{spec.value}</b><small>{spec.sourceCount > 0 ? `${spec.sourceCount} джер.` : "з картки товару"} · впевненість {spec.confidence}%</small></div>)}</div>
            <small className="productSpecsDisclaimer">SmartBuy показує лише характеристики, які вдалося витягнути з доступних назв/описів. Непідтверджені параметри не домислюються.</small>
          </section>}

          {selected.reviewInsights && <section className={`reviewIntelCard ${selected.reviewInsights.confidence >= 75 ? "strong" : selected.reviewInsights.confidence >= 50 ? "good" : "preliminary"}`}>
            <div className="reviewIntelHead">
              <div><MessageSquareText size={18}/><span><small>Review Intelligence</small><h3>Що кажуть доступні відгуки</h3></span></div>
              <strong>{selected.reviewInsights.rating ? <>{selected.reviewInsights.rating.toFixed(1)}<small>/5</small></> : <>{selected.reviewInsights.confidence}<small>%</small></>}</strong>
            </div>
            <p>{selected.reviewInsights.summary}</p>
            <div className="reviewIntelStats">
              <div><span>Оцінок</span><b>{selected.reviewInsights.reviewCount > 0 ? selected.reviewInsights.reviewCount.toLocaleString("uk-UA") : "—"}</b></div>
              <div><span>Текстових сигналів</span><b>{selected.reviewInsights.snippetCount}</b></div>
              <div><span>Джерел</span><b>{selected.reviewInsights.sourceCount}</b></div>
              <div><span>Надійність</span><b>{selected.reviewInsights.confidence}%</b><small>{selected.reviewInsights.label}</small></div>
            </div>
            {(selected.reviewInsights.positives.length > 0 || selected.reviewInsights.concerns.length > 0) && <div className="reviewThemeColumns">
              <div className="reviewPositives"><b><ThumbsUp size={13}/> Часті позитивні теми</b>{selected.reviewInsights.positives.length ? selected.reviewInsights.positives.map(item => <span key={item.id}><Check size={11}/><i><strong>{item.label}</strong><small>{item.mentions} згад. · {item.sourceCount} джер.</small></i></span>) : <small>Недостатньо тексту для надійного позитивного висновку.</small>}</div>
              <div className="reviewConcerns"><b><TriangleAlert size={13}/> На що скаржаться</b>{selected.reviewInsights.concerns.length ? selected.reviewInsights.concerns.map(item => <span key={item.id}><Info size={11}/><i><strong>{item.label}</strong><small>{item.mentions} згад. · {item.sourceCount} джер.</small></i></span>) : <small>У доступних текстових сигналах повторюваних проблем не виявлено.</small>}</div>
            </div>}
            {selected.reviewInsights.caveats.length > 0 && <div className="reviewCaveats">{selected.reviewInsights.caveats.map(item => <span key={item}><Info size={11}/>{item}</span>)}</div>}
            <small className="reviewIntelDisclaimer">SmartBuy не копіює повні відгуки й не вигадує проблеми. Теми формуються тільки з доступних агрегованих рейтингів і коротких текстових сигналів, що вдалося надійно прив’язати до цієї моделі.</small>
          </section>}

          {selectedFairPrice && <section className={`fairPriceCard ${selectedFairPrice.position.level}`}>
            <div className="fairPriceHead">
              <div><Banknote size={19}/><span><small>Fair Price Intelligence</small><h3>{selectedFairPrice.position.label}</h3></span></div>
              <strong>{selectedFairPrice.confidence}<small>%</small></strong>
            </div>
            <p>{selectedFairPrice.position.detail}</p>
            <div className="fairPriceStats">
              <div><span>Типовий діапазон</span><b>{selectedFairPrice.fairLow && selectedFairPrice.fairHigh ? `${money.format(selectedFairPrice.fairLow)} – ${money.format(selectedFairPrice.fairHigh)}` : "—"}</b><small>{selectedFairPrice.conditionScoped ? `ринок ${selectedFairPrice.conditionLabel} товарів` : "доступний ринок"}</small></div>
              <div><span>Середина ринку</span><b>{selectedFairPrice.fairMid ? money.format(selectedFairPrice.fairMid) : "—"}</b><small>{selectedFairPrice.position.deltaPct == null ? "—" : `${selectedFairPrice.position.deltaPct >= 0 ? "+" : ""}${selectedFairPrice.position.deltaPct}% для рекомендованої ціни`}</small></div>
              <div><span>Дані</span><b>{selectedFairPrice.sourceCount} джер. · {selectedFairPrice.sampleCount} цін</b><small>{selectedFairPrice.confidenceLabel} надійність</small></div>
              <div><span>Історичний мінімум</span><b>{selectedFairPrice.historyLow ? money.format(selectedFairPrice.historyLow) : "—"}</b><small>{selectedFairPrice.historySamples ? `${selectedFairPrice.historySamples} замір. історії` : "історії ще замало"}</small></div>
            </div>
            {selectedFairPrice.fairLow && selectedFairPrice.fairHigh && selectedFairPrice.marketMin && selectedFairPrice.marketMax && <div className="fairPriceRange" aria-label="Позиція ціни на ринку">
              <div className="fairPriceRangeTrack"><i className="fairBand" style={{ left: `${Math.max(0, Math.min(100, ((selectedFairPrice.fairLow - selectedFairPrice.marketMin) / Math.max(1, selectedFairPrice.marketMax - selectedFairPrice.marketMin)) * 100))}%`, width: `${Math.max(4, Math.min(100, ((selectedFairPrice.fairHigh - selectedFairPrice.fairLow) / Math.max(1, selectedFairPrice.marketMax - selectedFairPrice.marketMin)) * 100))}%` }}/>{selectedFairPrice.focusPrice && <i className="fairMarker" style={{ left: `${Math.max(0, Math.min(100, ((selectedFairPrice.focusPrice - selectedFairPrice.marketMin) / Math.max(1, selectedFairPrice.marketMax - selectedFairPrice.marketMin)) * 100))}%` }}/>}</div>
              <div className="fairPriceRangeLabels"><span>{money.format(selectedFairPrice.marketMin)}</span><b>типовий ринок</b><span>{money.format(selectedFairPrice.marketMax)}</span></div>
            </div>}
            {selectedFairPrice.reasons.length > 0 && <div className="fairPriceReasons">{selectedFairPrice.reasons.map(reason => <span key={reason}><Check size={11}/>{reason}</span>)}</div>}
            {selectedFairPrice.caveats.length > 0 && <div className="fairPriceCaveats">{selectedFairPrice.caveats.map(item => <span key={item}><Info size={10}/>{item}</span>)}</div>}
            <small className="fairPriceDisclaimer">Fair Price — статистична оцінка за доступними підтвердженими пропозиціями тієї ж моделі/модифікації. Вона не замінює перевірку стану, комплектації, гарантії та продавця.</small>
          </section>}

          {selectedPurchaseAction && selectedBestValue && selectedMetrics && <section className={`purchaseDecisionHub ${selectedPurchaseAction.level}`}>
            <div className="purchaseDecisionTop">
              <div className="purchaseDecisionTitle"><Zap size={19}/><div><span>SmartBuy рішення</span><h3>{selectedPurchaseAction.label}</h3></div></div>
              <strong>{selectedPurchaseAction.score}<small>/100</small></strong>
            </div>
            <p>{selectedPurchaseAction.summary}</p>
            <div className="purchaseDecisionStats">
              <div><span>Краща пропозиція</span><b>{money.format(selectedBestValue.price)}</b><small>{selectedBestValue.marketplace}</small></div>
              <div><span>Ціна зараз</span><b>{selectedPurchaseAction.priceSignal}</b><small>{selectedMetrics.median ? `медіана ${money.format(selectedMetrics.median)}` : "медіана ще не визначена"}</small></div>
              <div><span>Ринок</span><b>{selectedConfidence?.score || 0}/100</b><small>{selectedConfidence?.sources || 0} джер. · {selected.offers.length} проп.</small></div>
              <div><span>Ризик пропозиції</span><b>{sellerRiskScore(selectedBestValue, selectedMetrics.median).label}</b><small>{sellerRiskScore(selectedBestValue, selectedMetrics.median).score}/100</small></div>
            </div>
            {selectedPurchaseAction.reasons.length > 0 && <div className="purchaseDecisionReasons">{selectedPurchaseAction.reasons.map(reason => <span key={reason}><Check size={11}/>{reason}</span>)}</div>}
            <div className="purchaseDecisionActions">
              {selectedBestValue.url && <a href={selectedBestValue.url} target="_blank" rel="noreferrer">До кращої пропозиції <ExternalLink size={13}/></a>}
              <button onClick={() => document.getElementById("seller-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Порівняти продавців</button>
            </div>
            <small className="purchaseDecisionDisclaimer">Це допоміжний висновок за доступними цінами й даними. Перед оплатою перевір продавця, гарантію, комплектацію та умови повернення.</small>
          </section>}

          {selectedBuyTiming && <section className={`buyTimingCard ${selectedBuyTiming.level}`}>
            <div className="buyTimingHead">
              <div><Clock3 size={18}/><span><small>Price Timing</small><h3>{selectedBuyTiming.label}</h3></span></div>
              <strong>{selectedBuyTiming.score}<small>/100</small></strong>
            </div>
            <p>{selectedBuyTiming.summary}</p>
            <div className="buyTimingStats">
              <div><span>Надійність</span><b>{selectedBuyTiming.confidence}%</b><small>{selectedBuyTiming.sampleCount} замір. · {selectedBuyTiming.daysCovered} дн.</small></div>
              <div><span>До мінімуму</span><b>{selectedBuyTiming.currentVsMinPct == null ? "—" : `${selectedBuyTiming.currentVsMinPct >= 0 ? "+" : ""}${selectedBuyTiming.currentVsMinPct}%`}</b><small>{selectedBuyTiming.minPrice ? money.format(selectedBuyTiming.minPrice) : "замало даних"}</small></div>
              <div><span>До середньої</span><b>{selectedBuyTiming.currentVsAveragePct == null ? "—" : `${selectedBuyTiming.currentVsAveragePct >= 0 ? "+" : ""}${selectedBuyTiming.currentVsAveragePct}%`}</b><small>{selectedBuyTiming.averagePrice ? money.format(selectedBuyTiming.averagePrice) : "замало даних"}</small></div>
              <div><span>Останній тренд</span><b>{selectedBuyTiming.recentTrendPct == null ? "—" : `${selectedBuyTiming.recentTrendPct > 0 ? "+" : ""}${selectedBuyTiming.recentTrendPct}%`}</b><small>волатильність {selectedBuyTiming.volatilityPct == null ? "—" : `${selectedBuyTiming.volatilityPct}%`}</small></div>
            </div>
            {selectedBuyTiming.reasons.length > 0 && <div className="buyTimingReasons">{selectedBuyTiming.reasons.map(reason => <span key={reason}><Check size={11}/>{reason}</span>)}</div>}
            <div className="buyTimingActions">
              {selectedBuyTiming.suggestedTarget && <button onClick={() => void applySuggestedTarget(selected, selectedBuyTiming.suggestedTarget!)}><Target size={13}/> Стежити до {money.format(selectedBuyTiming.suggestedTarget)}</button>}
              {!watching[selected.id] && <button className="secondary" onClick={() => void toggleWatch(selected)}><Heart size={13}/> Додати у відстеження</button>}
            </div>
            {selectedBuyTiming.caveats.length > 0 && <div className="buyTimingCaveats">{selectedBuyTiming.caveats.map(item => <span key={item}><Info size={10}/>{item}</span>)}</div>}
          </section>}

          {selectedSellerTrust && selectedBestValue && <section className={`sellerTrustCard ${selectedSellerTrust.level}`}>
            <div className="sellerTrustHead">
              <div><ShieldCheck size={18}/><span><small>Довіра до продавця</small><h3>{selectedSellerTrust.label}</h3></span></div>
              <strong>{selectedSellerTrust.score}<small>/100</small></strong>
            </div>
            <div className="sellerTrustMeter"><i style={{ width: `${selectedSellerTrust.score}%` }}/></div>
            <p>{selectedSellerTrust.summary}</p>
            <div className="sellerTrustStats">
              <div><span>Продавець</span><b>{selectedBestValue.sellerName || selectedBestValue.store}</b><small>{selectedBestValue.marketplace}</small></div>
              <div><span>Гарантія</span><b>{selectedSellerTrust.warrantyLabel}</b><small>{selectedSellerTrust.warrantyScore}/100</small></div>
              <div><span>Доставка / огляд</span><b>{selectedSellerTrust.deliveryLabel}</b><small>{selectedSellerTrust.deliveryScore}/100</small></div>
              <div><span>Оплата</span><b>{selectedSellerTrust.paymentLabel}</b><small>{selectedSellerTrust.paymentScore}/100</small></div>
              <div><span>Рейтинг продавця</span><b>{selectedSellerTrust.sellerRatingLabel}</b><small>{selectedBestValue.sellerReviewCount ? "дані майданчика" : "якщо доступно"}</small></div>
              <div><span>Історія продавця</span><b>{selectedSellerTrust.sellerHistoryLabel}</b><small>{selectedBestValue.sellerSince ? "отримано зі сторінки" : "потрібна перевірка"}</small></div>
              <div><span>Повернення</span><b>{selectedSellerTrust.returnLabel}</b><small>{selectedBestValue.returnPolicy ? "умови знайдено" : "уточни перед оплатою"}</small></div>
            </div>
            {(selectedSellerTrust.strengths.length > 0 || selectedSellerTrust.checks.length > 0) && <div className="sellerSignalColumns">
              <div><b>Що виглядає добре</b>{selectedSellerTrust.strengths.length ? selectedSellerTrust.strengths.map(item => <span className={`sellerSignal ${item.tone}`} key={item.label}><Check size={11}/><i><strong>{item.label}</strong><small>{item.detail}</small></i></span>) : <span className="sellerSignal neutral"><Info size={11}/><i><strong>Потрібно більше даних</strong><small>SmartBuy не бачить достатньо позитивних сигналів у доступних полях.</small></i></span>}</div>
              <div><b>Що перевірити</b>{selectedSellerTrust.checks.length ? selectedSellerTrust.checks.map(item => <span className={`sellerSignal ${item.tone}`} key={item.label}><Info size={11}/><i><strong>{item.label}</strong><small>{item.detail}</small></i></span>) : <span className="sellerSignal good"><Check size={11}/><i><strong>Критичних сигналів немає</strong><small>Все одно перевір умови безпосередньо на сторінці продавця перед оплатою.</small></i></span>}</div>
            </div>}
            <small className="sellerTrustDisclaimer">Оцінка побудована лише на доступних SmartBuy сигналах: тип продавця, збіг моделі, гарантія, доставка, ціна та позначки довіри. Вона не є гарантією доброчесності продавця.</small>
          </section>}

          {selected && selectedCostOptions.length > 0 && <section className="totalCostCard">
            <div className="totalCostHead">
              <div><ShoppingBag size={18}/><span><small>Реальна кінцева ціна</small><h3>Порахуй скільки заплатиш насправді</h3></span></div>
              <strong>{costDraft ? money.format(selectedCostTotal) : "—"}{costDraft && selectedCostCurrency !== "UAH" && <small>{formatCurrency(selectedCostSourceTotal, selectedCostCurrency)} · курс {profileExchangeRate(costDraft) || "—"}</small>}</strong>
            </div>
            <p>Порівнюй Україну й закордон в одній валюті. Для AliExpress / Temu / Amazon введи суму так, як її показує майданчик, вибери валюту — SmartBuy переведе кінцеву вартість у гривню.</p>
            <label className="costSourceSelect"><span>Джерело / продавець</span><select value={costSourceId} onChange={e => setCostSourceId(e.target.value)}>{selectedCostOptions.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
            {costDraft && <div className="costFxControls">
              <label><span>Валюта розрахунку</span><select value={selectedCostCurrency} disabled={selectedCostOption?.kind === "offer"} onChange={e => updateCostCurrency(e.target.value as SupportedCurrency)}>{supportedCurrencies.map(currency => <option key={currency} value={currency}>{currency} · {currencyNames[currency]}</option>)}</select><small>{selectedCostOption?.kind === "offer" ? "українська live-пропозиція вже в гривні" : "вибери валюту, яку бачиш на сайті"}</small></label>
              {selectedCostCurrency !== "UAH" && <label><span>Курс до гривні</span><div><input inputMode="decimal" value={costDraft.exchangeRate || ""} onChange={e => updateCostExchangeRate(e.target.value)} placeholder="0"/><b>₴ за 1 {selectedCostCurrency}</b></div><small>{costDraft.rateUpdatedAt ? `автокурс · ${costDraft.rateUpdatedAt}` : "можна ввести курс вручну"}</small></label>}
              <button type="button" onClick={() => void loadFxRates()} disabled={fxLoading}><RefreshCw size={12} className={fxLoading ? "spin" : ""}/>{fxLoading ? "Оновлюю…" : "Оновити курс"}</button>
              {fxMessage && <span className="fxMessage">{fxMessage}</span>}
            </div>}
            {costDraft && <div className="costCalculatorGrid">
              <label><span>Товар</span><div><input inputMode="decimal" value={costDraft.itemPrice || ""} readOnly={selectedCostOption?.kind === "offer"} onChange={e => updateCostDraft("itemPrice", e.target.value)} placeholder="0"/><b>{currencySymbols[selectedCostCurrency]}</b></div><small>{selectedCostOption?.kind === "offer" ? "ціна з SmartBuy" : "введи ціну з майданчика"}</small></label>
              <label><span>Доставка</span><div><input inputMode="decimal" value={costDraft.delivery || ""} onChange={e => updateCostDraft("delivery", e.target.value)} placeholder="0"/><b>{currencySymbols[selectedCostCurrency]}</b></div></label>
              <label><span>Комісії</span><div><input inputMode="decimal" value={costDraft.fees || ""} onChange={e => updateCostDraft("fees", e.target.value)} placeholder="0"/><b>{currencySymbols[selectedCostCurrency]}</b></div></label>
              <label><span>Податки / мито</span><div><input inputMode="decimal" value={costDraft.taxes || ""} onChange={e => updateCostDraft("taxes", e.target.value)} placeholder="0"/><b>{currencySymbols[selectedCostCurrency]}</b></div></label>
              <label><span>Знижка / купон</span><div><input inputMode="decimal" value={costDraft.discount || ""} onChange={e => updateCostDraft("discount", e.target.value)} placeholder="0"/><b>{currencySymbols[selectedCostCurrency]}</b></div></label>
              <div className="costTotalBox"><span>Разом до оплати</span><b>{money.format(selectedCostTotal)}</b>{selectedCostCurrency !== "UAH" && <small>{formatCurrency(selectedCostSourceTotal, selectedCostCurrency)} × {profileExchangeRate(costDraft) || 0}</small>}<small>товар + доставка + комісії + податки − знижки</small></div>
            </div>}
            <div className="costActions">
              <button className="costSave" onClick={saveCostCalculation}>Зберегти розрахунок</button>
              {selected && costProfiles[costProfileKey(selected.id, costSourceId)] && <button className="costClear" onClick={clearCostCalculation}>Очистити</button>}
              {selectedCostOption?.kind === "manual" && marketJumpLinks(selected.title).find(link => link.name === selectedCostOption.sourceName)?.url && <a href={marketJumpLinks(selected.title).find(link => link.name === selectedCostOption.sourceName)!.url} target="_blank" rel="noreferrer">Відкрити {selectedCostOption.sourceName} <ExternalLink size={12}/></a>}
            </div>
            {selectedCostProfiles.length > 0 && <div className="costComparison">
              <div className="costComparisonTitle"><b>Збережені кінцеві ціни</b><span>{selectedCostProfiles.length} розрах.</span></div>
              {selectedCostProfiles.slice(0,6).map((profile, index) => { const currency = profileCurrency(profile); return <button key={profile.sourceId} onClick={() => setCostSourceId(profile.sourceId)} className={profile.sourceId === costSourceId ? "active" : ""}><span>{index === 0 ? <Check size={11}/> : null}{profile.sourceName}</span><strong>{money.format(totalCost(profile))}</strong><small>{currency !== "UAH" ? `${formatCurrency(sourceTotalCost(profile), currency)} · курс ${profileExchangeRate(profile) || "—"}` : profile.sourceKind === "manual" ? "введено вручну" : "на основі пропозиції SmartBuy"}</small></button>; })}
            </div>}
            {selectedCrossMarket && <div className="crossMarketCard">
              <div className="crossMarketHead"><span><ArrowLeftRight size={15}/> Україна vs закордон</span><small>за збереженими повними розрахунками</small></div>
              <div className="crossMarketGrid">
                <div className={selectedCrossMarket.cheaper === "domestic" ? "winner" : ""}><span>🇺🇦 Україна</span>{selectedCrossMarket.domestic ? <><b>{money.format(totalCost(selectedCrossMarket.domestic))}</b><small>{selectedCrossMarket.domestic.sourceName}</small></> : <><b>—</b><small>додай розрахунок української пропозиції</small></>}</div>
                <div className={selectedCrossMarket.cheaper === "international" ? "winner" : ""}><span>🌍 Закордон</span>{selectedCrossMarket.international ? <><b>{money.format(totalCost(selectedCrossMarket.international))}</b><small>{selectedCrossMarket.international.sourceName}</small></> : <><b>—</b><small>додай AliExpress / Temu / Amazon</small></>}</div>
              </div>
              {selectedCrossMarket.cheaper && <div className="crossMarketVerdict"><Banknote size={14}/><span>{selectedCrossMarket.cheaper === "domestic" ? "Україна" : "Закордон"} дешевше після всіх введених витрат на <b>{money.format(selectedCrossMarket.difference)}</b>{selectedCrossMarket.percent > 0 ? ` (${selectedCrossMarket.percent}%)` : ""}.</span></div>}
            </div>}
            <small className="costDisclaimer">Автокурс використовується лише для конвертації. SmartBuy не вигадує доставку, мито або комісії: у кінцеву суму входять тільки твої числа. Якщо банк/майданчик застосовує власний курс, його можна вручну замінити в полі курсу.</small>
          </section>}

          {selectedBestValue && <section className={`buyingChecklistCard ${selectedChecklistProgress === 100 ? "complete" : ""}`}>
            <div className="buyingChecklistHead">
              <div><ShieldCheck size={18}/><span><small>Перед оплатою</small><h3>{selectedChecklistProgress === 100 ? "Чекліст покупки пройдено" : "Перевір покупку крок за кроком"}</h3></span></div>
              <strong>{selectedChecklistProgress}%</strong>
            </div>
            <div className="buyingChecklistProgress"><i style={{ width: `${selectedChecklistProgress}%` }}/></div>
            <p>Відмічай тільки те, що ти реально перевірив. SmartBuy не ставить галочки автоматично.</p>
            <div className="buyingChecklistItems">
              {selectedPurchaseChecklist.map(item => { const checked = selectedCompletedChecks.includes(item.id); return <button key={item.id} className={checked ? "done" : ""} onClick={() => togglePurchaseCheck(selected.id, item.id)}><span className="checkBox">{checked ? <Check size={13}/> : null}</span><span><b>{item.label}</b>{item.detail && <small>{item.detail}</small>}</span></button>; })}
            </div>
            <div className="buyingChecklistFooter">
              <button className={`workflowSave ${shortlist[selected.id] ? "saved" : ""}`} onClick={() => toggleShortlist(selected)}><ShoppingBag size={14}/>{shortlist[selected.id] ? "Збережено до покупки" : "Зберегти до покупки"}</button>
              {selectedChecklistProgress > 0 && <button className="workflowReset" onClick={() => resetPurchaseChecklist(selected.id)}>Скинути галочки</button>}
              {selectedBestValue.url && selectedChecklistProgress === 100 && <a href={selectedBestValue.url} target="_blank" rel="noreferrer">Перейти до продавця <ExternalLink size={12}/></a>}
            </div>
            <small className="buyingChecklistDisclaimer">Чекліст зберігається локально у цьому браузері. Галочка означає лише те, що ти сам підтвердив пункт.</small>
          </section>}

          <details className="marketDiagnostics">
            <summary><span><SlidersHorizontal size={15}/> Детальний аналіз ринку</span><small>впевненість, готовність, канали та причини розкиду цін</small><ChevronDown size={16}/></summary>
            <div className="marketDiagnosticsBody">
          {selectedConfidence && <section className={`marketConfidenceCard ${selectedConfidence.level}`}>
            <div className="marketConfidenceTop">
              <div className="marketConfidenceTitle"><ShieldCheck size={18}/><div><span>Впевненість у висновку по ринку</span><h3>{selectedConfidence.label}</h3></div></div>
              <strong>{selectedConfidence.score}<small>/100</small></strong>
            </div>
            <div className="confidenceMeter"><i style={{ width: `${selectedConfidence.score}%` }}/></div>
            <p>{selectedConfidence.detail}</p>
            <div className="confidenceFacts">
              <div><span>Джерел</span><b>{selectedConfidence.sources}</b></div>
              <div><span>Пропозицій</span><b>{selectedConfidence.offers}</b></div>
              <div><span>Точність збігу</span><b>{selectedConfidence.avgMatch || 0}%</b></div>
              <div><span>Перевірених</span><b>{selectedConfidence.trustedCount}</b></div>
              <div><span>Розкид цін</span><b>{selectedConfidence.spreadPct}%</b></div>
            </div>
            <small className="confidenceDisclaimer">Це оцінка повноти й узгодженості доступних даних, а не гарантія безпечності продавця.</small>
          </section>}

          {selectedReadiness && <section className={`purchaseReadiness ${selectedReadiness.level}`}>
            <div className="readinessTop">
              <div className="readinessTitle"><Target size={18}/><div><span>Готовність до покупки</span><h3>{selectedReadiness.label}</h3></div></div>
              <strong>{selectedReadiness.score}<small>/100</small></strong>
            </div>
            <div className="readinessMeter"><i style={{ width: `${selectedReadiness.score}%` }}/></div>
            <p>{selectedReadiness.summary}</p>
            <div className="readinessColumns">
              <div className="readinessGood"><b><Check size={14}/> Що виглядає добре</b>{selectedReadiness.positives.length ? selectedReadiness.positives.map(item => <span key={item}><Check size={11}/>{item}</span>) : <span><Info size={11}/>Позитивних сигналів поки мало</span>}</div>
              <div className="readinessChecks"><b><ShieldCheck size={14}/> Перевір перед оплатою</b>{selectedReadiness.checks.map(item => <span key={item}><Info size={11}/>{item}</span>)}</div>
            </div>
            <small className="readinessDisclaimer">SmartBuy не підтверджує особу продавця і не гарантує угоду. Це оцінка лише за доступними даними про товар, ціну та пропозицію.</small>
          </section>}

          {selectedMetrics && <section className="dealDashboard">
            <div className="dealDashboardHeader"><div><span>SmartBuy Market Check</span><h3>Де вигідніше купити зараз</h3></div>{selectedMetrics.best?.marketplace && <b>{selectedMetrics.best.marketplace}</b>}</div>
            {selectedBestValue && <div className="bestValueBanner">
              <div><Sparkles size={16}/><span><b>Рекомендовано Decision Engine</b><small>{selectedBestValue.marketplace} · {conditionLabel(selectedBestValue.condition)} · Decision {selectedOfferDecision?.recommended?.score || 0}/100 · Smart Value {offerValueScore(selectedBestValue, selectedMetrics.median)}/100</small></span></div>
              <strong>{money.format(selectedOfferDecision?.recommended?.finalCostUsed ? selectedOfferDecision.recommended.effectivePrice : selectedBestValue.price)}</strong>
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

          {selectedConfidence && <section className="priceExplainCard">
            <div className="priceExplainHead"><div><Info size={17}/><span><b>Чому ціни відрізняються</b><small>SmartBuy пояснює розкид лише за тими полями, які реально бачить у пропозиціях.</small></span></div>{selectedConfidence.median ? <strong>медіана {money.format(selectedConfidence.median)}</strong> : null}</div>
            <div className="priceExplainGrid">
              {selectedPriceReasons.map((reason, index) => <div className={`priceReason ${reason.tone}`} key={`${reason.title}-${index}`}><b>{reason.title}</b><p>{reason.detail}</p></div>)}
            </div>
            <div className="marketBreakdownGrid">
              <div><span>Нове</span><b>{bestByCondition(selected.offers, "new") ? money.format(bestByCondition(selected.offers, "new")!) : "—"}</b><small>{selected.offers.filter(o => o.condition === "new").length} проп.</small></div>
              <div><span>Б/в / відновлене</span><b>{bestByCondition(selected.offers, "used") ? money.format(bestByCondition(selected.offers, "used")!) : "—"}</b><small>{selected.offers.filter(o => o.condition !== "new").length} проп.</small></div>
              <div><span>Магазини</span><b>{bestBySellerType(selected.offers, "store") ? money.format(bestBySellerType(selected.offers, "store")!.price) : "—"}</b><small>{selected.offers.filter(o => o.sellerType === "store").length} проп.</small></div>
              <div><span>Від людей</span><b>{bestBySellerType(selected.offers, "private") ? money.format(bestBySellerType(selected.offers, "private")!.price) : "—"}</b><small>{selected.offers.filter(o => o.sellerType === "private").length} проп.</small></div>
            </div>
          </section>}

            </div>
          </details>

          <h3><TrendingDown size={16}/> Історія ціни</h3>
          <PriceHistoryChart points={history.length ? history : (selected.priceHistory || [])} currentPrice={selected.bestPrice}/>
          <p className="historyHint">{historyCloud ? "Дані з Supabase. Історія оновлюється під час пошуку, ручної перевірки та автоматичної щоденної перевірки." : "Підключи Supabase, щоб SmartBuy накопичував реальну історію ціни між пошуками."}</p>

          <div className="aiBox detailAiBox"><b><Sparkles size={14}/> Smart-висновок</b><p>{selected.aiSummary}</p></div>
          <div className="drawerMarketJump"><b>Перевірити на інших майданчиках</b><div>{marketJumpLinks(selected.title).map(link => <a key={link.name} href={link.url} target="_blank" rel="noreferrer">{link.kind === "private" ? <UserRound size={13}/> : <Globe2 size={13}/>} {link.name}<ExternalLink size={12}/></a>)}</div></div>

          <h3>Ключове</h3>
          <div className="highlights">{selected.highlights.map(x => <span key={x}><Check size={13}/>{x}</span>)}</div>

          {selectedOfferDecision?.recommended && <section className={`offerDecisionCard ${selectedOfferDecision.recommended.level}`}>
            <div className="offerDecisionHead">
              <div><Sparkles size={18}/><span><small>Seller Decision Engine</small><h3>Якого продавця SmartBuy ставить першим</h3></span></div>
              <strong>{selectedOfferDecision.recommended.score}<small>/100</small></strong>
            </div>
            <p>{selectedOfferDecision.summary}</p>
            <div className="offerDecisionGrid">
              <div><span>Рекомендована пропозиція</span><b>{selectedOfferDecision.recommended.offer.marketplace}</b><small>{selectedOfferDecision.recommended.offer.sellerName || selectedOfferDecision.recommended.offer.store}</small></div>
              <div><span>{selectedOfferDecision.recommended.finalCostUsed ? "Кінцева ціна" : "Ціна товару"}</span><b>{money.format(selectedOfferDecision.recommended.effectivePrice)}</b><small>{selectedOfferDecision.recommended.finalCostUsed ? "враховано доставку / комісії з твого розрахунку" : "до додаткових витрат"}</small></div>
              <div><span>Довіра / збіг</span><b>{selectedOfferDecision.recommended.trustScore}/100 · {selectedOfferDecision.recommended.matchScore}/100</b><small>умови покупки {selectedOfferDecision.recommended.termsScore}/100</small></div>
              <div><span>Decision Score</span><b>{selectedOfferDecision.recommended.label}</b><small>{selectedOfferDecision.usesFinalCostRanking ? `кінцева ціна врахована для ${selectedOfferDecision.finalCostCoverage} продавців` : "рейтинг за доступними даними"}</small></div>
            </div>
            {(selectedOfferDecision.recommended.reasons.length > 0 || selectedOfferDecision.recommended.warnings.length > 0) && <div className="offerDecisionSignals">
              <div>{selectedOfferDecision.recommended.reasons.map(reason => <span className="good" key={reason}><Check size={11}/>{reason}</span>)}</div>
              <div>{selectedOfferDecision.recommended.warnings.map(warningItem => <span className="warn" key={warningItem}><Info size={11}/>{warningItem}</span>)}</div>
            </div>}
            <div className="offerDecisionAlternatives">
              {selectedOfferDecision.cheapest && <div><span>Найнижча ціна</span><b>{selectedOfferDecision.cheapest.offer.marketplace}</b><small>{money.format(selectedOfferDecision.cheapest.offer.price)} · Decision {selectedOfferDecision.cheapest.score}/100</small></div>}
              {selectedOfferDecision.safest && <div><span>Найсильніші сигнали довіри</span><b>{selectedOfferDecision.safest.offer.marketplace}</b><small>довіра {selectedOfferDecision.safest.trustScore}/100 · {money.format(selectedOfferDecision.safest.offer.price)}</small></div>}
            </div>
            <small className="offerDecisionDisclaimer">SmartBuy не вважає найдешевшу ціну автоматично найкращою. Рейтинг поєднує ціну, точність моделі, доступні сигнали продавця, гарантію, доставку й збережені кінцеві витрати. Перед оплатою перевір дані на сторінці продавця.</small>
          </section>}

          <section className="offerExplorer" id="seller-list">
            <div className="offerExplorerTitle"><div><h3>Усі продавці</h3><p>{selectedOffers.length} із {selected.offers.length} пропозицій</p></div><span>{selectedMetrics?.best?.marketplace ? `мінімум: ${selectedMetrics.best.marketplace}` : "SmartBuy"}</span></div>
            <div className="offerExplorerControls">
              <div className="offerFilterTabs">
                {([['all','Усі'],['new','Нові'],['used','Б/в'],['store','Магазини'],['private','Від людей']] as [OfferViewFilter,string][]).map(([id,label]) => <button key={id} className={offerViewFilter === id ? "active" : ""} onClick={() => setOfferViewFilter(id)}>{label}</button>)}
              </div>
              <select value={offerSort} onChange={e => setOfferSort(e.target.value as OfferSort)} aria-label="Сортування пропозицій"><option value="recommended">Рекомендовані SmartBuy</option><option value="value">За Smart Value</option><option value="price">Від дешевих</option><option value="trust">За довірою</option><option value="total">За кінцевою ціною</option><option value="confidence">За точністю збігу</option></select>
            </div>
            <div className="detailOfferList">
              {selectedOffers.length === 0 ? <div className="offerExplorerEmpty">У цьому фільтрі поки немає автоматично підтверджених пропозицій.</div> : selectedOffers.map((o, i) => {
                const bestPrice = selectedMetrics?.best?.price;
                const isBest = !o.priceAnomaly && bestPrice === o.price;
                const median = selectedMetrics?.median || null;
                const valueScore = offerValueScore(o, median);
                const riskFlags = offerRiskFlags(o, median);
                const medianPosition = priceVsMedian(o.price, median);
                const decision = selectedOfferDecision?.ranked.find(item => item.offer === o);
                const fairPosition = selectedFairPrice ? positionAgainstFairPrice(o.price, selectedFairPrice, Boolean(o.priceAnomaly)) : null;
                const isBestValue = selectedOfferDecision?.recommended?.offer === o;
                return <div className={`detailOffer detailOfferV11 ${o.sellerType} ${o.priceAnomaly ? "priceAnomaly" : ""} ${isBestValue ? "decisionWinner" : ""}`} key={`${o.store}-${o.externalId || i}`}>
                  <div className="offerRankBox">#{i + 1}</div>
                  <div className="detailOfferInfo">
                    <div className="detailOfferHead"><b>{o.marketplace}</b>{isBestValue && <span className="bestValueBadge"><Sparkles size={10}/> Рекомендовано</span>}{isBest && <span className="bestDealBadge">Найнижча ціна</span>}<span className={`conditionTag ${o.condition}`}>{conditionLabel(o.condition)}</span></div>
                    <small>{o.sellerType === "private" ? "Приватний продавець" : o.sellerName || o.store}</small>
                    <div className="offerMetaRow">{o.city && <span><MapPin size={11}/> {o.city}</span>}{o.delivery && <span>{o.delivery}</span>}{o.availability && <span>{o.availability}</span>}{o.warranty && <span>{o.warranty}</span>}{o.sellerRating && <span>продавець {o.sellerRating}/5{o.sellerReviewCount ? ` · ${o.sellerReviewCount} відг.` : ""}</span>}{o.returnPolicy && <span>повернення: {o.returnPolicy}</span>}{o.originalPrice && o.originalCurrency && <span>{o.originalPrice} {o.originalCurrency} → {money.format(o.price)}</span>}</div>
                    {selected && costProfiles[costProfileKey(selected.id, costOfferId(selected.id, o))] && <div className="offerFinalCost"><span>Кінцева ціна</span><b>{money.format(totalCost(costProfiles[costProfileKey(selected.id, costOfferId(selected.id, o))]))}</b></div>}
                    <div className="offerTrustRow">{decision && <span className={`decisionPill ${decision.level}`}>Decision {decision.score}/100</span>}{fairPosition && fairPosition.level !== "unknown" && <span className={`fairPricePill ${fairPosition.level}`}>{fairPosition.label}</span>}<span className={`valuePill ${valueScore >= 80 ? "good" : valueScore < 68 ? "warn" : ""}`}>Smart Value {valueScore}/100 · {valueScoreLabel(valueScore)}</span>{medianPosition ? <span className={`medianPosition ${medianPosition.tone}`}>{medianPosition.label}</span> : null}{o.matchConfidence ? <span className="matchPill">збіг {o.matchConfidence}%</span> : null}{o.verifiedSeller ? <span className="verifiedPill"><ShieldCheck size={11}/> перевірений</span> : null}{o.priceAnomaly ? <span className="anomalyPill">цінова аномалія</span> : null}<span className={`sellerTrustPill ${sellerTrustProfile(o, median).level}`}>довіра {sellerTrustProfile(o, median).score}/100</span><span className={`sellerRiskPill ${sellerRiskScore(o, median).level}`}>{sellerRiskScore(o, median).label} · {sellerRiskScore(o, median).score}/100</span>{riskFlags.slice(0,2).map(flag => <span className="riskPill" key={flag}>{flag}</span>)}</div>
                  </div>
                  <div className="detailOfferBuy"><strong>{money.format(o.price)}</strong>{o.url && <a href={o.url} target="_blank" rel="noreferrer">До продавця <ExternalLink size={13}/></a>}</div>
                </div>;
              })}
            </div>
          </section>
        </aside>
      </div>}


      <footer><div className="brand"><div className="logo">S</div><span>SmartBuy AI</span></div><p>v5.0.2 · Partial Results · Fast Search · International Live · Web Push · Seller Signals · Variant Guard · Production Hardening. · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></footer>
    </main>
  );
}
