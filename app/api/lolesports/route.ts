import { NextRequest, NextResponse } from "next/server";
import { proxyLolesports } from "@/lib/server/lolesportsProxy";

// Logica in lib/server/lolesportsProxy.ts, condivisa con le Cloud
// Functions del ricalcolo automatico.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { status, body } = await proxyLolesports(searchParams);
  return NextResponse.json(body, { status });
}
