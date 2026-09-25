import { site } from "@/lib/content";
import { Section } from "./Section";

export function Contact() {
  return (
    <Section id="contatti" index="03" label="Contatti">
      <p className="mb-6 text-ink-muted">Hai un progetto o una posizione aperta? Scrivimi.</p>
      <a
        href={`mailto:${site.email}`}
        className="inline-block break-all border-b border-ink pb-1 text-[clamp(1.75rem,5vw,4.5rem)] font-medium leading-none tracking-[-0.03em] transition-colors hover:text-ink-muted"
      >
        {site.email}
      </a>
      <ul className="mt-16 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        {site.links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="text-ink-muted transition-colors hover:text-ink"
            >
              {link.label} ↗
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
