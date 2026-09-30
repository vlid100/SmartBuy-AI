"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, ChevronDown, Heart, Search, ShieldCheck, SlidersHorizontal, Sparkles, Star, X } from "lucide-react";
import type { Product } from "@/lib/types";

const categories = ["Усі", "Смартфони", "Ноутбуки", "Телевізори", "Для дому", "Інструменти"];
const quickSearches = [
  "Ноутбук до 45 000 грн для ігор",
  "Телевізор 55 дюймів для PS5",
  "Робот-пилосос для шерсті"
];

const money = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 });

export default function SmartBuyApp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Усі");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [watching, setWatching] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("smartbuy-watchlist");
    if (saved) setWatching(JSON.parse(saved));
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(nextQuery = query, nextCategory = category) {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextCategory !== "Усі") params.set("category", nextCategory);
    if (maxPrice) params.set("maxPrice", maxPrice);
    const response = await fetch(`/api/search?${params.toString()}`);
    const data = await response.json();
    setProducts(data.results || []);
    setLoading(false);
    setSearched(Boolean(nextQuery.trim() || nextCategory !== "Усі" || maxPrice));
  }

  function selectCategory(value: string) {
    setCategory(value);
    void runSearch(query, value);
  }

  function toggleCompare(id: string) {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  function toggleWatch(id: string) {
    setWatching((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      localStorage.setItem("smartbuy-watchlist", JSON.stringify(next));
      return next;
    });
  }

  const compared = useMemo(() => products.filter((p) => compare.includes(p.id)), [products, compare]);

  return (
    <main>
      <header className="topbar">
        <div className="brand"><div className="logo">S</div><span>SmartBuy <b>AI</b></span></div>
        <nav><a href="#search">Пошук</a><a href="#results">Порівняння</a><a href="#results">Відстеження</a></nav>
        <button className="iconButton" aria-label="Сповіщення"><Bell size={18}/>{watching.length > 0 && <span className="badge">{watching.length}</span>}</button>
      </header>

      <section className="hero" id="search">
        <div className="eyebrow"><Sparkles size={15}/> AI-помічник для покупок</div>
        <h1>Знайди потрібну річ.<br/><span>Не переплачуй.</span></h1>
        <p>Опиши, що тобі потрібно звичайними словами — SmartBuy знайде варіанти, порівняє пропозиції та пояснить різницю.</p>

        <form className="searchBox" onSubmit={(e) => { e.preventDefault(); void runSearch(); }}>
          <Search size={22}/>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Наприклад: ноутбук до 45 000 грн для ігор" />
          <button type="submit">Знайти</button>
        </form>

        <div className="quickRow">
          {quickSearches.map((q) => <button key={q} onClick={() => { setQuery(q); void runSearch(q, category); }}>{q}</button>)}
        </div>
      </section>

      <section className="content" id="results">
        <div className="categories">
          {categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => selectCategory(item)}>{item}</button>)}
        </div>

        <div className="resultsHeader">
          <div><h2>{searched ? "Знайдені варіанти" : "Популярні варіанти"}</h2><p>{loading ? "Шукаю…" : `${products.length} товарів у демо-каталозі`}</p></div>
          <div className="filter"><SlidersHorizontal size={17}/><span>До</span><input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))} placeholder="ціна, ₴"/><button onClick={() => void runSearch()}>OK</button></div>
        </div>

        {loading ? <div className="loadingGrid">{[1,2,3].map(x => <div className="skeleton" key={x}/>)}</div> : products.length === 0 ? (
          <div className="empty"><Search size={32}/><h3>Нічого не знайшов</h3><p>Спробуй коротший запит або забери обмеження по ціні.</p></div>
        ) : (
          <div className="grid">
            {products.map((product, index) => (
              <article className="card" key={product.id}>
                <div className="cardTop">
                  <span className="rank">#{index + 1}</span>
                  <button className={`heart ${watching.includes(product.id) ? "saved" : ""}`} onClick={() => toggleWatch(product.id)} aria-label="Відстежувати"><Heart size={19} fill={watching.includes(product.id) ? "currentColor" : "none"}/></button>
                </div>
                <div className="productVisual">{product.image}</div>
                <div className="score"><Sparkles size={14}/> Smart score {product.score}/100</div>
                <h3>{product.title}</h3>
                <p className="subtitle">{product.subtitle}</p>
                <div className="rating"><Star size={15} fill="currentColor"/> {product.rating} <span>({product.reviewCount})</span></div>
                <div className="priceRow"><strong>{money.format(product.bestPrice)}</strong>{product.oldPrice && <s>{money.format(product.oldPrice)}</s>}</div>
                <p className="stores">від {product.offers.length} {product.offers.length === 1 ? "магазину" : "магазинів"}</p>
                <div className="highlights">{product.highlights.slice(0,3).map(x => <span key={x}><Check size={13}/>{x}</span>)}</div>
                {product.caution && <div className="caution">⚠ {product.caution}</div>}
                <div className="aiBox"><b><Sparkles size={14}/> AI-висновок</b><p>{product.aiSummary}</p></div>
                <details className="offers"><summary>Де купити <ChevronDown size={16}/></summary>{product.offers.map(o => <div className="offer" key={o.store}><div><b>{o.store}</b><small>{o.delivery} · {o.warranty}</small></div><strong>{money.format(o.price)}</strong>{o.trusted && <ShieldCheck size={16}/>}</div>)}</details>
                <button className={`compare ${compare.includes(product.id) ? "selected" : ""}`} onClick={() => toggleCompare(product.id)}>{compare.includes(product.id) ? "Додано до порівняння" : "Порівняти"}</button>
              </article>
            ))}
          </div>
        )}
      </section>

      {compare.length > 0 && <div className="compareBar"><div><b>Порівняння</b><span>{compare.length}/3 вибрано</span></div><div className="compareNames">{compared.map(p => <span key={p.id}>{p.title}<button onClick={() => toggleCompare(p.id)}><X size={13}/></button></span>)}</div><button className="primary" onClick={() => alert("Наступний етап: окрема сторінка детального порівняння.")}>Порівняти</button></div>}

      <footer><div className="brand"><div className="logo">S</div><span>SmartBuy AI</span></div><p>Демо MVP · реальні джерела магазинів підключимо наступним етапом.</p></footer>
    </main>
  );
}
