import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GDIQR Analysis Assistant",
  description:
    "A qualitative analysis workspace using GDIQR as the default method."
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
