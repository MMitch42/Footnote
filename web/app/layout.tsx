import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ChatWidget } from "@/components/ChatWidget";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Footnote | SEC Filing Intelligence",
  description:
    "Know when a company quietly changes what it tells investors. Footnote tracks SEC 10-K and 10-Q filings and alerts you when risk factors, MD&A, or legal disclosures shift.",
  metadataBase: new URL("https://getfootnote.app"),
  openGraph: {
    title: "Footnote | SEC Filing Intelligence",
    description:
      "Know when a company quietly changes what it tells investors. Get alerted when risk factors, MD&A, or legal disclosures shift in a new SEC filing.",
    url: "https://getfootnote.app",
    siteName: "Footnote",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Footnote | SEC Filing Intelligence",
    description:
      "Know when a company quietly changes what it tells investors. Get alerted when risk factors, MD&A, or legal disclosures shift in a new SEC filing.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full`}
      >
        <body className="min-h-full flex flex-col bg-bg-base text-text-primary antialiased">
          {children}
          <ChatWidget />
        </body>
      </html>
    </ClerkProvider>
  );
}
