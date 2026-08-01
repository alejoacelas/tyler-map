import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Tyler Cowen Atlas",
    description: "Search a place, then read Tyler Cowen’s guides, meals, books, people, and ideas bound to it.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "Tyler Cowen Atlas", description: "The world, according to Tyler Cowen.", type: "website", images: [{ url: image, width: 1743, height: 909, alt: "Tyler Cowen Atlas — The world, according to Tyler." }] },
    twitter: { card: "summary_large_image", title: "Tyler Cowen Atlas", description: "The world, according to Tyler Cowen.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>;
}
