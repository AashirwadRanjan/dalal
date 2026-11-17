import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import Footer from "@/components/Footer";
import "./globals.css";

// Self-hosted by next/font at build time: no request to Google from the browser.
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Dalal", template: "%s · Dalal" },
  description: "Personal Indian market research dashboard. End-of-day data. Not investment advice.",
};

export const dynamic = "force-dynamic"; // header status reads the database on every request

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AppHeader />
        {children}
        <div className="wrap">
          <Footer />
        </div>
      </body>
    </html>
  );
}
