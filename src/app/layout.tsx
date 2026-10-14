import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import ServiceWorkerRegister from "./sw-register";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-display" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Control — Ashar's Projects",
  description: "Live constellation of every project, application and deadline.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ashar Control",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    // legacy alias for older iOS (Next emits the modern mobile-web-app-capable)
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05090b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sora.variable} ${plexMono.variable}`}>
      <body className="bg-[#05090b] text-[#e8f1ee] antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
