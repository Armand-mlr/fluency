import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

/**
 * Typography (self-hosted, SIL Open Font License, works offline):
 * - Fraunces: expressive variable serif (opsz, SOFT, WONK axes) for headlines
 * - Schibsted Grotesk: a newspaper grotesk for reading and UI
 * - JetBrains Mono: labels, counters, keyboard hints (the dev side)
 */
const display = localFont({
  src: [
    { path: "./fonts/fraunces-latin-full-normal.woff2", style: "normal" },
    { path: "./fonts/fraunces-latin-full-italic.woff2", style: "italic" },
  ],
  variable: "--font-display",
  weight: "100 900",
  display: "swap",
});
const sans = localFont({ src: "./fonts/schibsted-grotesk-latin-wght-normal.woff2", variable: "--font-text", weight: "400 900", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-wght-normal.woff2", variable: "--font-code", weight: "100 800", display: "swap" });

export const metadata: Metadata = {
  title: "Fluency · Your English Studio",
  description: "Your personal English studio. Adaptive practice, vocabulary and optional local AI.",
};

export const viewport: Viewport = {
  themeColor: "#101116",
};

// Applied before paint so there's no flash of the wrong theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("fluency-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="night" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
