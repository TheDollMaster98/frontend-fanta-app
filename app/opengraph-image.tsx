import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generata al volo (nessun asset da caricare/mantenere): stessa palette
// dell'app (carbone scuro + oro), usata quando si condivide un link
// dell'app (es. l'invito /join/[code]) in una chat.
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
          backgroundColor: "#171b26",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 32,
            letterSpacing: 6,
            color: "#8b93a3",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Fantasy Management
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: "#f5f6f8",
          }}
        >
          Fanta Points App
        </div>
        <div
          style={{
            fontSize: 34,
            color: "#c99a3f",
            marginTop: 24,
          }}
        >
          Leghe, aste e punteggi in tempo reale
        </div>
      </div>
    ),
    { ...size },
  );
}
