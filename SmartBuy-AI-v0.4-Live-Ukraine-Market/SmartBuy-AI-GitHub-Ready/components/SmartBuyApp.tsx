"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Bell, Check, ChevronDown, Clock3, ExternalLink, GitCompareArrows,
  Globe2, Heart, Info, MapPin, Search, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Star, Store, UserRound, X
} from "lucide-react";
import type { MarketFilter, Offer, Product, SearchApiResponse, SourceLink, SourceSearchStatus } from "@/lib/types";

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("smartbuy-watchlist-v3");
      if (saved) setWatching(JSON.parse(saved));
    } catch {}
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function toggleWatch(product: Product) {
    setWatching(current => {
      const next = { ...current };
      if (next[product.id]) delete next[product.id];
      else next[product.id] = product;
      localStorage.setItem("smartbuy-watchlist-v3", JSON.stringify(next));
      return next;
    });
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
              <div><BadgeCheck size={18}/><b>Ринок України v0.4 LIVE</b><span>{provider}</span></div>
              <p><Info size={15}/> Пошук автоматично перевіряє публічні сторінки джерел. Заблоковані сайти не підміняються вигаданими цінами.</p>
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
                  <div><h3>Джерела цього пошуку</h3><p>SmartBuy пробує зібрати картки автоматично. Біля кожного джерела видно результат; кнопка завжди відкриває реальний пошук на самому майданчику.</p></div>
                  <span>{sourceLinks.length} джерел</span>
                </div>
                <div className="sourceLinks">
                  {sourceLinks.map(source => {
                    const status = sourceStatuses.find(item => item.id === source.id);
                    const statusText = !status ? source.label : status.state === "ok" ? `${status.offerCount} знайдено` : status.state === "blocked" ? "серверний доступ заблоковано" : status.state === "timeout" ? "тайм-аут" : status.state === "empty" ? "відповів · без розпізнаних карток" : status.state === "error" ? "помилка відповіді" : source.label;
                    return (
                      <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className={`sourceChip ${source.kind} ${status ? `status-${status.state}` : ""}`}>
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

      {selected && <div className="modalBackdrop detailBackdrop" onMouseDown={() => setSelected(null)}><aside className="detailDrawer" onMouseDown={e => e.stopPropagation()}><button className="closeButton drawerClose" onClick={() => setSelected(null)}><X/></button><div className="detailVisual">{selected.imageUrl ? <img src={selected.imageUrl} alt={selected.title}/> : selected.image}</div><div className="score"><Sparkles size={14}/> Smart score {selected.score}/100</div><h2>{selected.title}</h2><p className="subtitle">{selected.subtitle}</p><div className="detailPrice">від {money.format(selected.bestPrice)}</div><div className="aiBox"><b><Sparkles size={14}/> Smart-висновок</b><p>{selected.aiSummary}</p></div><h3>Ключове</h3><div className="highlights">{selected.highlights.map(x => <span key={x}><Check size={13}/>{x}</span>)}</div><h3>Пропозиції з ринку</h3>{selected.offers.map((o, i) => <div className={`detailOffer ${o.sellerType}`} key={`${o.store}-${i}`}><div><b>{o.marketplace} · {conditionLabel(o.condition)}</b><small>{o.sellerType === "private" ? "Приватний продавець" : o.sellerName || o.store}</small>{o.city && <small><MapPin size={12}/> {o.city}</small>}{o.postedAt && <small><Clock3 size={12}/> {o.postedAt}</small>}</div><strong>{money.format(o.price)}</strong>{o.url && <a href={o.url} target="_blank" rel="noreferrer">Відкрити <ExternalLink size={14}/></a>}</div>)}</aside></div>}

      <footer><div className="brand"><div className="logo">S</div><span>SmartBuy AI</span></div><p>v0.4 LIVE · автоматичний best-effort пошук по ринку України.</p></footer>
    </main>
  );
}
