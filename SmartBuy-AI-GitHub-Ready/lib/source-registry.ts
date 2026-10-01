import type { SourceLink, SourceCapabilities } from "./types";
import { sourceCapabilityScore, sourceConnectorProfile } from "./source-capabilities";

type SourceDef = Omit<SourceLink, "url"> & { buildUrl: (query: string) => string };

const enc = (q: string) => encodeURIComponent(q.trim());
const slug = (q: string) => q.trim().toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, "-").replace(/^-|-$/g, "");

// live  = джерело, яке вже показувало стабільні результати у Vercel.
// probe = SmartBuy пробує прочитати його автоматично, але завжди залишає пряме посилання,
//         бо сайт може змінити HTML або заблокувати серверний запит.
// direct = тільки прямий пошук, без обіцянки автоматичного збору.
const ukrainianSources: SourceDef[] = [
  { id: "olx", name: "OLX", kind: "private", label: "Оголошення людей", access: "probe", buildUrl: q => `https://www.olx.ua/uk/list/q-${slug(q)}/` },
  { id: "rozetka", name: "Rozetka", kind: "store", label: "Магазин / маркетплейс", access: "probe", buildUrl: q => `https://rozetka.com.ua/ua/search/?text=${enc(q)}` },
  { id: "prom", name: "Prom.ua", kind: "store", label: "Маркетплейс", access: "live", buildUrl: q => `https://prom.ua/ua/search?search_term=${enc(q)}` },
  { id: "bigl", name: "Bigl.ua", kind: "store", label: "Маркетплейс", access: "live", buildUrl: q => `https://bigl.ua/ua/search?search_term=${enc(q)}` },
  { id: "moyo", name: "MOYO", kind: "store", label: "Магазин", access: "live", buildUrl: q => `https://www.moyo.ua/ua/search/new/?q=${enc(q)}` },
  { id: "hotline", name: "Hotline", kind: "aggregator", label: "Порівняння цін", access: "probe", buildUrl: q => `https://hotline.ua/ua/sr/?q=${enc(q)}` },
  { id: "ekatalog", name: "E-Katalog", kind: "aggregator", label: "Порівняння цін", access: "probe", buildUrl: q => `https://ek.ua/ua/ek-list.php?search_=${enc(q)}` },
  { id: "comfy", name: "COMFY", kind: "store", label: "Магазин", access: "probe", buildUrl: q => `https://comfy.ua/ua/search/?q=${enc(q)}` },
  { id: "foxtrot", name: "Foxtrot", kind: "store", label: "Магазин", access: "probe", buildUrl: q => `https://www.foxtrot.com.ua/uk/search?query=${enc(q)}` },
  { id: "allo", name: "ALLO", kind: "store", label: "Магазин / маркетплейс", access: "probe", buildUrl: q => `https://allo.ua/ua/catalogsearch/result/?q=${enc(q)}` },
  { id: "epicentr", name: "Епіцентр", kind: "store", label: "Магазин / маркетплейс", access: "probe", buildUrl: q => `https://epicentrk.ua/ua/search/?q=${enc(q)}` },
  { id: "ktc", name: "KTC", kind: "store", label: "Магазин техніки", access: "probe", buildUrl: q => `https://ktc.ua/search/?q=${enc(q)}` },
  { id: "citrus", name: "Цитрус", kind: "store", label: "Магазин техніки", access: "probe", buildUrl: q => `https://www.ctrs.com.ua/search/?q=${enc(q)}` },
  { id: "stylus", name: "STYLUS", kind: "store", label: "Магазин техніки", access: "probe", buildUrl: q => `https://stylus.ua/uk/search?q=${enc(q)}` },
  { id: "mta", name: "MTA", kind: "store", label: "Магазин техніки", access: "probe", buildUrl: q => `https://mta.ua/search?search=${enc(q)}` },
  { id: "telemart", name: "TELEMART", kind: "store", label: "Магазин", access: "probe", buildUrl: q => `https://telemart.ua/ua/search/?search=${enc(q)}` },
  { id: "brain", name: "BRAIN", kind: "store", label: "Магазин", access: "probe", buildUrl: q => `https://brain.com.ua/ukr/search/?Search=${enc(q)}` },
  { id: "shafa", name: "Shafa", kind: "private", label: "Приватні продавці", access: "probe", buildUrl: q => `https://shafa.ua/uk/search?search_text=${enc(q)}` },
];

const internationalSources: SourceDef[] = [
  { id: "aliexpress", name: "AliExpress", kind: "international", label: "Закордон", access: "direct", buildUrl: q => `https://www.aliexpress.com/wholesale?SearchText=${enc(q)}` },
  { id: "temu", name: "Temu", kind: "international", label: "Закордон", access: "direct", buildUrl: q => `https://www.temu.com/search_result.html?search_key=${enc(q)}` },
  { id: "amazon", name: "Amazon", kind: "international", label: "Закордон", access: "direct", buildUrl: q => `https://www.amazon.com/s?k=${enc(q)}` },
];


const sourceHosts: Record<string, string[]> = {
  olx: ["olx.ua"], rozetka: ["rozetka.com.ua"], prom: ["prom.ua"], bigl: ["bigl.ua"], moyo: ["moyo.ua"],
  hotline: ["hotline.ua"], ekatalog: ["ek.ua", "e-katalog.ua"], comfy: ["comfy.ua"], foxtrot: ["foxtrot.com.ua"],
  allo: ["allo.ua"], epicentr: ["epicentrk.ua"], ktc: ["ktc.ua"], citrus: ["ctrs.com.ua", "citrus.ua"],
  stylus: ["stylus.ua"], mta: ["mta.ua"], telemart: ["telemart.ua"], brain: ["brain.com.ua"], shafa: ["shafa.ua"],
  aliexpress: ["aliexpress.com"], temu: ["temu.com"], amazon: ["amazon.com", "amazon.de", "amazon.co.uk", "amazon.pl", "amazon.it", "amazon.fr", "amazon.es"],
};

export type IdentifiedSource = {
  id: string;
  name: string;
  kind: SourceLink["kind"];
  access: SourceLink["access"];
  region: "ukraine" | "international";
};

export function identifySourceUrl(rawUrl: string): IdentifiedSource | null {
  let host = "";
  try { host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
  const all: { source: SourceDef; region: "ukraine" | "international" }[] = [
    ...ukrainianSources.map(source => ({ source, region: "ukraine" as const })),
    ...internationalSources.map(source => ({ source, region: "international" as const })),
  ];
  for (const { source, region } of all) {
    const hosts = sourceHosts[source.id] || [];
    if (hosts.some(pattern => host === pattern || host.endsWith(`.${pattern}`))) {
      return { id: source.id, name: source.name, kind: source.kind, access: source.access, region };
    }
  }
  return null;
}

export function getSourceLinks(query: string, scope: "ukraine" | "international" | "all" = "ukraine"): SourceLink[] {
  if (!query.trim()) return [];
  const decorate = (items: SourceDef[], region: "ukraine" | "international") =>
    items.map(({ buildUrl, ...source }) => {
      const connector = sourceConnectorProfile(source.id, source.access, source.kind);
      return {
        ...source,
        region,
        url: buildUrl(query),
        connectorAdapter: connector.adapter,
        capabilities: connector.capabilities,
        capabilityScore: sourceCapabilityScore(connector.capabilities),
        connectorNotes: connector.notes,
      };
    });
  if (scope === "international") return decorate(internationalSources, "international");
  if (scope === "all") return [...decorate(ukrainianSources, "ukraine"), ...decorate(internationalSources, "international")];
  return decorate(ukrainianSources, "ukraine");
}

export const sourceCounts = {
  ukraine: ukrainianSources.length,
  stable: ukrainianSources.filter(s => s.access === "live").length,
  probe: ukrainianSources.filter(s => s.access === "probe").length,
  automatic: ukrainianSources.filter(s => s.access === "live" || s.access === "probe").length,
  direct: ukrainianSources.filter(s => s.access === "direct").length,
  private: ukrainianSources.filter(s => s.kind === "private").length,
  stores: ukrainianSources.filter(s => s.kind === "store" || s.kind === "aggregator").length,
  international: internationalSources.length,
};

export const liveSourceIds = new Set(ukrainianSources.filter(s => s.access === "live").map(s => s.id));
export const probeSourceIds = new Set(ukrainianSources.filter(s => s.access === "probe").map(s => s.id));
export const automaticSourceIds = new Set(ukrainianSources.filter(s => s.access === "live" || s.access === "probe").map(s => s.id));


export type SourceCapabilityRow = {
  id: string;
  name: string;
  kind: SourceLink["kind"];
  access: SourceLink["access"];
  region: "ukraine" | "international";
  adapter: NonNullable<SourceLink["connectorAdapter"]>;
  score: number;
  capabilities: SourceCapabilities;
};

export function getSourceCapabilityMatrix(): SourceCapabilityRow[] {
  const decorate = (items: SourceDef[], region: "ukraine" | "international") => items.map(source => {
    const connector = sourceConnectorProfile(source.id, source.access, source.kind);
    return {
      id: source.id, name: source.name, kind: source.kind, access: source.access, region,
      adapter: connector.adapter, score: sourceCapabilityScore(connector.capabilities), capabilities: connector.capabilities,
    };
  });
  return [...decorate(ukrainianSources, "ukraine"), ...decorate(internationalSources, "international")];
}

export function sourceCapabilitySummary() {
  const rows = getSourceCapabilityMatrix();
  const levels = { full: 0, partial: 0, manual: 0, none: 0 };
  for (const row of rows) for (const level of Object.values(row.capabilities)) levels[level] += 1;
  const averageScore = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;
  return { sources: rows.length, averageScore, levels };
}
