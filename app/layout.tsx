import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SCHOOL_NAME } from "@/lib/schedule";

export const metadata: Metadata = {
  title: { default: `${SCHOOL_NAME} Staff`, template: `%s · ${SCHOOL_NAME} Staff` },
  description: "Staff schedule, break clock and hours for the school.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href="/s/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
