export type SearchMode = "live" | "hybrid" | "market-preview" | "demo";
export type SellerType = "store" | "private" | "international";
export type ListingCondition = "new" | "used" | "refurbished";
export type MarketFilter = "all" | "new" | "used" | "stores" | "private" | "international";
export type SourceSearchState = "ok" | "empty" | "blocked" | "timeout" | "error" | "not-run";

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
};

export type PricePoint = { date: string; price: number };

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
};

export type SourceLink = {
  id: string;
  name: string;
  kind: SellerType | "aggregator";
  url: string;
  label: string;
};

export type SourceSearchStatus = {
  id: string;
  name: string;
  state: SourceSearchState;
  offerCount: number;
  durationMs: number;
  message?: string;
};

export type MarketCoverage = {
  totalOffers: number;
  storeOffers: number;
  privateOffers: number;
  newOffers: number;
  usedOffers: number;
  sourceCount: number;
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
};
