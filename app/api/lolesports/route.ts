import { NextRequest, NextResponse } from "next/server";

// Proxy lato server verso l'API (non ufficiale ma pubblica) che alimenta
// lolesports.com — stesso motivo del proxy Leaguepedia: tenere fuori dal
// bundle client qualunque cosa assomigli a una credenziale, anche se
// questa specifica key è nota pubblicamente (è nel client JS di
// lolesports.com stesso). Un solo posto per ruotarla se mai cambiasse.
const GW_BASE = "https://esports-api.lolesports.com/persisted/gw";
const FEED_BASE = "https://feed.lolesports.com/livestats/v1";

// Chiave pubblica documentata nell'OpenAPI non ufficiale dell'API
// (vickz84259.github.io/lolesports-api-docs), usabile senza restrizioni
// note. LOLESPORTS_API_KEY in env la sovrascrive se mai dovesse ruotare.
const DEFAULT_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const path = searchParams.get("path");

  if (!path || (source !== "gw" && source !== "feed")) {
    return NextResponse.json(
      { error: "Parametri 'source' (gw|feed) e 'path' richiesti" },
      { status: 400 },
    );
  }

  const base = source === "gw" ? GW_BASE : FEED_BASE;
  const forwarded = new URLSearchParams(searchParams);
  forwarded.delete("source");
  forwarded.delete("path");

  const targetUrl = `${base}/${path}${forwarded.toString() ? `?${forwarded.toString()}` : ""}`;

  const headers: Record<string, string> = {};
  // Solo gli endpoint "gw" (getLeagues/getSchedule/getEventDetails/...)
  // richiedono la key secondo lo schema OpenAPI: window/details su
  // feed.lolesports.com non la vogliono.
  if (source === "gw") {
    headers["x-api-key"] = process.env.LOLESPORTS_API_KEY || DEFAULT_API_KEY;
  }

  try {
    const response = await fetch(targetUrl, { headers, cache: "no-store" });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Errore nel proxy lolesports:", error);
    return NextResponse.json(
      { error: "Richiesta a lolesports fallita" },
      { status: 502 },
    );
  }
}
