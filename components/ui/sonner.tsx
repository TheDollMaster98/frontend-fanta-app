"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// L'app è sempre dark (vedi app/layout.tsx, nessun toggle tema), quindi
// niente next-themes: tema fisso, variabili CSS mappate sui token del
// design system invece dei colori di default di sonner.
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      richColors
      closeButton
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
