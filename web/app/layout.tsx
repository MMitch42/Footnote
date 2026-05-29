import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { ChatWidget } from "@/components/ChatWidget";
import { FeatureLauncher } from "@/components/FeatureLauncher";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

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
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-15PQKR6E84"
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-15PQKR6E84');
            `}
          </Script>
          {children}
          <FeatureLauncher />
          <ChatWidget />
        </body>
      </html>
    </ClerkProvider>
  );
}
