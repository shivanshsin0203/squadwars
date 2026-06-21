import type { Metadata, Viewport } from "next";
import { Saira_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "./_components/Toast";

// The design system's three faces, self-hosted + preloaded by next/font (no
// render-blocking @import to Google, no first-paint FOUT on the wordmark).
// Exposed as CSS variables the inline token blocks reference via var(--font-*).
const saira = Saira_Condensed({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-saira",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://squadwars.online";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SquadWars · 1v1 Football Auction",
    template: "%s · SquadWars",
  },
  description:
    "Real-time 1v1 football auction. Chalk your shape, lodge bids against an AI opponent, take the floor.",
  applicationName: "SquadWars",
  authors: [{ name: "SquadWars" }],
  keywords: [
    "SquadWars",
    "football auction",
    "1v1",
    "FUT",
    "fantasy football",
    "draft",
  ],
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "SquadWars · 1v1 Football Auction",
    description:
      "Real-time 1v1 football auction. Chalk your shape, lodge bids against an AI opponent, take the floor.",
    url: SITE_URL,
    siteName: "SquadWars",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "SquadWars · 1v1 Football Auction",
    description: "Real-time 1v1 football auction against an AI manager.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1018",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${saira.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
