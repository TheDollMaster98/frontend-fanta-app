// Trasporto delle chiamate alle API proxy dell'app (/api/leaguepedia,
// /api/lolesports). Nel browser è un normale fetch relativo; nelle Cloud
// Functions (functions/src/index.ts) non esiste un server Next a cui
// chiedere, quindi lì si installa un trasporto che chiama direttamente gli
// stessi proxy di lib/server/ (9/10). Così lib/leaguepediaApi.ts e
// lib/lolesportsApi.ts restano un solo codice per client e server.
export type ApiFetch = (pathWithQuery: string) => Promise<Response>;

let transport: ApiFetch = (pathWithQuery) => fetch(pathWithQuery);

export function setApiTransport(fn: ApiFetch): void {
  transport = fn;
}

export function apiFetch(pathWithQuery: string): Promise<Response> {
  return transport(pathWithQuery);
}
