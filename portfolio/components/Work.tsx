import { projects } from "@/lib/content";
import { Section } from "./Section";

export function Work() {
  return (
    <Section id="lavori" index="01" label="Lavori">
      <ol className="border-b border-line">
        {projects.map((project) => {
          const content = (
            <div className="grid grid-cols-12 gap-x-6 gap-y-3 py-8 md:py-10">
              <h3 className="col-span-9 text-2xl font-medium tracking-[-0.02em] md:col-span-5 md:text-3xl">
                {project.title}
              </h3>
              <p className="col-span-3 text-right font-mono text-xs leading-8 text-ink-muted md:order-last md:col-span-2 md:leading-9">
                {project.year}
              </p>
              <div className="col-span-12 md:col-span-5">
                <p className="text-ink-muted">{project.summary}</p>
                <p className="mt-4 font-mono text-xs text-ink-muted">
                  {project.role} — {project.stack.join(", ")}
                </p>
              </div>
            </div>
          );

          return (
            <li key={project.title} className="border-t border-line">
              {project.href ? (
                <a
                  href={project.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block transition-colors hover:bg-paper-raised"
                >
                  {content}
                </a>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
