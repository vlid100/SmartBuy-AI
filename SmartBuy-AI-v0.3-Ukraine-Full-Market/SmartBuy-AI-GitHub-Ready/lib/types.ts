export type SearchMode = "market-preview" | "demo";
export type SellerType = "store" | "private" | "international";
export type ListingCondition = "new" | "used" | "refurbished";
export type MarketFilter = "all" | "new" | "used" | "stores" | "private" | "international";

export type Offer = {
  id?: string;
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
  source?: string;
};

export type PricePoint = {
  date: string;
  price: number;
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
};

export type SourceLink = {
  id: string;
  name: string;
  kind: SellerType | "aggregator";
  url: string;
  label: string;
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
};
