export type SearchMode = "live" | "hybrid" | "market-preview" | "demo";
export type SellerType = "store" | "private" | "international";
export type ListingCondition = "new" | "used" | "refurbished";
export type MarketFilter = "all" | "new" | "used" | "stores" | "private" | "international";
export type SourceSearchState = "ok" | "empty" | "blocked" | "timeout" | "error" | "not-run";
export type SourceAccess = "live" | "probe" | "direct" | "planned";
export type MarketRegion = "ukraine" | "international";
export type SourceCapabilityLevel = "full" | "partial" | "manual" | "none";
export type SourceCapabilityKey =
  | "automaticSearch"
  | "directSearch"
  | "privateListings"
  | "productSpecs"
  | "ratings"
  | "reviewSignals"
  | "deliveryInfo"
  | "warrantyInfo"
  | "sellerSignals"
  | "internationalCost"
  | "assistedImport";
export type SourceCapabilities = Record<SourceCapabilityKey, SourceCapabilityLevel>;

export type Offer = {
  id?: string;
  title?: string;
  store: string;
  marketplace: string;
  sellerName?: string;
  sellerType: SellerType;
  condition: ListingCondition;
  price: number;
  currency?: string;
  delivery: string;
  warranty: string;
  trusted: boolean;
  verifiedSeller?: boolean;
  city?: string;
  postedAt?: string;
  negotiable?: boolean;
  url?: string;
  imageUrl?: string;
  externalId?: string;
  source?: string;
  matchConfidence?: number;
  matchConflicts?: string[];
  priceAnomaly?: boolean;
  productRating?: number;
  productReviewCount?: number;
  reviewSnippets?: string[];
  // v5.0 seller + fulfillment signals. Values are only populated when the source exposes them.
  sellerRating?: number;
  sellerReviewCount?: number;
  sellerSince?: string;
  sellerAgeDays?: number;
  returnPolicy?: string;
  availability?: string;
  shippingCost?: number;
  originalPrice?: number;
  originalCurrency?: string;
  sku?: string;
  color?: string;
  regionVersion?: string;
};

export type PricePoint = { date: string; price: number; sourceCount?: number; offerCount?: number };
export type ProductSpec = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  sourceCount: number;
};



export type ReviewTheme = {
  id: string;
  label: string;
  mentions: number;
  sourceCount: number;
};

export type ReviewIntelligence = {
  rating?: number;
  reviewCount: number;
  sourceCount: number;
  snippetCount: number;
  confidence: number;
  label: string;
  summary: string;
  positives: ReviewTheme[];
  concerns: ReviewTheme[];
  caveats: string[];
};

export type SmartSearchMeta = {
  enabled: true;
  originalQuery: string;
  derivedQuery: string;
  category?: string;
  budget?: number;
  priorities: string[];
  priorityIds?: string[];
  condition?: "all" | "new" | "used";
  marketScope?: "all" | "ukraine" | "private" | "international";
  confidence: number;
  explanation: string;
};

export type ProductTracking = {
  lastCheckedAt: string;
  status: "ok" | "not_found" | "error";
  message?: string;
  previousBestPrice?: number;
  lastSeenPrice?: number;
  sourceNames?: string[];
  offerCount?: number;
  matchConfidence?: number;
  matchedTitle?: string;
  lastSuccessfulAt?: string;
  lastSuccessfulPrice?: number;
  consecutiveMisses?: number;
};

export type ProductGroupingMeta = {
  identityKey?: string;
  canonicalLabel: string;
  confidence: number;
  mergeSignals: string[];
  uniqueTitleCount: number;
};

export type SearchQualityMeta = {
  originalQuery: string;
  normalizedQuery: string;
  queryChanged: boolean;
  rawOfferCount: number;
  uniqueOfferCount: number;
  duplicateOffersRemoved: number;
  productGroupCount: number;
  highConfidenceGroupCount: number;
  ambiguousGroupCount: number;
  identityCoverage: number;
  averageGroupingConfidence: number;
  queryVariants?: string[];
  queryExpansionSources?: number;
  queryExpansionHits?: number;
  maxQueryVariantsTried?: number;
};

export type Product = {
  id: string;
  title: string;
  category: string;
  subtitle: string;
  rating: number;
  reviewCount: number;
  image: string;
  imageUrl?: string;
  bestPrice: number;
  oldPrice?: number;
  score: number;
  highlights: string[];
  caution?: string;
  aiSummary: string;
  offers: Offer[];
  source?: string;
  productUrl?: string;
  priceHistory?: PricePoint[];
  tracking?: ProductTracking;
  fitScore?: number;
  fitReasons?: string[];
  fitWarnings?: string[];
  specs?: ProductSpec[];
  specCoverage?: number;
  reviewInsights?: ReviewIntelligence;
  grouping?: ProductGroupingMeta;
};

export type SourceLink = {
  id: string;
  name: string;
  kind: SellerType | "aggregator";
  url: string;
  label: string;
  access: SourceAccess;
  region?: MarketRegion;
  connectorAdapter?: "html" | "jsonld" | "hybrid" | "direct";
  capabilityScore?: number;
  capabilities?: SourceCapabilities;
  connectorNotes?: string[];
};

export type SourceSearchStatus = {
  id: string;
  name: string;
  state: SourceSearchState;
  offerCount: number;
  durationMs: number;
  message?: string;
  tier?: "stable" | "probe";
  cached?: boolean;
  attempts?: number;
  routerScore?: number;
  routerHealth?: "strong" | "normal" | "weak" | "unknown";
  routerPhase?: "primary" | "expanded" | "cooldown" | "not-selected";
  cooldownUntil?: string;
  queryUsed?: string;
  queryVariantsTried?: number;
  queryExpanded?: boolean;
};

export type MarketCoverage = {
  totalOffers: number;
  storeOffers: number;
  privateOffers: number;
  newOffers: number;
  usedOffers: number;
  sourceCount: number;
};


export type DiscoveryHit = {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  sourceId: string;
  sourceName: string;
  region: MarketRegion;
  matchConfidence?: number;
  provider?: string;
  queryUsed?: string;
};

export type SearchApiResponse = {
  query: string;
  count: number;
  results: Product[];
  mode: SearchMode;
  provider: string;
  warning?: string;
  coverage: MarketCoverage;
  sourceLinks: SourceLink[];
  sourceStatuses?: SourceSearchStatus[];
  discoveryHits?: DiscoveryHit[];
  smart?: SmartSearchMeta;
  quality?: SearchQualityMeta;
  // True when SmartBuy intentionally returned the offers already found instead of
  // waiting for every slow/blocked connector. Partial results are still real results.
  partial?: boolean;
  durationMs?: number;
};


export type ProductImportResponse = {
  ok: boolean;
  sourceId?: string;
  sourceName?: string;
  sourceKind?: SellerType | "aggregator";
  url?: string;
  finalUrl?: string;
  extraction: "automatic" | "partial" | "manual";
  blocked?: boolean;
  message: string;
  fields?: {
    title?: string;
    price?: number;
    currency?: string;
    priceUah?: number;
    imageUrl?: string;
    sellerName?: string;
    condition?: ListingCondition;
    rating?: number;
    reviewCount?: number;
    delivery?: string;
    availability?: string;
    shippingCost?: number;
    sellerRating?: number;
    sellerReviewCount?: number;
    sellerSince?: string;
    returnPolicy?: string;
    sku?: string;
    color?: string;
    regionVersion?: string;
  };
  product?: Product;
};

export type ProductBatchImportResponse = {
  ok: boolean;
  requestedCount: number;
  successCount: number;
  manualCount: number;
  message: string;
  results: ProductImportResponse[];
};

export type SavedSearch = {
  id: string;
  query: string;
  category: string;
  marketScope: "all" | "ukraine" | "private" | "international";
  conditionFilter: "all" | "new" | "used";
  maxPrice: string;
  createdAt: string;
  updatedAt?: string;
  lastCheckedAt?: string;
  lastBestPrice?: number;
  previousBestPrice?: number;
  resultCount?: number;
  offerCount?: number;
  dealDrop?: number;
  enabled: boolean;
  lastCheckStatus?: "never" | "ok" | "no_live_data" | "error";
  lastError?: string;
};


export type SmartNotificationKind = "price_drop" | "target_hit" | "deal_alert" | "info";

export type SmartNotification = {
  id: string;
  kind: SmartNotificationKind;
  title: string;
  body: string;
  entityType?: "product" | "saved_search";
  entityId?: string;
  price?: number;
  previousPrice?: number;
  url?: string;
  readAt?: string;
  createdAt: string;
};

export type DiagnosticLevel = "ok" | "warn" | "error" | "info";

export type DiagnosticCheck = {
  id: string;
  label: string;
  status: DiagnosticLevel;
  summary: string;
  detail?: string;
  durationMs?: number;
};

export type DiagnosticsResponse = {
  ok: boolean;
  deep: boolean;
  version: string;
  checkedAt: string;
  environment: string;
  cloudConfigured: boolean;
  checks: DiagnosticCheck[];
  sourceStatuses: SourceSearchStatus[];
  summary: { ok: number; warn: number; error: number; info: number };
  secretsExposed: false;
};
