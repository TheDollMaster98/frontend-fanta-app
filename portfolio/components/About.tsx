import { experience, skills } from "@/lib/content";
import { Section } from "./Section";

export function About() {
  return (
    <Section id="profilo" index="02" label="Profilo">
      <p className="max-w-[40ch] text-2xl leading-snug tracking-[-0.015em] md:text-3xl">
        [Tre frasi su di te. Cosa sai fare meglio degli altri, in che contesti hai lavorato, cosa
        cerchi adesso. Niente &ldquo;appassionato di tecnologia&rdquo;.]
      </p>

      <div className="mt-20 grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-6">
        <div>
          <h3 className="mb-6 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Esperienza
          </h3>
          <dl>
            {experience.map((item) => (
              <div
                key={item.company + item.period}
                className="grid grid-cols-[8.5rem_1fr] gap-4 border-t border-line py-4 text-sm"
              >
                <dt className="font-mono text-xs leading-5 text-ink-muted">{item.period}</dt>
                <dd>
                  {item.company}
                  <span className="block text-ink-muted">{item.role}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="mb-6 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Strumenti
          </h3>
          <ul className="text-sm">
            {skills.map((skill) => (
              <li key={skill} className="border-t border-line py-4">
                {skill}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
