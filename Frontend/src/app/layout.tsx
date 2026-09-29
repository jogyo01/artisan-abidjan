import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import { MotionProvider } from "@/components/motion";
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
  title: "Artisan-Abidjan",
  description: "Trouvez un artisan vérifié près de chez vous à Abidjan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MotionProvider>
          <Suspense
            fallback={
              <header className="border-b border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] bg-[var(--aa-cream)] px-4 py-3 text-sm text-[var(--aa-ink-soft)]">
                Artisan-Abidjan
              </header>
            }
          >
            <Navbar />
          </Suspense>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </MotionProvider>
      </body>
    </html>
  );
}
