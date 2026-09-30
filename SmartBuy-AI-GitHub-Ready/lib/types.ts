export type Offer = {
  store: string;
  price: number;
  delivery: string;
  warranty: string;
  trusted: boolean;
};

export type Product = {
  id: string;
  title: string;
  category: string;
  subtitle: string;
  rating: number;
  reviewCount: number;
  image: string;
  bestPrice: number;
  oldPrice?: number;
  score: number;
  highlights: string[];
  caution?: string;
  aiSummary: string;
  offers: Offer[];
};
