import type { Metadata, Viewport } from "next";
import PwaManager from "@/components/PwaManager";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://smartbuy-ai.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SmartBuy AI — знайди й порівняй",
    template: "%s · SmartBuy AI",
  },
  description: "SmartBuy AI порівнює українські магазини, приватні оголошення та міжнародні майданчики, відстежує ціни й допомагає оцінити покупку.",
  applicationName: "SmartBuy AI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "SmartBuy",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  keywords: ["порівняння цін", "SmartBuy", "OLX", "Rozetka", "Amazon", "AliExpress", "Temu", "відстеження цін"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { title: "SmartBuy AI — знайди й порівняй", description: "Порівняння цін, продавців і реальної вартості покупки.", url: "/", siteName: "SmartBuy AI", locale: "uk_UA", type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4b65f0",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uk"><body>{children}<PwaManager/></body></html>;
}
