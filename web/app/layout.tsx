import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Crowd — Dining Hall Status",
  description:
    "Should I go now? Live busyness from ambient WiFi density near dining halls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
