"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  closeExpiredAuctionsJob: () => closeExpiredAuctionsJob,
  scheduledRecalculation: () => scheduledRecalculation
});
module.exports = __toCommonJS(index_exports);
var import_scheduler = require("firebase-functions/v2/scheduler");
var import_params = require("firebase-functions/params");
var import_v2 = require("firebase-functions/v2");
var import_app = require("firebase-admin/app");
var import_firestore2 = require("firebase-admin/firestore");

// ../lib/apiTransport.ts
var transport = (pathWithQuery) => fetch(pathWithQuery);
function setApiTransport(fn) {
  transport = fn;
}
function apiFetch(pathWithQuery) {
  return transport(pathWithQuery);
}

// ../lib/server/leaguepediaProxy.ts
var LEAGUEPEDIA_API_URL = "https://lol.fandom.com/api.php";
var cachedCookie = "";
var cachedCookieExpiresAt = 0;
function getSetCookieHeader(response) {
  const headers = response.headers;
  const cookies = headers.getSetCookie?.() || [];
  return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}
async function getLeaguepediaCookie() {
  const username = process.env.LEAGUEPEDIA_USERNAME;
  const password = process.env.LEAGUEPEDIA_BOT_PASSWORD;
  if (!username || !password) {
    return "";
  }
  if (cachedCookie && Date.now() < cachedCookieExpiresAt) {
    return cachedCookie;
  }
  const tokenResponse = await fetch(
    `${LEAGUEPEDIA_API_URL}?action=query&meta=tokens&type=login&format=json`
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
    format: "json"
  });
  const loginResponse = await fetch(LEAGUEPEDIA_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      ...initialCookie ? { Cookie: initialCookie } : {}
    },
    body: loginParams
  });
  const loginData = await loginResponse.json();
  const loginCookie = getSetCookieHeader(loginResponse);
  const cookie = [initialCookie, loginCookie].filter(Boolean).join("; ");
  if (loginData?.login?.result !== "Success" || !cookie) {
    throw new Error(
      loginData?.login?.reason || "Credenziali Leaguepedia non valide"
    );
  }
  cachedCookie = cookie;
  cachedCookieExpiresAt = Date.now() + 30 * 60 * 1e3;
  return cachedCookie;
}
var ALLOWED_ACTIONS = /* @__PURE__ */ new Set(["cargoquery", "query"]);
async function proxyLeaguepedia(searchParams) {
  const action = searchParams.get("action");
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return {
      status: 400,
      body: { cargoquery: [], fallback: true, reason: "action_not_allowed" }
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
          ...cookie ? { Cookie: cookie } : {}
        }
      }
    );
    const data = await response.json();
    if (!response.ok || data?.error?.code === "ratelimited") {
      return {
        status: 200,
        body: {
          cargoquery: [],
          fallback: true,
          reason: data?.error?.code || "leaguepedia_http_error"
        }
      };
    }
    return { status: 200, body: data };
  } catch {
    return {
      status: 200,
      body: { cargoquery: [], fallback: true, reason: "fetch_failed" }
    };
  }
}

// ../lib/server/lolesportsProxy.ts
var GW_BASE = "https://esports-api.lolesports.com/persisted/gw";
var FEED_BASE = "https://feed.lolesports.com/livestats/v1";
var DEFAULT_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
async function proxyLolesports(searchParams) {
  const source = searchParams.get("source");
  const path = searchParams.get("path");
  if (!path || source !== "gw" && source !== "feed") {
    return {
      status: 400,
      body: { error: "Parametri 'source' (gw|feed) e 'path' richiesti" }
    };
  }
  const base = source === "gw" ? GW_BASE : FEED_BASE;
  const forwarded = new URLSearchParams(searchParams);
  forwarded.delete("source");
  forwarded.delete("path");
  const targetUrl = `${base}/${path}${forwarded.toString() ? `?${forwarded.toString()}` : ""}`;
  const headers = {};
  if (source === "gw") {
    headers["x-api-key"] = process.env.LOLESPORTS_API_KEY || DEFAULT_API_KEY;
  }
  let response;
  try {
    response = await fetch(targetUrl, { headers });
  } catch (error) {
    console.error("Errore di rete verso lolesports:", error);
    return {
      status: 502,
      body: { error: "Richiesta a lolesports fallita (rete)", detail: String(error) }
    };
  }
  const rawBody = await response.text();
  try {
    return { status: response.status, body: JSON.parse(rawBody) };
  } catch {
    return {
      status: 502,
      body: {
        error: "Risposta lolesports non-JSON",
        upstreamStatus: response.status,
        body: rawBody.slice(0, 500)
      }
    };
  }
}

// src/jobs.ts
var import_firestore = require("firebase-admin/firestore");

// ../lib/constants.ts
var PLAYOFF_CIRCUITS = ["MSI", "WORLDS"];
var LOL_ROLES = ["Top Laner", "Jungler", "Mid Laner", "ADC", "Support"];
var LOL_ROLE_ALIASES = {
  top: "Top Laner",
  "top laner": "Top Laner",
  jungle: "Jungler",
  jungler: "Jungler",
  mid: "Mid Laner",
  "mid laner": "Mid Laner",
  bot: "ADC",
  "bot laner": "ADC",
  adc: "ADC",
  support: "Support"
};
function toLolRole(role) {
  if (!role) return role;
  return LOL_ROLE_ALIASES[role.trim().toLowerCase()] ?? role;
}
var DEFAULT_SCORING_WEIGHTS = {
  kills: 3,
  deaths: -1,
  assists: 1.5,
  win: 2,
  csPer50: 0,
  visionPer10: 0,
  pentakill: 0
};
var DEFAULT_ROLE_SCORING_WEIGHTS = Object.fromEntries(
  LOL_ROLES.map((role) => [role, { ...DEFAULT_SCORING_WEIGHTS }])
);
var DEFAULT_TEAM_SCORING_WEIGHTS = {
  win: 0,
  tower: 0.5,
  dragon: 1,
  voidGrub: 0.5,
  riftHerald: 0.75,
  inhibitor: 0.75,
  atakhan: 1,
  baron: 2,
  kill: 0,
  death: 0,
  assist: 0,
  csPer100: 0,
  goldPer10k: 0
};

// ../lib/bracket.ts
function isRoundComplete(matches) {
  return matches.length > 0 && matches.every((m) => Boolean(m.winnerUserId));
}
function nextRoundFromWinners(prevMatches) {
  if (prevMatches.length <= 1) return [];
  const sorted = [...prevMatches].sort((a, b) => a.matchIndex - b.matchIndex);
  const winners = sorted.map((m) => m.winnerUserId ?? null);
  const matches = [];
  for (let i = 0; i < winners.length; i += 2) {
    const homeUserId = winners[i];
    const awayUserId = winners[i + 1] ?? null;
    const winnerUserId = homeUserId && !awayUserId ? homeUserId : awayUserId && !homeUserId ? awayUserId : void 0;
    matches.push({
      matchIndex: i / 2,
      homeUserId,
      awayUserId,
      ...winnerUserId ? { winnerUserId } : {}
    });
  }
  return matches;
}

// ../lib/leaguepediaApi.ts
function escapeCargoValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
var LEAGUEPEDIA_UNAVAILABLE = "LEAGUEPEDIA_UNAVAILABLE";
async function cargoQuery(params, options = {}) {
  const fail = () => {
    if (options.strict) throw new Error(LEAGUEPEDIA_UNAVAILABLE);
    return [];
  };
  const queryParams = new URLSearchParams({
    action: "cargoquery",
    format: "json",
    tables: params.tables,
    fields: params.fields,
    limit: (params.limit || 50).toString()
  });
  if (params.where) queryParams.append("where", params.where);
  if (params.join_on) queryParams.append("join_on", params.join_on);
  if (params.order_by) queryParams.append("order_by", params.order_by);
  if (params.offset) queryParams.append("offset", params.offset.toString());
  if (params.group_by) queryParams.append("group_by", params.group_by);
  try {
    const response = await apiFetch(`/api/leaguepedia?${queryParams.toString()}`);
    if (!response.ok) {
      console.warn(
        "Leaguepedia request failed from server route; falling back to local pro players."
      );
      return fail();
    }
    const data = await response.json();
    if (data?.error?.code === "ratelimited") {
      console.warn("Leaguepedia rate limited; using fallback pro-player data.");
      return fail();
    }
    if (data?.cargoquery && Array.isArray(data.cargoquery)) {
      return data.cargoquery.map((item) => item.title || item).filter(Boolean);
    }
    if (data?.error) {
      console.warn(
        "Leaguepedia returned an error payload; using fallback pro-player data."
      );
      return fail();
    }
    return fail();
  } catch (error) {
    if (error instanceof Error && error.message === LEAGUEPEDIA_UNAVAILABLE) throw error;
    console.warn("Errore nella query Leaguepedia, uso fallback locale:", error);
    return fail();
  }
}
function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function toCargoDateTime(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
async function getFantasyPlayerStats(playerNames, circuitType, dateRange) {
  const names = Array.from(new Set(playerNames.map((n) => n.trim()).filter(Boolean)));
  const stats = {};
  names.forEach((n) => {
    stats[n] = { kills: 0, deaths: 0, assists: 0, wins: 0, gamesPlayed: 0 };
  });
  if (names.length === 0) return stats;
  const dateClause = dateRange ? ` AND SG.DateTime_UTC >= "${toCargoDateTime(dateRange.start)}" AND SG.DateTime_UTC < "${toCargoDateTime(dateRange.end)}"` : "";
  for (const group of chunk(names, 30)) {
    const nameList = group.map((n) => `"${escapeCargoValue(n)}"`).join(",");
    const results = [];
    const pageSize = 500;
    let offset = 0;
    while (true) {
      const page = await cargoQuery({
        tables: "ScoreboardPlayers=SP, ScoreboardGames=SG, Tournaments=T, PlayerRedirects=PR",
        fields: "PR.AllName=QueryName, SP.Team, SP.Kills, SP.Deaths, SP.Assists, SG.WinTeam",
        where: `PR.AllName IN (${nameList}) AND (T.Name LIKE "%${escapeCargoValue(circuitType)}%" OR T.League LIKE "%${escapeCargoValue(circuitType)}%")${dateClause}`,
        join_on: "SP.GameId=SG.GameId, SG.OverviewPage=T.OverviewPage, SP.Link=PR.AllName",
        limit: pageSize,
        offset
      }, { strict: true });
      results.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    results.forEach((r) => {
      const key = r.QueryName;
      const stat = stats[key];
      if (!stat) return;
      stat.kills += parseInt(r.Kills || "0");
      stat.deaths += parseInt(r.Deaths || "0");
      stat.assists += parseInt(r.Assists || "0");
      stat.gamesPlayed += 1;
      if (r.Team && r.WinTeam && r.Team === r.WinTeam) stat.wins += 1;
    });
  }
  return stats;
}
async function getFantasyTeamStats(teamNames, circuitType, dateRange) {
  const names = Array.from(new Set(teamNames.map((n) => n.trim()).filter(Boolean)));
  const stats = {};
  names.forEach((n) => {
    stats[n] = { wins: 0, gamesPlayed: 0 };
  });
  if (names.length === 0) return stats;
  const dateClause = dateRange ? ` AND SG.DateTime_UTC >= "${toCargoDateTime(dateRange.start)}" AND SG.DateTime_UTC < "${toCargoDateTime(dateRange.end)}"` : "";
  for (const group of chunk(names, 30)) {
    const nameList = group.map((n) => `"${escapeCargoValue(n)}"`).join(",");
    const results = [];
    const pageSize = 500;
    let offset = 0;
    while (true) {
      const page = await cargoQuery({
        tables: "ScoreboardGames=SG, Tournaments=T",
        fields: "SG.WinTeam, SG.LossTeam",
        where: `(SG.WinTeam IN (${nameList}) OR SG.LossTeam IN (${nameList})) AND (T.Name LIKE "%${escapeCargoValue(circuitType)}%" OR T.League LIKE "%${escapeCargoValue(circuitType)}%")${dateClause}`,
        join_on: "SG.OverviewPage=T.OverviewPage",
        limit: pageSize,
        offset
      }, { strict: true });
      results.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    results.forEach((r) => {
      if (r.WinTeam && stats[r.WinTeam]) {
        stats[r.WinTeam].wins += 1;
        stats[r.WinTeam].gamesPlayed += 1;
      }
      if (r.LossTeam && stats[r.LossTeam]) {
        stats[r.LossTeam].gamesPlayed += 1;
      }
    });
  }
  return stats;
}
async function getChampionGamesInRange(circuitType, dateRange) {
  const dateClause = ` AND SG.DateTime_UTC >= "${toCargoDateTime(dateRange.start)}" AND SG.DateTime_UTC < "${toCargoDateTime(dateRange.end)}"`;
  const results = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const page = await cargoQuery({
      tables: "ScoreboardGames=SG, Tournaments=T",
      fields: "SG.Team1, SG.Team2, SG.Winner, SG.Team1Picks, SG.Team2Picks, SG.Team1Bans, SG.Team2Bans",
      where: `(T.Name LIKE "%${escapeCargoValue(circuitType)}%" OR T.League LIKE "%${escapeCargoValue(circuitType)}%")${dateClause}`,
      join_on: "SG.OverviewPage=T.OverviewPage",
      limit: pageSize,
      offset
    }, { strict: true });
    results.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  const splitList = (value) => (value || "").split(",").map((name) => name.trim()).filter(Boolean);
  return results.map((r) => {
    const winner = Number(r.Winner);
    return {
      team1: (r.Team1 || "").trim(),
      team2: (r.Team2 || "").trim(),
      winner: winner === 1 || winner === 2 ? winner : null,
      team1Picks: splitList(r.Team1Picks),
      team2Picks: splitList(r.Team2Picks),
      team1Bans: splitList(r.Team1Bans),
      team2Bans: splitList(r.Team2Bans)
    };
  });
}

// ../lib/lolesportsApi.ts
function stripTeamTagFromSummonerName(summonerName) {
  const spaceIndex = summonerName.indexOf(" ");
  return spaceIndex === -1 ? summonerName : summonerName.slice(spaceIndex + 1);
}
async function gwRequest(path, params = {}) {
  const query = new URLSearchParams({ source: "gw", path, hl: "en-US", ...params });
  const response = await apiFetch(`/api/lolesports?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`lolesports ${path} ha risposto ${response.status}`);
  }
  const body = await response.json();
  return body.data;
}
async function feedRequest(path, params = {}) {
  const query = new URLSearchParams({ source: "feed", path, ...params });
  const response = await apiFetch(`/api/lolesports?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`lolesports ${path} ha risposto ${response.status}`);
  }
  return response.json();
}
async function getLeagues() {
  const data = await gwRequest("getLeagues");
  return data.leagues;
}
async function getSchedule(leagueId, pageToken) {
  const data = await gwRequest("getSchedule", {
    leagueId,
    ...pageToken ? { pageToken } : {}
  });
  return { events: data.schedule.events, olderPageToken: data.schedule.pages.older };
}
var leaguesCache = null;
async function findLeagueId(circuitType) {
  if (!leaguesCache) {
    leaguesCache = await getLeagues();
  }
  const normalized = circuitType.trim().toLowerCase();
  const match = leaguesCache.find(
    (l) => l.slug.toLowerCase() === normalized || l.name.toLowerCase() === normalized
  );
  return match?.id ?? null;
}
var MAX_SCHEDULE_PAGES = 5;
async function getTeamGameIdsInRange(leagueId, teamNames, dateRange) {
  const targets = new Set(teamNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  if (targets.size === 0) return [];
  const gameIds = [];
  let pageToken;
  for (let page = 0; page < MAX_SCHEDULE_PAGES; page++) {
    const { events, olderPageToken } = await getSchedule(leagueId, pageToken);
    const matchingEvents = events.filter((event) => {
      if (event.state !== "completed") return false;
      const eventTime = new Date(event.startTime).getTime();
      if (eventTime < dateRange.start.getTime() || eventTime >= dateRange.end.getTime()) {
        return false;
      }
      return event.match.teams.some(
        (t) => targets.has(t.name.trim().toLowerCase()) || targets.has(t.code.trim().toLowerCase())
      );
    });
    const eventGames = await Promise.all(
      matchingEvents.map((event) => getEventDetails(event.match.id))
    );
    eventGames.forEach(({ games }) => {
      games.forEach((g) => {
        if (g.state === "completed") gameIds.push(g.id);
      });
    });
    const oldestEventTime = events.length > 0 ? new Date(events[0].startTime).getTime() : null;
    if (!olderPageToken || oldestEventTime !== null && oldestEventTime <= dateRange.start.getTime()) {
      break;
    }
    pageToken = olderPageToken;
  }
  return gameIds;
}
async function getEventDetails(matchId) {
  const data = await gwRequest("getEventDetails", { id: matchId });
  return { games: data.event.match.games };
}
async function getGameWindow(gameId) {
  const data = await feedRequest(`window/${gameId}`);
  return {
    blueTeam: {
      esportsTeamId: data.gameMetadata.blueTeamMetadata.esportsTeamId,
      participants: data.gameMetadata.blueTeamMetadata.participantMetadata
    },
    redTeam: {
      esportsTeamId: data.gameMetadata.redTeamMetadata.esportsTeamId,
      participants: data.gameMetadata.redTeamMetadata.participantMetadata
    }
  };
}
async function getGameFinalStats(gameId) {
  const data = await feedRequest(`details/${gameId}`);
  const lastFrame = data.frames[data.frames.length - 1];
  return (lastFrame?.participants || []).map((p) => ({
    participantId: p.participantId,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    creepScore: p.creepScore,
    totalGold: p.totalGoldEarned,
    wardsPlaced: p.wardsPlaced,
    wardsDestroyed: p.wardsDestroyed
  }));
}
async function getGamePlayerStats(gameId) {
  const [window, stats] = await Promise.all([
    getGameWindow(gameId),
    getGameFinalStats(gameId)
  ]);
  const allMeta = [...window.blueTeam.participants, ...window.redTeam.participants];
  const statsByParticipant = new Map(stats.map((s) => [s.participantId, s]));
  return allMeta.map((meta) => {
    const s = statsByParticipant.get(meta.participantId);
    if (!s) return null;
    return { ...meta, ...s };
  }).filter((v) => v !== null);
}

// ../lib/scoring.ts
function computeAutoPoints(pick, playerStats, teamStats, roleWeights, teamWeights) {
  if (pick.pickType === "player" || pick.pickType === "jolly") {
    const s = playerStats[pick.playerName];
    const role = toLolRole(pick.playerRole);
    const weights = role ? roleWeights[role] : void 0;
    if (!s || !weights) return void 0;
    return s.kills * weights.kills + s.deaths * weights.deaths + s.assists * weights.assists + s.wins * weights.win;
  }
  if (pick.pickType === "team") {
    const s = teamStats[pick.playerName];
    return s ? s.wins * teamWeights.win : void 0;
  }
  if (pick.pickType === "coach" && pick.playerTeam) {
    const s = teamStats[pick.playerTeam];
    return s ? s.wins * teamWeights.win : void 0;
  }
  return void 0;
}
function computeLolesportsBonusPoints(stats, weights) {
  return stats.creepScore / 50 * weights.csPer50 + (stats.wardsPlaced + stats.wardsDestroyed) / 10 * weights.visionPer10;
}
function computeManualBonus(pick, roleWeights, teamWeights) {
  if (pick.pickType === "player" || pick.pickType === "jolly") {
    const role = toLolRole(pick.playerRole);
    const weights = role ? roleWeights[role] : void 0;
    const stats = pick.manualPlayerStats;
    if (!weights || !stats) return 0;
    return (stats.cs || 0) / 50 * weights.csPer50 + (stats.visionScore || 0) / 10 * weights.visionPer10 + (stats.pentakills || 0) * weights.pentakill;
  }
  if (pick.pickType === "team" || pick.pickType === "coach") {
    const stats = pick.manualTeamStats;
    if (!stats) return 0;
    return (stats.towers || 0) * teamWeights.tower + (stats.dragons || 0) * teamWeights.dragon + (stats.voidGrubs || 0) * teamWeights.voidGrub + (stats.riftHeralds || 0) * teamWeights.riftHerald + (stats.inhibitors || 0) * teamWeights.inhibitor + (stats.atakhans || 0) * teamWeights.atakhan + (stats.barons || 0) * teamWeights.baron + (stats.cs || 0) / 100 * teamWeights.csPer100 + (stats.gold || 0) / 1e4 * teamWeights.goldPer10k;
  }
  return 0;
}
function totalPickPoints(pick, roleWeights, teamWeights) {
  const total = (pick.points || 0) + computeManualBonus(pick, roleWeights, teamWeights);
  return Math.round(total * 100) / 100;
}

// ../lib/championPickScoring.ts
var CHAMPION_PICK_RARITY_POINTS = { solo: 4, pair: 2, crowd: 1 };
var CHAMPION_PICK_WIN_BONUS = 1;
var CHAMPION_BAN_TEAM_POINTS = 2;
var CHAMPION_BAN_CIRCUIT_POINTS = 1;
var normalizeChampionName = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
function computeChampionPickResults(picks, games, memberTeams) {
  const picked = /* @__PURE__ */ new Set();
  const pickedByWinner = /* @__PURE__ */ new Set();
  const bannedAnywhere = /* @__PURE__ */ new Set();
  const bansByTeam = /* @__PURE__ */ new Map();
  const teamsThatPlayed = /* @__PURE__ */ new Set();
  const teamKey = (team) => team.trim().toLowerCase();
  games.forEach((game) => {
    const sides = [
      { team: game.team1, picks: game.team1Picks, bans: game.team1Bans, won: game.winner === 1 },
      { team: game.team2, picks: game.team2Picks, bans: game.team2Bans, won: game.winner === 2 }
    ];
    sides.forEach((side) => {
      const key = teamKey(side.team);
      if (key) teamsThatPlayed.add(key);
      side.picks.forEach((champ) => {
        const c = normalizeChampionName(champ);
        picked.add(c);
        if (side.won) pickedByWinner.add(c);
      });
      side.bans.forEach((champ) => {
        const c = normalizeChampionName(champ);
        bannedAnywhere.add(c);
        if (!key) return;
        if (!bansByTeam.has(key)) bansByTeam.set(key, /* @__PURE__ */ new Set());
        bansByTeam.get(key).add(c);
      });
    });
  });
  const choiceCount = /* @__PURE__ */ new Map();
  picks.forEach((p) => {
    const c = normalizeChampionName(p.championName);
    if (c) choiceCount.set(c, (choiceCount.get(c) || 0) + 1);
  });
  const results = {};
  picks.forEach((p) => {
    const champ = normalizeChampionName(p.championName);
    let pickPoints = 0;
    let winBonus = 0;
    if (champ && picked.has(champ)) {
      const count = choiceCount.get(champ) || 1;
      pickPoints = count === 1 ? CHAMPION_PICK_RARITY_POINTS.solo : count === 2 ? CHAMPION_PICK_RARITY_POINTS.pair : CHAMPION_PICK_RARITY_POINTS.crowd;
      if (pickedByWinner.has(champ)) winBonus = CHAMPION_PICK_WIN_BONUS;
    }
    const ban = normalizeChampionName(p.banChampionName || "");
    let banPoints = 0;
    let banScope = "none";
    if (ban) {
      const team = memberTeams[p.userId];
      const key = team ? teamKey(team) : "";
      if (key && teamsThatPlayed.has(key)) {
        banScope = "team";
        if (bansByTeam.get(key)?.has(ban)) banPoints = CHAMPION_BAN_TEAM_POINTS;
      } else {
        banScope = "circuit";
        if (bannedAnywhere.has(ban)) banPoints = CHAMPION_BAN_CIRCUIT_POINTS;
      }
    }
    results[p.id] = {
      points: pickPoints + winBonus + banPoints,
      pickPoints,
      winBonus,
      banPoints,
      banScope
    };
  });
  return results;
}

// ../lib/recalc.ts
async function computeLolesportsRoundBonuses(involvedUserIds, dateRange, leagueId, roleWeights, members) {
  const bonuses = /* @__PURE__ */ new Map();
  if (!leagueId) return bonuses;
  const picksByTeam = /* @__PURE__ */ new Map();
  involvedUserIds.forEach((uid) => {
    const member = members.find((m) => m.userId === uid);
    member?.team.forEach((pick) => {
      if ((pick.pickType === "player" || pick.pickType === "jolly") && pick.playerTeam) {
        const list = picksByTeam.get(pick.playerTeam) || [];
        list.push({ userId: uid, playerName: pick.playerName, playerRole: pick.playerRole });
        picksByTeam.set(pick.playerTeam, list);
      }
    });
  });
  const teamNames = Array.from(picksByTeam.keys());
  if (teamNames.length === 0) return bonuses;
  const gameIds = await getTeamGameIdsInRange(leagueId, teamNames, dateRange);
  if (gameIds.length === 0) return bonuses;
  const gamesStats = await Promise.all(gameIds.map((id) => getGamePlayerStats(id)));
  const statsByStrippedName = /* @__PURE__ */ new Map();
  gamesStats.flat().forEach((p) => {
    const name = stripTeamTagFromSummonerName(p.summonerName).trim().toLowerCase();
    const prev = statsByStrippedName.get(name) || {
      creepScore: 0,
      wardsPlaced: 0,
      wardsDestroyed: 0
    };
    statsByStrippedName.set(name, {
      creepScore: prev.creepScore + p.creepScore,
      wardsPlaced: prev.wardsPlaced + p.wardsPlaced,
      wardsDestroyed: prev.wardsDestroyed + p.wardsDestroyed
    });
  });
  picksByTeam.forEach((picks) => {
    picks.forEach(({ userId, playerName, playerRole }) => {
      const role = toLolRole(playerRole);
      const weights = role ? roleWeights[role] : void 0;
      const stats = statsByStrippedName.get(playerName.trim().toLowerCase());
      if (!weights || !stats) return;
      const points = computeLolesportsBonusPoints(stats, weights);
      bonuses.set(userId, (bonuses.get(userId) || 0) + points);
    });
  });
  return bonuses;
}
function namesForMembers(userIds, members) {
  const players = /* @__PURE__ */ new Set();
  const teams = /* @__PURE__ */ new Set();
  userIds.forEach((uid) => {
    const member = members.find((m) => m.userId === uid);
    member?.team.forEach((pick) => {
      if (pick.pickType === "player" || pick.pickType === "jolly") {
        players.add(pick.playerName);
      } else if (pick.pickType === "team") {
        teams.add(pick.playerName);
      } else if (pick.pickType === "coach" && pick.playerTeam) {
        teams.add(pick.playerTeam);
      }
    });
  });
  return { players: Array.from(players), teams: Array.from(teams) };
}
async function computeScoreWrites(input) {
  const { fanta, members, calendar, bracketRounds } = input;
  const now = input.now ?? Date.now();
  const writes = [];
  const circuitType = fanta.settings.circuitType;
  if (!circuitType) return writes;
  const roleWeights = fanta.settings.scoringWeights || {};
  const teamWeights = fanta.settings.teamScoringWeights || DEFAULT_TEAM_SCORING_WEIGHTS;
  const leagueId = await findLeagueId(circuitType);
  const allNames = namesForMembers(
    members.map((m) => m.userId),
    members
  );
  const [playerStats, teamStats] = await Promise.all([
    getFantasyPlayerStats(allNames.players, circuitType),
    getFantasyTeamStats(allNames.teams, circuitType)
  ]);
  members.forEach((m) => {
    let changed = false;
    const updatedTeam = m.team.map((pick) => {
      const points = computeAutoPoints(pick, playerStats, teamStats, roleWeights, teamWeights);
      if (points === void 0) return pick;
      const rounded = Math.round(points * 100) / 100;
      if (rounded !== pick.points) changed = true;
      return { ...pick, points: rounded };
    });
    if (changed) {
      writes.push({
        type: "update",
        path: ["fantas", fanta.id, "members", m.userId],
        data: { team: updatedTeam }
      });
    }
  });
  const roundPointsFor = async (involvedUserIds, dateRange) => {
    const names = namesForMembers(involvedUserIds, members);
    const [roundPlayerStats, roundTeamStats, lolesportsBonuses] = await Promise.all([
      getFantasyPlayerStats(names.players, circuitType, dateRange),
      getFantasyTeamStats(names.teams, circuitType, dateRange),
      computeLolesportsRoundBonuses(involvedUserIds, dateRange, leagueId, roleWeights, members)
    ]);
    return (userId) => {
      const member = members.find((m) => m.userId === userId);
      if (!member) return 0;
      const autoPoints = member.team.reduce((sum, pick) => {
        const points = computeAutoPoints(
          pick,
          roundPlayerStats,
          roundTeamStats,
          roleWeights,
          teamWeights
        );
        return sum + (points || 0);
      }, 0);
      return autoPoints + (lolesportsBonuses.get(userId) || 0);
    };
  };
  for (const round of calendar) {
    const involvedUserIds = Array.from(
      new Set(
        round.fixtures.flatMap(
          (f) => [f.homeUserId, f.awayUserId].filter((id) => !!id)
        )
      )
    );
    const pointsOf = await roundPointsFor(involvedUserIds, {
      start: round.startDate,
      end: round.endDate
    });
    let roundChanged = false;
    const updatedFixtures = round.fixtures.map((f) => {
      const homePoints = Math.round(pointsOf(f.homeUserId) * 100) / 100;
      const awayPoints = f.awayUserId ? Math.round(pointsOf(f.awayUserId) * 100) / 100 : void 0;
      if (homePoints !== f.homePoints || awayPoints !== f.awayPoints) {
        roundChanged = true;
      }
      return {
        ...f,
        homePoints,
        ...awayPoints !== void 0 ? { awayPoints } : {}
      };
    });
    if (roundChanged) {
      writes.push({
        type: "update",
        path: ["fantas", fanta.id, "calendar", round.id],
        data: { fixtures: updatedFixtures }
      });
    }
  }
  if (bracketRounds.length > 0) {
    const memberSeasonPoints = (userId) => {
      const member = members.find((m) => m.userId === userId);
      if (!member) return 0;
      return member.team.reduce(
        (sum, pick) => sum + totalPickPoints(pick, roleWeights, teamWeights),
        0
      );
    };
    const sortedRounds = [...bracketRounds].sort((a, b) => a.roundIndex - b.roundIndex);
    for (const round of sortedRounds) {
      const involvedUserIds = Array.from(
        new Set(
          round.matches.flatMap(
            (m) => [m.homeUserId, m.awayUserId].filter((id) => !!id)
          )
        )
      );
      const pointsOf = await roundPointsFor(involvedUserIds, {
        start: round.startDate,
        end: round.endDate
      });
      const roundEnded = now >= round.endDate.getTime();
      let roundChanged = false;
      const updatedMatches = round.matches.map((match) => {
        if (match.winnerUserId || !match.homeUserId || !match.awayUserId) {
          return match;
        }
        const homePoints = Math.round(pointsOf(match.homeUserId) * 100) / 100;
        const awayPoints = Math.round(pointsOf(match.awayUserId) * 100) / 100;
        const winnerUserId = !roundEnded ? void 0 : homePoints > awayPoints ? match.homeUserId : awayPoints > homePoints ? match.awayUserId : memberSeasonPoints(match.awayUserId) > memberSeasonPoints(match.homeUserId) ? match.awayUserId : match.homeUserId;
        if (homePoints !== match.homePoints || awayPoints !== match.awayPoints || winnerUserId !== match.winnerUserId) {
          roundChanged = true;
        }
        return {
          ...match,
          homePoints,
          awayPoints,
          ...winnerUserId ? { winnerUserId } : {}
        };
      });
      if (roundChanged) {
        writes.push({
          type: "update",
          path: ["fantas", fanta.id, "bracket", round.id],
          data: { matches: updatedMatches }
        });
      }
      const nextRoundExists = sortedRounds.some((r) => r.roundIndex === round.roundIndex + 1);
      if (!nextRoundExists && isRoundComplete(updatedMatches)) {
        const nextMatches = nextRoundFromWinners(updatedMatches);
        if (nextMatches.length > 0) {
          const lengthDays = fanta.settings.bracketRoundLengthDays || 7;
          const nextStart = round.endDate;
          writes.push({
            type: "create",
            collectionPath: ["fantas", fanta.id, "bracket"],
            data: {
              roundIndex: round.roundIndex + 1,
              matches: nextMatches,
              startDate: nextStart,
              endDate: new Date(nextStart.getTime() + lengthDays * 864e5)
            }
          });
        }
      }
    }
  }
  return writes;
}
async function computeChampionPickWrites(input) {
  const { fantaId, circuitType, round, picks, members } = input;
  if (picks.length === 0) return [];
  const games = await getChampionGamesInRange(circuitType, {
    start: round.startDate,
    end: round.endDate
  });
  if (games.length === 0 && !input.allowEmpty) {
    throw new Error("NO_GAMES");
  }
  const memberTeams = {};
  members.forEach((m) => {
    memberTeams[m.userId] = m.team?.find((t) => t.pickType === "team")?.playerName;
  });
  const results = computeChampionPickResults(picks, games, memberTeams);
  return picks.map((p) => ({
    type: "update",
    path: ["fantas", fantaId, "championPicks", p.id],
    data: { ...results[p.id], revealed: true }
  }));
}

// src/jobs.ts
function revive(value) {
  if (value instanceof import_firestore.Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map((v) => revive(v));
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = revive(v);
    });
    return out;
  }
  return value;
}
async function applyWritesAdmin(db2, writes) {
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db2.batch();
    writes.slice(i, i + 450).forEach((op) => {
      if (op.type === "create") {
        batch.set(db2.collection(op.collectionPath.join("/")).doc(), op.data);
      } else {
        const ref = db2.doc(op.path.join("/"));
        if (op.type === "update") batch.update(ref, op.data);
        else batch.set(ref, op.data);
      }
    });
    await batch.commit();
  }
}
async function loadLeague(db2, fantaDoc) {
  const base = fantaDoc.ref;
  const [members, calendar, bracket] = await Promise.all([
    base.collection("members").get(),
    base.collection("calendar").get(),
    base.collection("bracket").get()
  ]);
  const fanta = { id: fantaDoc.id, ...revive(fantaDoc.data()) };
  return {
    fanta,
    members: members.docs.map((d) => {
      const data = revive(d.data());
      return { ...data, userId: d.id, team: data.team || [] };
    }),
    calendar: calendar.docs.map((d) => ({ id: d.id, ...revive(d.data()) })).sort((a, b) => a.roundNumber - b.roundNumber),
    bracketRounds: bracket.docs.map(
      (d) => ({ id: d.id, ...revive(d.data()) })
    )
  };
}
var PICKBAN_GRACE_MS = 6 * 3600 * 1e3;
var PICKBAN_EMPTY_AFTER_MS = 3 * 86400 * 1e3;
async function settleChampionPicks(db2, league, now, log2) {
  const { fanta, members, calendar } = league;
  const circuitType = fanta.settings.circuitType || "";
  if (!circuitType || PLAYOFF_CIRCUITS.includes(circuitType)) return;
  const base = db2.collection("fantas").doc(fanta.id);
  const [statesSnap, picksSnap] = await Promise.all([
    base.collection("championPickRounds").get(),
    base.collection("championPicks").get()
  ]);
  const closedRounds = new Set(
    statesSnap.docs.filter((d) => d.data().closed === true).map((d) => d.id)
  );
  for (const round of calendar.filter((r) => !r.groupId)) {
    const endedAt = round.endDate.getTime();
    if (now < endedAt + PICKBAN_GRACE_MS) continue;
    const roundPicks = picksSnap.docs.filter((d) => d.data().roundId === round.id);
    const alreadyClosed = closedRounds.has(round.id);
    const needsWork = !alreadyClosed || roundPicks.some((d) => d.data().revealed !== true);
    if (!needsWork) continue;
    const picks = roundPicks.map((d) => ({
      id: d.id,
      userId: d.data().userId || "",
      championName: d.data().championName || "",
      banChampionName: d.data().banChampionName
    }));
    try {
      const writes = await computeChampionPickWrites({
        fantaId: fanta.id,
        circuitType,
        round,
        picks,
        members,
        allowEmpty: now >= endedAt + PICKBAN_EMPTY_AFTER_MS
      });
      await applyWritesAdmin(db2, writes);
      if (!alreadyClosed) {
        await base.collection("championPickRounds").doc(round.id).set({ closed: true });
      }
      log2("Pick/Ban turno chiuso", { fantaId: fanta.id, roundId: round.id, picks: picks.length });
    } catch (error) {
      log2("Pick/Ban turno rimandato", {
        fantaId: fanta.id,
        roundId: round.id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
async function runRecalculation(db2, options = {}) {
  const now = options.now ?? Date.now();
  const log2 = options.log ?? (() => {
  });
  const fantas = await db2.collection("fantas").where("sportType", "==", "lol").get();
  let failed = 0;
  for (const fantaDoc of fantas.docs) {
    try {
      const league = await loadLeague(db2, fantaDoc);
      if (!league.fanta.settings?.circuitType) continue;
      const writes = await computeScoreWrites({ ...league, now });
      await applyWritesAdmin(db2, writes);
      log2("Punteggi ricalcolati", { fantaId: fantaDoc.id, writes: writes.length });
      await settleChampionPicks(db2, league, now, log2);
    } catch (error) {
      failed += 1;
      log2("Ricalcolo lega fallito", {
        fantaId: fantaDoc.id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { leagues: fantas.size, failed };
}
async function closeExpiredAuctions(db2, options = {}) {
  const now = import_firestore.Timestamp.fromMillis(options.now ?? Date.now());
  const log2 = options.log ?? (() => {
  });
  const expired = await db2.collectionGroup("auctions").where("status", "==", "active").where("countdownEndsAt", "<=", now).get();
  let closed = 0;
  for (const auctionDoc of expired.docs) {
    const fantaRef = auctionDoc.ref.parent.parent;
    if (!fantaRef) continue;
    const didClose = await db2.runTransaction(async (tx) => {
      const snap = await tx.get(auctionDoc.ref);
      const data = snap.data();
      if (!snap.exists || !data || data.status !== "active") return false;
      const endsAt = data.countdownEndsAt;
      if (!endsAt || endsAt.toMillis() > now.toMillis()) return false;
      tx.update(auctionDoc.ref, {
        status: "closed",
        closedAt: import_firestore.FieldValue.serverTimestamp(),
        updatedAt: import_firestore.FieldValue.serverTimestamp()
      });
      const winnerId = data.highestBidderId;
      if (winnerId) {
        const price = data.currentPrice || 0;
        const pick = {
          id: auctionDoc.id,
          pickType: data.pickType || "player",
          playerName: data.playerName,
          purchasePrice: price,
          auctionId: auctionDoc.id,
          acquiredAt: now,
          ...data.playerRole ? { playerRole: data.playerRole } : {},
          ...data.playerTeam ? { playerTeam: data.playerTeam } : {}
        };
        tx.update(fantaRef.collection("members").doc(winnerId), {
          team: import_firestore.FieldValue.arrayUnion(pick),
          budgetSpent: import_firestore.FieldValue.increment(price),
          budgetLeft: import_firestore.FieldValue.increment(-price)
        });
        tx.set(fantaRef.collection("history").doc(), {
          playerName: data.playerName,
          ...data.playerRole ? { playerRole: data.playerRole } : {},
          ...data.playerTeam ? { playerTeam: data.playerTeam } : {},
          buyerUserId: winnerId,
          buyerName: data.highestBidderName || "Utente",
          price,
          auctionId: auctionDoc.id,
          purchasedAt: import_firestore.FieldValue.serverTimestamp()
        });
      }
      return true;
    });
    if (didClose) {
      closed += 1;
      log2("Asta chiusa", { fantaId: fantaRef.id, auctionId: auctionDoc.id });
    }
  }
  return closed;
}

// src/index.ts
(0, import_app.initializeApp)();
var db = (0, import_firestore2.getFirestore)();
db.settings({ ignoreUndefinedProperties: true });
var LEAGUEPEDIA_BOT_PASSWORD = (0, import_params.defineSecret)("LEAGUEPEDIA_BOT_PASSWORD");
function installServerTransport() {
  process.env.LEAGUEPEDIA_USERNAME ||= "PureSnake065@fanta-fam";
  process.env.LEAGUEPEDIA_BOT_PASSWORD ||= LEAGUEPEDIA_BOT_PASSWORD.value();
  setApiTransport(async (pathWithQuery) => {
    const url = new URL(pathWithQuery, "http://internal");
    const result = url.pathname === "/api/leaguepedia" ? await proxyLeaguepedia(url.searchParams) : url.pathname === "/api/lolesports" ? await proxyLolesports(url.searchParams) : { status: 404, body: { error: "endpoint sconosciuto" } };
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" }
    });
  });
}
var log = (message, extra) => import_v2.logger.info(message, extra);
var scheduledRecalculation = (0, import_scheduler.onSchedule)(
  {
    // 06:10 e 18:10 ora italiana: dopo le partite della sera e del giorno.
    schedule: "10 6,18 * * *",
    timeZone: "Europe/Rome",
    secrets: [LEAGUEPEDIA_BOT_PASSWORD],
    timeoutSeconds: 540,
    memory: "512MiB",
    retryCount: 0
  },
  async () => {
    installServerTransport();
    const result = await runRecalculation(db, { log });
    import_v2.logger.info("Ricalcolo pianificato completato", result);
  }
);
var closeExpiredAuctionsJob = (0, import_scheduler.onSchedule)(
  {
    schedule: "every 1 minutes",
    timeoutSeconds: 60,
    memory: "256MiB",
    retryCount: 0
  },
  async () => {
    const closed = await closeExpiredAuctions(db, { log });
    if (closed > 0) import_v2.logger.info("Aste scadute chiuse", { closed });
  }
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  closeExpiredAuctionsJob,
  scheduledRecalculation
});
