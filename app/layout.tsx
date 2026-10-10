import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "HaqSaathi — Scheme application companion",
  description: "Verified checklists and clearly separated community experiences. An independent tool, not a government service.",
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
      <body className="min-h-full flex flex-col">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="site-header"><div className="header-inner">
          <Link href="/" className="brand">HaqSaathi<span>Application companion</span></Link>
          <p className="independence">This is an independent tool, not a government service.</p>
        </div></header>
        {children}
        <footer className="site-footer">Preparation, not a promise of approval. Always confirm current requirements with the official office.</footer>
      </body>
    </html>
  );
}
