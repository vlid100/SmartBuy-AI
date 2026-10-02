import type { SellerType, SourceAccess, SourceCapabilityKey, SourceCapabilityLevel, SourceCapabilities } from "./types";

export type ConnectorAdapterKind = "html" | "jsonld" | "hybrid" | "direct";

export type SourceConnectorProfile = {
  adapter: ConnectorAdapterKind;
  capabilities: SourceCapabilities;
  notes: string[];
};

const full = "full" as const;
const partial = "partial" as const;
const manual = "manual" as const;
const none = "none" as const;

function baseCapabilities(access: SourceAccess, kind: SellerType | "aggregator"): SourceCapabilities {
  const automatic = access === "live" ? full : access === "probe" ? partial : none;
  const directSearch = access === "direct" || access === "live" || access === "probe" ? full : none;
  const assistedImport = access === "planned" ? none : access === "live" ? full : partial;

  if (kind === "private") {
    return {
      automaticSearch: automatic,
      directSearch,
      assistedImport,
      privateListings: full,
      productSpecs: partial,
      ratings: none,
      reviewSignals: none,
      deliveryInfo: partial,
      warrantyInfo: manual,
      sellerSignals: partial,
      internationalCost: none,
    };
  }

  if (kind === "international") {
    return {
      automaticSearch: automatic,
      directSearch,
      assistedImport,
      privateListings: none,
      productSpecs: partial,
      ratings: partial,
      reviewSignals: partial,
      deliveryInfo: partial,
      warrantyInfo: manual,
      sellerSignals: partial,
      internationalCost: full,
    };
  }

  if (kind === "aggregator") {
    return {
      automaticSearch: automatic,
      directSearch,
      assistedImport,
      privateListings: none,
      productSpecs: partial,
      ratings: none,
      reviewSignals: none,
      deliveryInfo: partial,
      warrantyInfo: partial,
      sellerSignals: partial,
      internationalCost: none,
    };
  }

  return {
    automaticSearch: automatic,
    directSearch,
    assistedImport,
    privateListings: none,
    productSpecs: partial,
    ratings: partial,
    reviewSignals: partial,
    deliveryInfo: partial,
    warrantyInfo: partial,
    sellerSignals: partial,
    internationalCost: none,
  };
}

const overrides: Record<string, Partial<SourceCapabilities>> = {
  prom: { productSpecs: full, ratings: partial, reviewSignals: partial, deliveryInfo: partial, warrantyInfo: partial, sellerSignals: partial },
  bigl: { productSpecs: full, ratings: partial, reviewSignals: partial, deliveryInfo: partial, warrantyInfo: partial, sellerSignals: partial },
  moyo: { productSpecs: full, ratings: partial, reviewSignals: partial, deliveryInfo: partial, warrantyInfo: full, sellerSignals: full },
  rozetka: { productSpecs: full, ratings: partial, reviewSignals: partial, deliveryInfo: partial, warrantyInfo: partial, sellerSignals: partial },
  hotline: { productSpecs: partial, deliveryInfo: partial, warrantyInfo: partial, sellerSignals: partial },
  ekatalog: { productSpecs: partial, deliveryInfo: partial, warrantyInfo: partial, sellerSignals: partial },
  olx: { privateListings: full, deliveryInfo: partial, sellerSignals: partial, warrantyInfo: manual },
  shafa: { privateListings: full, deliveryInfo: partial, sellerSignals: partial, warrantyInfo: manual },
  aliexpress: { automaticSearch: partial, internationalCost: full, productSpecs: partial, ratings: partial, reviewSignals: partial, deliveryInfo: partial, sellerSignals: partial },
  temu: { automaticSearch: partial, internationalCost: full, productSpecs: partial, ratings: partial, reviewSignals: partial, deliveryInfo: partial, sellerSignals: partial },
  amazon: { automaticSearch: partial, internationalCost: full, productSpecs: partial, ratings: partial, reviewSignals: partial, deliveryInfo: partial, sellerSignals: partial },
};

export function sourceConnectorProfile(id: string, access: SourceAccess, kind: SellerType | "aggregator"): SourceConnectorProfile {
  const base = baseCapabilities(access, kind);
  const capabilities = { ...base, ...(overrides[id] || {}) } as SourceCapabilities;
  const adapter: ConnectorAdapterKind = access === "direct" ? "direct" : access === "live" ? "hybrid" : "html";
  const notes: string[] = [];
  if (access === "probe") notes.push("best-effort public page parsing; may be blocked by anti-bot protection");
  if (access === "direct") notes.push("direct-search connector; SmartBuy does not claim automatic live extraction");
  if (kind === "private") notes.push("private-listing signals are treated separately from store trust");
  if (kind === "international") notes.push("best-effort live public-page parsing + assisted import; final cost can still be refined in the total-cost workflow");
  return { adapter, capabilities, notes };
}

export const capabilityLabels: Record<SourceCapabilityKey, string> = {
  automaticSearch: "Live пошук",
  directSearch: "Прямий пошук",
  assistedImport: "Імпорт URL",
  privateListings: "Оголошення",
  productSpecs: "Характеристики",
  ratings: "Рейтинг",
  reviewSignals: "Відгуки",
  deliveryInfo: "Доставка",
  warrantyInfo: "Гарантія",
  sellerSignals: "Продавець",
  internationalCost: "Кінцева ціна",
};

export const capabilityShortLabels: Record<SourceCapabilityKey, string> = {
  automaticSearch: "live",
  directSearch: "link",
  assistedImport: "import",
  privateListings: "люди",
  productSpecs: "specs",
  ratings: "rating",
  reviewSignals: "reviews",
  deliveryInfo: "delivery",
  warrantyInfo: "warranty",
  sellerSignals: "seller",
  internationalCost: "total",
};

export const capabilityLevelLabels: Record<SourceCapabilityLevel, string> = {
  full: "повністю",
  partial: "частково",
  manual: "вручну",
  none: "немає",
};

export function capabilityStrength(level: SourceCapabilityLevel | undefined) {
  if (level === "full") return 3;
  if (level === "partial") return 2;
  if (level === "manual") return 1;
  return 0;
}

export function sourceCapabilityScore(capabilities: SourceCapabilities) {
  const entries = Object.values(capabilities);
  if (!entries.length) return 0;
  const points = entries.reduce((sum, level) => sum + capabilityStrength(level), 0);
  return Math.round((points / (entries.length * 3)) * 100);
}
