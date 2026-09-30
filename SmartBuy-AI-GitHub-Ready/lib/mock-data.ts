import { Product } from "./types";

export const products: Product[] = [
  {
    id: "iphone-17-256",
    title: "Apple iPhone 17 256 GB",
    category: "Смартфони",
    subtitle: "6.3\" OLED · 256 GB · 5G",
    rating: 4.8,
    reviewCount: 184,
    image: "📱",
    bestPrice: 42999,
    oldPrice: 45999,
    score: 94,
    highlights: ["256 GB памʼяті", "яскравий OLED", "тривала підтримка"],
    caution: "Немає зарядного блока в комплекті",
    aiSummary: "Сильний універсальний варіант, якщо важливі камера, стабільність і довгий строк використання.",
    offers: [
      { store: "TechMarket", price: 42999, delivery: "1–2 дні", warranty: "12 міс.", trusted: true },
      { store: "DeviceHub", price: 43790, delivery: "завтра", warranty: "12 міс.", trusted: true },
      { store: "MobilePoint", price: 44999, delivery: "2–3 дні", warranty: "12 міс.", trusted: true }
    ]
  },
  {
    id: "s25-256",
    title: "Samsung Galaxy S25 256 GB",
    category: "Смартфони",
    subtitle: "6.2\" AMOLED · 256 GB · 5G",
    rating: 4.7,
    reviewCount: 241,
    image: "📱",
    bestPrice: 33999,
    oldPrice: 37999,
    score: 92,
    highlights: ["компактний корпус", "120 Гц", "дуже хороша камера"],
    aiSummary: "Вигідніший за багато флагманів, особливо якщо хочеш компактний Android без компромісу по швидкості.",
    offers: [
      { store: "GalaxyStore", price: 33999, delivery: "завтра", warranty: "12 міс.", trusted: true },
      { store: "TechMarket", price: 34450, delivery: "1–2 дні", warranty: "12 міс.", trusted: true }
    ]
  },
  {
    id: "loq-15",
    title: "Lenovo LOQ 15 Gaming",
    category: "Ноутбуки",
    subtitle: "15.6\" · Ryzen 7 · RTX 5060 · 16/1024 GB",
    rating: 4.6,
    reviewCount: 96,
    image: "💻",
    bestPrice: 41999,
    oldPrice: 44999,
    score: 91,
    highlights: ["RTX 5060", "1 TB SSD", "хороше охолодження"],
    caution: "Автономність середня",
    aiSummary: "Добрий вибір у бюджеті до 45 тис. грн, якщо основний пріоритет — ігри та продуктивність.",
    offers: [
      { store: "NotebookPro", price: 41999, delivery: "1–2 дні", warranty: "24 міс.", trusted: true },
      { store: "GameTech", price: 42690, delivery: "завтра", warranty: "24 міс.", trusted: true }
    ]
  },
  {
    id: "roborock-q8",
    title: "Roborock Q8 Max+",
    category: "Для дому",
    subtitle: "робот-пилосос · станція самоочищення",
    rating: 4.8,
    reviewCount: 327,
    image: "🤖",
    bestPrice: 14999,
    oldPrice: 16999,
    score: 95,
    highlights: ["добре збирає шерсть", "самоочищення", "точна навігація"],
    aiSummary: "Один із найзручніших варіантів, якщо хочеш мінімум ручного догляду та маєш домашніх тварин.",
    offers: [
      { store: "HomeSmart", price: 14999, delivery: "завтра", warranty: "12 міс.", trusted: true },
      { store: "CleanHome", price: 15490, delivery: "1–2 дні", warranty: "24 міс.", trusted: true }
    ]
  },
  {
    id: "sony-55",
    title: "Sony BRAVIA 55\" 4K 120 Hz",
    category: "Телевізори",
    subtitle: "55\" · 4K · 120 Гц · HDMI 2.1",
    rating: 4.7,
    reviewCount: 122,
    image: "📺",
    bestPrice: 24799,
    oldPrice: 26999,
    score: 93,
    highlights: ["120 Гц", "HDMI 2.1", "підходить для PS5"],
    aiSummary: "Сильний варіант до 25 тис. грн для консолі й фільмів, якщо пріоритет — рух і якість зображення.",
    offers: [
      { store: "TVWorld", price: 24799, delivery: "2–3 дні", warranty: "24 міс.", trusted: true },
      { store: "TechMarket", price: 25299, delivery: "1–2 дні", warranty: "24 міс.", trusted: true }
    ]
  },
  {
    id: "bosch-drill",
    title: "Bosch Professional GSB 18V",
    category: "Інструменти",
    subtitle: "акумуляторний дриль-шуруповерт · 18 V",
    rating: 4.9,
    reviewCount: 411,
    image: "🛠️",
    bestPrice: 7299,
    oldPrice: 7999,
    score: 96,
    highlights: ["надійна серія", "18 V", "хороший комплект"],
    aiSummary: "Практичний професійний варіант, якщо потрібен інструмент не на один ремонт.",
    offers: [
      { store: "ToolHouse", price: 7299, delivery: "завтра", warranty: "36 міс.", trusted: true }
    ]
  }
];
