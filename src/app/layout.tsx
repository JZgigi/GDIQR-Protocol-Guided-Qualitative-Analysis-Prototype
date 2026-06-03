import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GDI-QR-informed AI-Assisted Qualitative Analysis Prototype",
  description:
    "A researcher-led qualitative analysis workspace with AI draft support informed by GDI-QR."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
