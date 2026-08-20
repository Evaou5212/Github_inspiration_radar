import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Built With AI",
  description: "Archival index of design-adjacent AI projects.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="mx-auto w-[96vw] max-w-[2200px] flex-1 px-1 py-2 md:px-1.5">
            {children}
          </main>
          <footer className="border-t border-rule py-3 text-center text-[11px] uppercase tracking-[0.08em] text-muted">
            Built With AI · Editorial Project Index
          </footer>
        </div>
      </body>
    </html>
  );
}
