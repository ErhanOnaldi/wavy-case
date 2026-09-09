import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/trpc/provider";

export const metadata: Metadata = {
  title: "Wavy — Campaigns & clips",
  description: "A clipping campaign marketplace demo.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
