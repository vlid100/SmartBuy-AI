import type { SourceLink } from "./types";

type SourceDef = Omit<SourceLink, "url"> & { buildUrl: (query: string) => string };

const enc = (q: string) => encodeURIComponent(q.trim());
const slug = (q: string) => q.trim().toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, "-").replace(/^-|-$/g, "");

const ukrainianSources: SourceDef[] = [
  { id: "olx", name: "OLX", kind: "private", label: "Оголошення людей", buildUrl: q => `https://www.olx.ua/uk/list/q-${slug(q)}/` },
  { id: "rozetka", name: "Rozetka", kind: "store", label: "Магазин / маркетплейс", buildUrl: q => `https://rozetka.com.ua/ua/search/?text=${enc(q)}` },
  { id: "prom", name: "Prom.ua", kind: "store", label: "Маркетплейс", buildUrl: q => `https://prom.ua/ua/search?search_term=${enc(q)}` },
  { id: "hotline", name: "Hotline", kind: "aggregator", label: "Порівняння цін", buildUrl: q => `https://hotline.ua/ua/sr/?q=${enc(q)}` },
  { id: "comfy", name: "COMFY", kind: "store", label: "Магазин", buildUrl: q => `https://comfy.ua/ua/search/?q=${enc(q)}` },
  { id: "foxtrot", name: "Foxtrot", kind: "store", label: "Магазин", buildUrl: q => `https://www.foxtrot.com.ua/uk/search?query=${enc(q)}` },
  { id: "allo", name: "ALLO", kind: "store", label: "Магазин / маркетплейс", buildUrl: q => `https://allo.ua/ua/catalogsearch/result/?q=${enc(q)}` },
  { id: "epicentr", name: "Епіцентр", kind: "store", label: "Магазин / маркетплейс", buildUrl: q => `https://epicentrk.ua/ua/search/?q=${enc(q)}` },
  { id: "moyo", name: "MOYO", kind: "store", label: "Магазин", buildUrl: q => `https://www.moyo.ua/ua/search/new/?q=${enc(q)}` },
  { id: "telemart", name: "TELEMART", kind: "store", label: "Магазин", buildUrl: q => `https://telemart.ua/ua/search/?search=${enc(q)}` },
  { id: "brain", name: "BRAIN", kind: "store", label: "Магазин", buildUrl: q => `https://brain.com.ua/ukr/search/?Search=${enc(q)}` },
  { id: "shafa", name: "Shafa", kind: "private", label: "Приватні продавці", buildUrl: q => `https://shafa.ua/uk/search?search_text=${enc(q)}` },
];

const internationalSources: SourceDef[] = [
  { id: "aliexpress", name: "AliExpress", kind: "international", label: "Закордон", buildUrl: q => `https://www.aliexpress.com/wholesale?SearchText=${enc(q)}` },
  { id: "temu", name: "Temu", kind: "international", label: "Закордон", buildUrl: q => `https://www.temu.com/search_result.html?search_key=${enc(q)}` },
  { id: "amazon", name: "Amazon", kind: "international", label: "Закордон", buildUrl: q => `https://www.amazon.com/s?k=${enc(q)}` },
];

export function getSourceLinks(query: string, scope: "ukraine" | "international" = "ukraine"): SourceLink[] {
  if (!query.trim()) return [];
  const list = scope === "international" ? internationalSources : ukrainianSources;
  return list.map(({ buildUrl, ...source }) => ({ ...source, url: buildUrl(query) }));
}

export const sourceCounts = {
  ukraine: ukrainianSources.length,
  private: ukrainianSources.filter(s => s.kind === "private").length,
  stores: ukrainianSources.filter(s => s.kind === "store" || s.kind === "aggregator").length,
  international: internationalSources.length,
};
