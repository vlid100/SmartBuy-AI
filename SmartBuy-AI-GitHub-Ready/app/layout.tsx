import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartBuy AI — знайди й порівняй",
  description: "SmartBuy AI порівнює українські магазини, приватні оголошення та відкриває точний пошук на AliExpress, Temu й Amazon."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uk"><body>{children}</body></html>;
}
