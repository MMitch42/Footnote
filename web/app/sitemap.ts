import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://getfootnote.app";
  return [
    { url: base,              lastModified: new Date(), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/upgrade`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/sign-in`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/sign-up`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`,   lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];
}
