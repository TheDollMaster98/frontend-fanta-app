import { cn } from "@/lib/utils";

// Marchio dell'app (9/10): una "F" fatta di barre di classifica che si
// accorciano (1° posto la più lunga, 2° più corta) più un punto, cioè
// "Points". Si legge F· e insieme è una classifica stilizzata, il cuore di
// un fantasy. Colori dai token del tema (--primary, --primary-foreground),
// così segue la palette senza valori copiati a mano. Le versioni statiche
// (app/icon.svg, app/apple-icon.tsx, app/opengraph-image.tsx) ripetono la
// stessa geometria con i colori in esadecimale, perché lì le variabili CSS
// non esistono: se cambi la forma qui, cambiala anche lì.
export const LOGO_GEOMETRY = {
  viewBox: "0 0 32 32",
  tile: { rx: 8 },
  stem: { x: 8, y: 8, width: 4, height: 16, rx: 1.25 },
  first: { x: 8, y: 8, width: 15, height: 4, rx: 1.25 },
  second: { x: 8, y: 14.5, width: 9, height: 4, rx: 1.25 },
  point: { cx: 22, cy: 16.5, r: 2.25 },
} as const;

export function LogoMark({ className }: { className?: string }) {
  const g = LOGO_GEOMETRY;
  return (
    <svg
      viewBox={g.viewBox}
      className={cn("size-8 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx={g.tile.rx} fill="var(--primary)" />
      <g fill="var(--primary-foreground)">
        <rect {...g.stem} />
        <rect {...g.first} />
        <rect {...g.second} />
        <circle {...g.point} />
      </g>
    </svg>
  );
}

// Marchio + nome. "Fanta Points" senza "App": il nome è il prodotto, non
// la categoria. Tracking negativo come per i titoli grandi.
export function Logo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span
        className={cn(
          "text-lg font-semibold tracking-[-0.02em] text-foreground",
          textClassName,
        )}
      >
        Fanta Points
      </span>
    </span>
  );
}
