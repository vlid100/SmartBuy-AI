import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://smartbuy-ai.vercel.app").replace(/\/$/, "");
  return ["", "/privacy", "/terms"].map((path, index) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: index ? "monthly" as const : "weekly" as const, priority: index ? 0.3 : 1 }));
}
