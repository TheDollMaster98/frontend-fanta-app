import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Anteprima quando si condivide un link dell'app (es. l'invito
// /join/[code]) in una chat. Stesso marchio di components/Logo.tsx e colori
// ricavati dai token del tema in app/globals.css (oklch convertiti in hex,
// 9/10): --background #080b10, --foreground #f0f2f4, --muted-foreground
// #87909c, --primary #dea143, --primary-foreground #130c03. Qui le
// variabili CSS non esistono: se cambia la palette, aggiorna questi valori.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#080b10",
          fontFamily: "sans-serif",
        }}
      >
        <svg width="148" height="148" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8" fill="#dea143" />
          <g fill="#130c03">
            <rect x="8" y="8" width="4" height="16" rx="1.25" />
            <rect x="8" y="8" width="15" height="4" rx="1.25" />
            <rect x="8" y="14.5" width="9" height="4" rx="1.25" />
            <circle cx="22" cy="16.5" r="2.25" />
          </g>
        </svg>
        <div
          style={{
            fontSize: 88,
            fontWeight: 700,
            letterSpacing: -2,
            color: "#f0f2f4",
            marginTop: 40,
          }}
        >
          Fanta Points
        </div>
        <div style={{ fontSize: 34, color: "#87909c", marginTop: 16 }}>
          Leghe, aste e classifiche con i tuoi amici
        </div>
      </div>
    ),
    { ...size },
  );
}
