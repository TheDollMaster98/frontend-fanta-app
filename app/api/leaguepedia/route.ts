import { NextResponse } from "next/server";
import { proxyLeaguepedia } from "@/lib/server/leaguepediaProxy";

// La logica (login del bot, allowlist delle action, fallback in rate
// limit) sta in lib/server/leaguepediaProxy.ts: la usano anche le Cloud
// Functions del ricalcolo automatico.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { status, body } = await proxyLeaguepedia(searchParams);
  return NextResponse.json(body, { status });
}
