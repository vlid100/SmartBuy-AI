import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartBuy AI — знайди й порівняй",
  description: "Гібридний пошук товарів, цін і приватних оголошень по ринку України."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uk"><body>{children}</body></html>;
}
