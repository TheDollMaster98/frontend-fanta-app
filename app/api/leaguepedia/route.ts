import { NextResponse } from "next/server";

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
    { cache: "no-store" },
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
    cache: "no-store",
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
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
        cache: "no-store",
      },
    );

    const data = await response.json();

    if (!response.ok || data?.error?.code === "ratelimited") {
      return NextResponse.json(
        {
          cargoquery: [],
          fallback: true,
          reason: data?.error?.code || "leaguepedia_http_error",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { cargoquery: [], fallback: true, reason: "fetch_failed" },
      { status: 200 },
    );
  }
}
