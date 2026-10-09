import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Icona per "Aggiungi a schermata Home" su iPhone: stesso marchio di
// components/Logo.tsx (vedi il commento lì), su fondo pieno perché iOS
// arrotonda da solo gli angoli.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#dea143",
        }}
      >
        <svg width="140" height="140" viewBox="4 4 24 24">
          <g fill="#130c03">
            <rect x="8" y="8" width="4" height="16" rx="1.25" />
            <rect x="8" y="8" width="15" height="4" rx="1.25" />
            <rect x="8" y="14.5" width="9" height="4" rx="1.25" />
            <circle cx="22" cy="16.5" r="2.25" />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
