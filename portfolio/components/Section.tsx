type SectionProps = {
  id: string;
  index: string;
  label: string;
  children: React.ReactNode;
};

export function Section({ id, index, label, children }: SectionProps) {
  return (
    <section id={id} className="border-t border-line">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-x-6 px-4 py-20 md:px-8 md:py-32">
        <p className="col-span-12 mb-10 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted md:col-span-3 md:mb-0">
          {index} / {label}
        </p>
        <div className="col-span-12 md:col-span-9">{children}</div>
      </div>
    </section>
  );
}
