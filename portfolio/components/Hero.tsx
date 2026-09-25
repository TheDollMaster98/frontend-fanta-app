import { site } from "@/lib/content";

export function Hero() {
  return (
    <section id="top" className="mx-auto max-w-[1280px] px-4 pb-20 pt-24 md:px-8 md:pb-32 md:pt-40">
      <div className="mb-12 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
        <span>{site.role}</span>
        <span>{site.location}</span>
        {site.available && (
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-signal" aria-hidden />
            Disponibile per nuovi progetti
          </span>
        )}
      </div>
      <h1 className="max-w-[18ch] text-[clamp(2.5rem,7vw,6.5rem)] font-medium leading-[0.98] tracking-[-0.035em]">
        {site.statement}
      </h1>
    </section>
  );
}
