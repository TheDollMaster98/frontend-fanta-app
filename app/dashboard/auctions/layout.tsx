import type { Metadata } from "next";

export const metadata: Metadata = { title: "Aste" };

export default function AuctionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
