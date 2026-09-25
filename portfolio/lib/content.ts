// Unica fonte dei contenuti del sito. Tutto ciò che è tra [parentesi quadre] va sostituito.

export const site = {
  name: "Loris [Cognome]",
  role: "Frontend Developer",
  location: "[Città], Italia",
  email: "[tua@email.it]",
  available: true,
  statement:
    "Costruisco interfacce web veloci, leggibili e mantenibili. [Riscrivi questa frase: chi sei, per chi lavori, che risultato porti.]",
  links: [
    { label: "GitHub", href: "https://github.com/TheDollMaster98" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/[profilo]" },
    { label: "CV", href: "/cv.pdf" },
  ],
};

export type Project = {
  title: string;
  year: string;
  role: string;
  summary: string;
  stack: string[];
  href?: string;
};

export const projects: Project[] = [
  {
    title: "Fanta LoL",
    year: "2025",
    role: "Design & sviluppo",
    summary:
      "Piattaforma fantasy per il competitivo di League of Legends: leghe private, aste in tempo reale, ruoli e punteggi importati da Leaguepedia.",
    stack: ["Next.js", "TypeScript", "Firebase", "Leaguepedia API"],
    href: "https://github.com/TheDollMaster98/frontend-fanta-app",
  },
  {
    title: "[Progetto 2]",
    year: "[Anno]",
    role: "[Ruolo]",
    summary: "[Problema, cosa hai fatto tu, risultato misurabile. Due righe.]",
    stack: ["[Tech]"],
  },
  {
    title: "[Progetto 3]",
    year: "[Anno]",
    role: "[Ruolo]",
    summary: "[Problema, cosa hai fatto tu, risultato misurabile. Due righe.]",
    stack: ["[Tech]"],
  },
];

export const experience = [
  { period: "[2024 — oggi]", company: "[Azienda]", role: "[Ruolo]" },
  { period: "[2022 — 2024]", company: "[Azienda]", role: "[Ruolo]" },
];

export const skills = [
  "TypeScript",
  "React",
  "Next.js",
  "Tailwind CSS",
  "Firebase",
  "GSAP",
];
