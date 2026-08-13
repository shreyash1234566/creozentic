import type { Metadata } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Creozentic by Autozentic",
  description: "A creative reliability system for approved, on-brand campaign packs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
