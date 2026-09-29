import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gestione Lega" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
