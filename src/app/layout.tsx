import type { Metadata, Viewport } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { I18nProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "QulayMap Uzbekistan",
  description:
    "Community-owned mapping and route planning for access, resources, and routes matched to your conditions.",
};

export const viewport: Viewport = { themeColor: "#fce000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body className="flex min-h-screen flex-col">
        <I18nProvider>
          <Header />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
