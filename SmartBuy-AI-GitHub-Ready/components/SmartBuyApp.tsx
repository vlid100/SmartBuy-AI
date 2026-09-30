"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Bell, Check, ChevronDown, Clock3, Cloud, CloudOff, Copy, ExternalLink, GitCompareArrows,
  Globe2, Heart, Info, MapPin, RefreshCw, Search, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Star, Store, Target, TrendingDown, UserRound, X
} from "lucide-react";
import type { MarketFilter, Offer, PricePoint, Product, SearchApiResponse, SourceLink, SourceSearchStatus } from "@/lib/types";

const categories = ["Усі", "Смартфони", "Ноутбуки", "Телевізори", "Для дому", "Інструменти"];
const marketFilters: { id: MarketFilter; label: string; icon: "all" | "new" | "used" | "store" | "private" | "world" }[] = [
  { id: "all", label: "Усі", icon: "all" },
  { id: "new", label: "Нові", icon: "new" },
  { id: "used", label: "Б/в", icon: "used" },
  { id: "stores", label: "Магазини", icon: "store" },
  { id: "private", label: "Приватні", icon: "private" },
  { id: "international", label: "Закордон", icon: "world" },
];
const quickSearches = ["iPhone 15 Pro 256", "Lenovo LOQ 15", "Makita DHP486", "Roborock Q8 Max+"];
const money = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 });

type Tab = "search" | "compare" | "watch";

function bestByCondition(offers: Offer[], condition: "new" | "used") {
  const matches = offers.filter(o => condition === "new" ? o.condition === "new" : o.condition !== "new");
  return matches.length ? Math.min(...matches.map(o => o.price)) : null;
}

function conditionLabel(condition: Offer["condition"]) {
  if (condition === "new") return "Нове";
  if (condition === "refurbished") return "Відновлене";
  return "Б/в";
}

function filterIcon(id: MarketFilter) {
  if (id === "stores") return <Store size={15}/>;
  if (id === "private") return <UserRound size={15}/>;
  if (id === "international") return <Globe2 size={15}/>;
  return null;
}

function makeSyncKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

function PriceHistoryChart({ points, currentPrice }: { points: PricePoint[]; currentPrice: number }) {
  const safe = points.length ? points : [{ date: new Date().toISOString(), price: currentPrice }];
  const prices = safe.map(p => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const signal = safe.length < 2 ? "Потрібно більше даних" : currentPrice <= min * 1.03 ? "Близько до мінімуму" : currentPrice <= average ? "Ціна виглядає нормально" : "Вище середньої історичної";
  const span = Math.max(1, max - min);
  const coords = safe.map((p, i) => {
    const x = safe.length === 1 ? 50 : 4 + (i / (safe.length - 1)) * 92;
    const y = 88 - ((p.price - min) / span) * 72;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="priceHistoryCard">
      <div className="historySignal"><TrendingDown size={14}/><b>{signal}</b></div>
      <div className="historyStats"><div><span>Зараз</span><b>{money.format(currentPrice)}</b></div><div><span>Мінімум</span><b>{money.format(min)}</b></div><div><span>Середня</span><b>{money.format(average)}</b></div></div>
      <svg className="priceChart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Графік історії ціни">
        <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
      </svg>
      <div className="historyAxis"><span>{safe.length > 1 ? new Date(safe[0].date).toLocaleDateString("uk-UA") : "перший запис"}</span><span>сьогодні</span></div>
    </div>
  );
}

export default function SmartBuyApp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Усі");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [compare, setCompare] = useState<Product[]>([]);
  const [watching, setWatching] = useState<Record<string, Product>>({});
  const [maxPrice, setMaxPrice] = useState("");
  const [tab, setTab] = useState<Tab>("search");
  const [provider, setProvider] = useState("Україна: магазини + приватні оголошення");
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
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyCloud, setHistoryCloud] = useState(false);
  const [trackingRefresh, setTrackingRefresh] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState("");

  useEffect(() => {
    let key = "";
    try {
      const saved = localStorage.getItem("smartbuy-watchlist-v3");
      if (saved) setWatching(JSON.parse(saved));
      const savedTargets = localStorage.getItem("smartbuy-targets-v1");
      if (savedTargets) setTargetPrices(JSON.parse(savedTargets));
      key = localStorage.getItem("smartbuy-sync-key-v1") || makeSyncKey();
      localStorage.setItem("smartbuy-sync-key-v1", key);
      setSyncKey(key);
    } catch {}
    if (key) void loadCloudWatchlist(key);
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function runSearch(nextQuery = query, nextCategory = category, nextMarket = marketFilter) {
    setLoading(true);
    setTab("search");
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (nextCategory !== "Усі") params.set("category", nextCategory);
      if (maxPrice) params.set("maxPrice", maxPrice);
      params.set("market", nextMarket);
      const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store" });
      const data: SearchApiResponse = await response.json();
      setProducts(data.results || []);
      setProvider(data.provider || "Україна");
      setWarning(data.warning);
      setSourceLinks(data.sourceLinks || []);
      setSourceStatuses(data.sourceStatuses || []);
      setCoverage(data.coverage || { totalOffers: 0, storeOffers: 0, privateOffers: 0, newOffers: 0, usedOffers: 0, sourceCount: 0 });
      setSearched(Boolean(nextQuery.trim() || nextCategory !== "Усі" || maxPrice || nextMarket !== "all"));
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
    void runSearch(query, value, marketFilter);
  }

  function selectMarket(value: MarketFilter) {
    setMarketFilter(value);
    void runSearch(query, category, value);
  }

  function toggleCompare(product: Product) {
    setCompare(current => {
      const exists = current.some(x => x.id === product.id);
      if (exists) return current.filter(x => x.id !== product.id);
      if (current.length >= 3) return current;
      return [...current, product];
    });
  }

  async function loadCloudWatchlist(key = syncKey) {
    if (!key) return;
    setSyncing(true);
    try {
      const response = await fetch(`/api/watchlist?token=${encodeURIComponent(key)}`, { cache: "no-store" });
      const data = await response.json();
      setCloudEnabled(Boolean(data.cloud));
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
    } catch { setCloudEnabled(false); } finally { setSyncing(false); }
  }

  async function saveWatchToCloud(product: Product, targetPrice?: number) {
    if (!syncKey) return;
    try {
      const response = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: syncKey, product, targetPrice }) });
      const data = await response.json();
      setCloudEnabled(Boolean(data.cloud));
    } catch { setCloudEnabled(false); }
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
      const response = await fetch("/api/watchlist", {
        method: exists ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exists ? { token: syncKey, productKey: product.id } : { token: syncKey, product, targetPrice: targetPrices[product.id] }),
      });
      const data = await response.json();
      setCloudEnabled(Boolean(data.cloud));
    } catch { setCloudEnabled(false); }
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
    const tracked = Object.values(watching);
    if (!tracked.length) return;
    setTrackingRefresh(true);
    setTrackingMessage(`Перевіряю 0/${tracked.length}…`);
    try {
      let checked = 0, updated = 0, notFound = 0, errors = 0;
      const failures: string[] = [];

      // Run requests sequentially. Vercel was intermittently failing when the
      // browser launched several tracking functions at exactly the same time.
      for (let index = 0; index < tracked.length; index += 1) {
        const product = tracked[index];
        try {
          const response = await fetch("/api/tracking/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: syncKey, productKey: product.id }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            failures.push(String(data?.detail || data?.error || `HTTP ${response.status}`));
            errors += 1;
          } else {
            checked += Number(data.checked || 0);
            updated += Number(data.updated || 0);
            notFound += Number(data.notFound || 0);
            errors += Number(data.errors || 0);
            const firstResult = Array.isArray(data.results) ? data.results[0] : null;
            if (firstResult?.detail) failures.push(String(firstResult.detail));
          }
        } catch (error) {
          errors += 1;
          failures.push(error instanceof Error ? error.message : "network_error");
        }
        setTrackingMessage(`Перевіряю ${index + 1}/${tracked.length}…`);
      }
      const parts = [`перевірено ${checked}`];
      if (updated) parts.push(`оновлено ${updated}`);
      if (notFound) parts.push(`не знайдено ${notFound}`);
      if (errors) parts.push(`помилок ${errors}`);
      if (!checked && failures.length) parts.push(`причина: ${failures[0].slice(0, 80)}`);
      setTrackingMessage(parts.join(" · "));
      await loadCloudWatchlist(syncKey);
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
  }

  async function copySyncCode() {
    try { await navigator.clipboard.writeText(syncKey); } catch {}
  }

  const watchProducts = useMemo(() => Object.values(watching), [watching]);
  const visibleProducts = tab === "watch" ? watchProducts : products;

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
        </nav>
        <button className="iconButton" aria-label="Відстеження" onClick={() => setTab("watch")}>
          <Bell size={18}/>{watchProducts.length > 0 && <span className="badge">{watchProducts.length}</span>}
        </button>
      </header>

      <section className="hero" id="search">
        <div className="eyebrow"><Sparkles size={15}/> Весь ринок в одному пошуку</div>
        <h1>Знайди потрібну річ.<br/><span>І в магазині, і в людей.</span></h1>
        <p>SmartBuy має збирати нові товари з магазинів та б/в оголошення від людей окремо — щоб ти одразу бачив реальну різницю в ціні.</p>

        <form className="searchBox" onSubmit={e => { e.preventDefault(); void runSearch(); }}>
          <Search size={22}/>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Наприклад: iPhone 15 Pro 256 GB" />
          <button type="submit" disabled={loading}>{loading ? "Шукаю…" : "Знайти"}</button>
        </form>

        <div className="quickRow">
          {quickSearches.map(q => <button key={q} onClick={() => { setQuery(q); void runSearch(q, category, marketFilter); }}>{q}</button>)}
        </div>
      </section>

      <section className="content" id="results">
        {tab === "search" && (
          <>
            <div className="sourceStatus marketStatus">
              <div><BadgeCheck size={18}/><b>Ринок України v0.7.2</b><span>{provider}</span></div>
              <p><Info size={15}/> Автоматично збираємо дані лише там, де це стабільно працює. Інші майданчики відкриваємо прямим пошуком — без вигаданих цін і без обходу захисту.</p>
            </div>

            <div className="marketFilters">
              {marketFilters.map(item => (
                <button key={item.id} className={marketFilter === item.id ? "active" : ""} onClick={() => selectMarket(item.id)}>
                  {filterIcon(item.id)}{item.label}
                </button>
              ))}
            </div>

            <div className="categories">
              {categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => selectCategory(item)}>{item}</button>)}
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
                  <div><h3>Джерела цього пошуку</h3><p>Prom.ua і MOYO перевіряються автоматично. Для решти джерел кнопка відкриває той самий запит прямо на майданчику; пізніше сюди підключимо дозволені API та товарні фіди.</p></div>
                  <span>{sourceLinks.filter(s => s.access === "live").length} авто · {sourceLinks.filter(s => s.access === "direct").length} прямий</span>
                </div>
                <div className="sourceLinks">
                  {sourceLinks.map(source => {
                    const status = sourceStatuses.find(item => item.id === source.id);
                    const statusText = source.access === "direct" ? "прямий пошук" : source.access === "planned" ? "підключимо пізніше" : !status ? "автоматичне джерело" : status.state === "ok" ? `${status.offerCount} знайдено` : status.state === "blocked" ? "тимчасово недоступне" : status.state === "timeout" ? "не відповіло вчасно" : status.state === "empty" ? "відповіло · карток не знайдено" : status.state === "error" ? "тимчасова помилка" : "автоматичне джерело";
                    return (
                      <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className={`sourceChip ${source.kind} access-${source.access} ${status ? `status-${status.state}` : ""}`}>
                        <span>{source.kind === "private" ? <UserRound size={16}/> : source.kind === "international" ? <Globe2 size={16}/> : <Store size={16}/>}</span>
                        <div><b>{source.name}</b><small>{statusText}</small></div>
                        <ExternalLink size={14}/>
                      </a>
                    );
                  })}
                </div>
              </section>
            )}

            {warning && <div className="previewWarning"><Info size={17}/><p>{warning}</p></div>}
          </>
        )}

        {tab === "watch" && (
          <section className="syncPanel">
            <div className="syncPanelMain">
              <div className={`cloudBadge ${cloudEnabled ? "on" : "off"}`}>{cloudEnabled ? <Cloud size={18}/> : <CloudOff size={18}/>}<span>{cloudEnabled ? "Хмарна синхронізація активна" : "Локальне відстеження"}</span></div>
              <h2>Відстеження цін</h2>
              <p>{cloudEnabled ? "Товари, цільові ціни та історія зберігаються в Supabase. SmartBuy автоматично перевіряє відстежувані товари раз на день і дає перевірити їх вручну будь-коли." : "Сайт працює без Supabase: товари зберігаються тільки в цьому браузері. Після підключення Supabase увімкнеться історія, синхронізація та автоматична перевірка цін."}</p>
              {cloudEnabled && <div className="trackingControls"><button onClick={() => void refreshTrackedNow()} disabled={trackingRefresh || watchProducts.length === 0}><RefreshCw size={15} className={trackingRefresh ? "spin" : ""}/>{trackingRefresh ? "Перевіряю…" : "Перевірити ціни зараз"}</button><small>{trackingMessage || "Автоперевірка: щодня через Vercel Cron"}</small></div>}
            </div>
            <div className="syncCodeBox">
              <span>Код синхронізації</span>
              <div><code>{syncKey || "—"}</code><button onClick={copySyncCode} title="Копіювати"><Copy size={15}/></button><button onClick={() => void loadCloudWatchlist()} title="Оновити" disabled={syncing}><RefreshCw size={15}/></button></div>
              <div className="syncImport"><input value={syncInput} onChange={e => setSyncInput(e.target.value)} placeholder="Код з іншого пристрою"/><button onClick={() => void useSyncCode()}>Підключити</button></div>
            </div>
          </section>
        )}

        <div className="resultsHeader">
          <div>
            <h2>{tab === "watch" ? "Відстеження" : searched ? "Знайдені варіанти" : "Приклад об'єднаного ринку"}</h2>
            <p>{loading ? "Шукаю…" : tab === "watch" ? `${watchProducts.length} збережено` : `${products.length} моделей · ${coverage.totalOffers} пропозицій`}</p>
          </div>
          {tab === "search" && <div className="filter"><SlidersHorizontal size={17}/><span>До</span><input inputMode="numeric" value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/\D/g, ""))} placeholder="ціна, ₴"/><button onClick={() => void runSearch()}>OK</button></div>}
        </div>

        {loading && tab === "search" ? <div className="loadingGrid">{[1,2,3].map(x => <div className="skeleton" key={x}/>)}</div> : visibleProducts.length === 0 ? (
          <div className="empty"><ShoppingBag size={32}/><h3>{tab === "watch" ? "Тут поки порожньо" : "Нічого не знайшов"}</h3><p>{tab === "watch" ? "Натисни сердечко на товарі — він зʼявиться тут." : "Спробуй коротший запит або вибери «Усі»."}</p></div>
        ) : (
          <div className="grid">
            {visibleProducts.map((product, index) => {
              const newPrice = bestByCondition(product.offers, "new");
              const usedPrice = bestByCondition(product.offers, "used");
              const saving = newPrice && usedPrice && usedPrice < newPrice ? Math.round((1 - usedPrice / newPrice) * 100) : null;
              const previousTrackedPrice = Number(product.tracking?.previousBestPrice || 0);
              const trackedDelta = previousTrackedPrice > 0 ? product.bestPrice - previousTrackedPrice : 0;
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
                  <div className="rating"><Star size={15} fill="currentColor"/> {product.rating.toFixed(1)} <span>{product.reviewCount > 0 ? `(${product.reviewCount})` : ""}</span></div>

                  <div className="segmentPrices">
                    {newPrice !== null && <div><span><Store size={14}/> Нове від</span><b>{money.format(newPrice)}</b></div>}
                    {usedPrice !== null && <div><span><UserRound size={14}/> Б/в від</span><b>{money.format(usedPrice)}</b></div>}
                  </div>
                  {saving !== null && <div className="savingNote">Б/в дешевше нового приблизно на <b>{saving}%</b></div>}

                  <div className="priceRow"><strong>від {money.format(product.bestPrice)}</strong></div>
                  <p className="stores">{product.offers.length} пропозицій · {product.source || "SmartBuy"}</p>
                  <div className="highlights">{product.highlights.slice(0,3).map(x => <span key={x}><Check size={13}/>{x}</span>)}</div>
                  {product.caution && <div className="caution">⚠ {product.caution}</div>}
                  <div className="aiBox"><b><Sparkles size={14}/> Smart-висновок</b><p>{product.aiSummary}</p></div>

                  <details className="offers">
                    <summary>Усі пропозиції <ChevronDown size={16}/></summary>
                    {product.offers.map((o, offerIndex) => (
                      <div className={`offer marketOffer ${o.sellerType}`} key={`${o.store}-${offerIndex}`}>
                        <div className="offerMain">
                          <div className="offerTitle"><b>{o.marketplace}</b><span className={`conditionTag ${o.condition}`}>{conditionLabel(o.condition)}</span></div>
                          <small>{o.sellerType === "private" ? "Приватний продавець" : o.sellerName || o.store}{o.city ? ` · ${o.city}` : ""}</small>
                          <small>{o.delivery} · {o.warranty}</small>
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
      </section>

      {compare.length > 0 && <div className="compareBar"><div><b>Порівняння</b><span>{compare.length}/3 товари</span></div><div className="compareNames">{compare.map(p => <span key={p.id}>{p.title}<button onClick={() => toggleCompare(p)}><X size={13}/></button></span>)}</div><button className="primary" onClick={() => setCompareOpen(true)}>Порівняти</button></div>}

      {compareOpen && <div className="modalBackdrop" onMouseDown={() => setCompareOpen(false)}><div className="compareModal" onMouseDown={e => e.stopPropagation()}><div className="modalHeader"><div><h2>Порівняння</h2><p>До 3 моделей поруч.</p></div><button className="closeButton" onClick={() => setCompareOpen(false)}><X/></button></div>{compare.length === 0 ? <div className="empty"><p>Додай товари кнопкою «Порівняти».</p></div> : <div className="compareTableWrap"><table className="compareTable"><thead><tr><th></th>{compare.map(p => <th key={p.id}>{p.title}</th>)}</tr></thead><tbody><tr><td>Найнижча ціна</td>{compare.map(p => <td key={p.id}><b>{money.format(p.bestPrice)}</b></td>)}</tr><tr><td>Нове від</td>{compare.map(p => <td key={p.id}>{bestByCondition(p.offers,"new") ? money.format(bestByCondition(p.offers,"new")!) : "—"}</td>)}</tr><tr><td>Б/в від</td>{compare.map(p => <td key={p.id}>{bestByCondition(p.offers,"used") ? money.format(bestByCondition(p.offers,"used")!) : "—"}</td>)}</tr><tr><td>Smart score</td>{compare.map(p => <td key={p.id}>{p.score}/100</td>)}</tr><tr><td>Пропозицій</td>{compare.map(p => <td key={p.id}>{p.offers.length}</td>)}</tr></tbody></table></div>}</div></div>}

      {selected && <div className="modalBackdrop detailBackdrop" onMouseDown={() => setSelected(null)}><aside className="detailDrawer" onMouseDown={e => e.stopPropagation()}><button className="closeButton drawerClose" onClick={() => setSelected(null)}><X/></button><div className="detailVisual">{selected.imageUrl ? <img src={selected.imageUrl} alt={selected.title}/> : selected.image}</div><div className="score"><Sparkles size={14}/> Smart score {selected.score}/100</div><h2>{selected.title}</h2><p className="subtitle">{selected.subtitle}</p><div className="detailPrice">від {money.format(selected.bestPrice)}</div><div className="drawerTrackRow"><button className={`trackButton ${watching[selected.id] ? "saved" : ""}`} onClick={() => void toggleWatch(selected)}><Heart size={16} fill={watching[selected.id] ? "currentColor" : "none"}/>{watching[selected.id] ? "Відстежується" : "Відстежувати"}</button><div className="drawerTarget"><Target size={14}/><input inputMode="numeric" value={targetPrices[selected.id] || ""} onChange={e => updateTarget(selected, e.target.value)} placeholder="цільова ціна"/><span>₴</span><button onClick={() => void commitTarget(selected)}>OK</button></div></div><h3><TrendingDown size={16}/> Історія ціни</h3><PriceHistoryChart points={history.length ? history : (selected.priceHistory || [])} currentPrice={selected.bestPrice}/><p className="historyHint">{historyCloud ? "Дані з Supabase. Історія оновлюється під час пошуку, ручної перевірки та автоматичної щоденної перевірки." : "Підключи Supabase, щоб SmartBuy накопичував реальну історію ціни між пошуками."}</p><div className="aiBox"><b><Sparkles size={14}/> Smart-висновок</b><p>{selected.aiSummary}</p></div><h3>Ключове</h3><div className="highlights">{selected.highlights.map(x => <span key={x}><Check size={13}/>{x}</span>)}</div><h3>Пропозиції з ринку</h3>{selected.offers.map((o, i) => <div className={`detailOffer ${o.sellerType}`} key={`${o.store}-${i}`}><div><b>{o.marketplace} · {conditionLabel(o.condition)}</b><small>{o.sellerType === "private" ? "Приватний продавець" : o.sellerName || o.store}</small>{o.city && <small><MapPin size={12}/> {o.city}</small>}{o.postedAt && <small><Clock3 size={12}/> {o.postedAt}</small>}</div><strong>{money.format(o.price)}</strong>{o.url && <a href={o.url} target="_blank" rel="noreferrer">Відкрити <ExternalLink size={14}/></a>}</div>)}</aside></div>}

      <footer><div className="brand"><div className="logo">S</div><span>SmartBuy AI</span></div><p>v0.7 · автоматичне відстеження · історія цін · цільова ціна.</p></footer>
    </main>
  );
}
