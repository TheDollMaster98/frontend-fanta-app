import type { Metadata } from "next";

export const metadata: Metadata = { title: "Il Mio Team" };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
