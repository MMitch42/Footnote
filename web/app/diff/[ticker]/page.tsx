import type { Metadata } from "next";
import { DiffPageClient } from "./DiffPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  return {
    title: `${t} · Filing Diff — Footnote`,
    description: `See what changed in ${t}'s latest 10-K and 10-Q filings. Every risk factor, MD&A, and legal disclosure change scored by semantic novelty.`,
    openGraph: {
      title: `${t} · SEC Filing Diff — Footnote`,
      description: `Track language changes in ${t}'s latest SEC filings with AI-powered novelty scores. Know before most investors do.`,
      url: `https://getfootnote.app/diff/${t}`,
    },
    twitter: {
      card: "summary",
      title: `${t} · Filing Diff — Footnote`,
      description: `See what changed in ${t}'s latest SEC filings. Novelty-scored risk factors and MD&A.`,
    },
  };
}

export default function DiffPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  return <DiffPageClient params={params} />;
}
