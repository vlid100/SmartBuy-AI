import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartBuy AI — знайди й порівняй",
  description: "Розумний пошук товарів, цін і пропозицій з різних джерел."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uk"><body>{children}</body></html>;
}
