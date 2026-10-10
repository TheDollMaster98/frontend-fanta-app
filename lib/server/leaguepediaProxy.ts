// Proxy verso Leaguepedia con la sessione del bot (credenziali da env:
// LEAGUEPEDIA_USERNAME, LEAGUEPEDIA_BOT_PASSWORD). Usato dalla route
// app/api/leaguepedia (per il browser) e dalle Cloud Functions (per il
// ricalcolo automatico), stesso codice per entrambi (9/10).
const LEAGUEPEDIA_API_URL = "https://lol.fandom.com/api.php";
let cachedCookie = "";
let cachedCookieExpiresAt = 0;

function getSetCookieHeader(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = headers.getSetCookie?.() || [];
  return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

async function getLeaguepediaCookie(): Promise<string> {
  const username = process.env.LEAGUEPEDIA_USERNAME;
  const password = process.env.LEAGUEPEDIA_BOT_PASSWORD;

  if (!username || !password) {
    return "";
  }

  if (cachedCookie && Date.now() < cachedCookieExpiresAt) {
    return cachedCookie;
  }

  const tokenResponse = await fetch(
    `${LEAGUEPEDIA_API_URL}?action=query&meta=tokens&type=login&format=json`,
  );
  const tokenData = await tokenResponse.json();
  const loginToken = tokenData?.query?.tokens?.logintoken;
  const initialCookie = getSetCookieHeader(tokenResponse);

  if (!loginToken) {
    throw new Error("Leaguepedia non ha restituito un login token");
  }

  const loginParams = new URLSearchParams({
    action: "login",
    lgname: username,
    lgpassword: password,
    lgtoken: loginToken,
    format: "json",
  });
  const loginResponse = await fetch(LEAGUEPEDIA_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      ...(initialCookie ? { Cookie: initialCookie } : {}),
    },
    body: loginParams,
  });
  const loginData = await loginResponse.json();
  const loginCookie = getSetCookieHeader(loginResponse);
  const cookie = [initialCookie, loginCookie].filter(Boolean).join("; ");

  if (loginData?.login?.result !== "Success" || !cookie) {
    throw new Error(
      loginData?.login?.reason || "Credenziali Leaguepedia non valide",
    );
  }

  cachedCookie = cookie;
  cachedCookieExpiresAt = Date.now() + 30 * 60 * 1000;
  return cachedCookie;
}

// Uniche action MediaWiki che questa app usa davvero (vedi lib/leaguepediaApi.ts:
// "cargoquery" per tutte le query Cargo, "query" per la ricerca dell'URL
// immagine giocatore). La route non richiede login all'app — chiunque
// trovi l'URL può chiamarla — ma inoltra ogni richiesta con la sessione
// autenticata del bot Leaguepedia: senza un allowlist, un action diverso da
// questi due passerebbe comunque con le credenziali del bot. Le action che
// modificano dati (edit, delete, block, ecc.) richiedono comunque POST + un
// CSRF token lato MediaWiki, quindi non sono comunque eseguibili da qui che
// è GET-only — ma non c'è motivo di lasciare aperto più di quanto serve.
const ALLOWED_ACTIONS = new Set(["cargoquery", "query"]);

export async function proxyLeaguepedia(
  searchParams: URLSearchParams,
): Promise<{ status: number; body: unknown }> {
  const action = searchParams.get("action");

  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return {
      status: 400,
      body: { cargoquery: [], fallback: true, reason: "action_not_allowed" },
    };
  }

  const queryParams = new URLSearchParams();
  searchParams.forEach((value, key) => {
    queryParams.set(key, value);
  });

  try {
    const cookie = await getLeaguepediaCookie();
    const response = await fetch(
      `${LEAGUEPEDIA_API_URL}?${queryParams.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; FantaPointsApp/1.0)",
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
    );

    const data = await response.json();

    if (!response.ok || data?.error?.code === "ratelimited") {
      return {
        status: 200,
        body: {
          cargoquery: [],
          fallback: true,
          reason: data?.error?.code || "leaguepedia_http_error",
        },
      };
    }

    return { status: 200, body: data };
  } catch {
    return {
      status: 200,
      body: { cargoquery: [], fallback: true, reason: "fetch_failed" },
    };
  }
}
