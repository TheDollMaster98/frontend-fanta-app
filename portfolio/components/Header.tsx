import { site } from "@/lib/content";

const nav = [
  { label: "Lavori", href: "#lavori" },
  { label: "Profilo", href: "#profilo" },
  { label: "Contatti", href: "#contatti" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 md:px-8">
        <a href="#top" className="text-sm font-medium">
          {site.name}
        </a>
        <nav className="flex gap-5 text-sm text-ink-muted md:gap-8">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
