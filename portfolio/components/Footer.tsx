import { site } from "@/lib/content";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1280px] justify-between px-4 py-6 font-mono text-xs text-ink-muted md:px-8">
        <span>
          © {new Date().getFullYear()} {site.name}
        </span>
        <a href="#top" className="transition-colors hover:text-ink">
          Torna su ↑
        </a>
      </div>
    </footer>
  );
}
