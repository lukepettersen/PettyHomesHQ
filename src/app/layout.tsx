import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Petty Homes HQ",
  description: "Private CRM and transaction coordination for Petty Homes",
  robots: { index: false, follow: false },
  // Home-screen app: opens full screen with the name "HQ".
  appleWebApp: { capable: true, title: "HQ", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#727755" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Mukta+Mahee:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
