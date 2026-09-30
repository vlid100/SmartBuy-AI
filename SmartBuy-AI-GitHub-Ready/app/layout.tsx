import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartBuy AI — розумний пошук покупок",
  description: "Знаходь, порівнюй і відстежуй найкращі пропозиції в одному місці."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
