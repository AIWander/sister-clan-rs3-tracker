import {
  PLAYER_CACHE_MS,
  PLAYER_FETCH_DELAY_MS,
  ROSTER_CACHE_MS,
  USER_AGENT,
  encodeRsName,
  normalizeRsn,
  parseHiscoresCsv,
  parseMetricsJson,
  parseRosterCsv,
} from "./clan.js";

const ROSTER_URL = "https://secure.runescape.com/m=clan-hiscores/members_lite.ws";
const HISCORE_URL = "https://secure.runescape.com/m=hiscore/index_lite.ws";
const METRICS_URL = "https://apps.runescape.com/runemetrics/profile/profile";

const rosterCache = new Map();
const playerCache = new Map();
const metricsCache = new Map();
let playerQueue = Promise.resolve();

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function enqueuePlayer(fn) {
  const run = playerQueue.then(fn, fn);
  playerQueue = run.then(
    () => delay(PLAYER_FETCH_DELAY_MS),
    () => delay(PLAYER_FETCH_DELAY_MS),
  );
  return run;
}

async function jagexGet(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
    redirect: "manual",
  });
  const bytes = await res.arrayBuffer();
  return { ok: res.ok, status: res.status, bytes };
}

function decode1252(bytes) {
  return new TextDecoder("windows-1252").decode(bytes);
}

export class JagexError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function fetchRoster(clanName, force = false) {
  const key = normalizeRsn(clanName).toLowerCase();
  if (!key) throw new JagexError("Enter a clan name.");
  const hit = rosterCache.get(key);
  if (!force && hit && Date.now() - hit.at < ROSTER_CACHE_MS) return hit.value;
  const { ok, status, bytes } = await jagexGet(
    `${ROSTER_URL}?clanName=${encodeRsName(clanName)}`,
  );
  if ((status >= 300 && status < 400) || !ok) {
    throw new JagexError(
      `Jagex has no clan called “${normalizeRsn(clanName)}”. Check the spelling.`,
      status,
    );
  }
  const text = decode1252(bytes);
  if (/<\s*html/i.test(text)) {
    throw new JagexError(
      `Jagex has no clan called “${normalizeRsn(clanName)}”. Check the spelling.`,
      status,
    );
  }
  const rows = parseRosterCsv(text);
  if (!rows.length) {
    throw new JagexError("That clan roster came back empty.", status);
  }
  rosterCache.set(key, { at: Date.now(), value: rows });
  return rows;
}

export async function fetchHiscores(rsn, force = false) {
  const key = normalizeRsn(rsn).toLowerCase();
  const hit = playerCache.get(key);
  if (!force && hit && Date.now() - hit.at < PLAYER_CACHE_MS) return hit.value;
  return enqueuePlayer(async () => {
    const cached = playerCache.get(key);
    if (!force && cached && Date.now() - cached.at < PLAYER_CACHE_MS) return cached.value;
    const { ok, status, bytes } = await jagexGet(
      `${HISCORE_URL}?player=${encodeRsName(rsn)}`,
    );
    if (status === 404 || !ok) {
      throw new JagexError(
        `No hiscores page for “${normalizeRsn(rsn)}”. They may have never ranked, renamed, or the name is wrong.`,
        status || 404,
      );
    }
    const text = decode1252(bytes);
    if (/<\s*html/i.test(text)) {
      throw new JagexError(
        `No hiscores page for “${normalizeRsn(rsn)}”. They may have never ranked, renamed, or the name is wrong.`,
        404,
      );
    }
    const parsed = parseHiscoresCsv(text);
    playerCache.set(key, { at: Date.now(), value: parsed });
    return parsed;
  });
}

export async function fetchMetrics(rsn, force = false) {
  const key = normalizeRsn(rsn).toLowerCase();
  const hit = metricsCache.get(key);
  if (!force && hit && Date.now() - hit.at < PLAYER_CACHE_MS) return hit.value;
  return enqueuePlayer(async () => {
    const cached = metricsCache.get(key);
    if (!force && cached && Date.now() - cached.at < PLAYER_CACHE_MS) return cached.value;
    try {
      const { ok, bytes } = await jagexGet(
        `${METRICS_URL}?user=${encodeRsName(rsn)}&activities=20`,
      );
      if (!ok) {
        const fallback = { private: true, activities: [] };
        metricsCache.set(key, { at: Date.now(), value: fallback });
        return fallback;
      }
      let json;
      try {
        json = JSON.parse(new TextDecoder("utf-8").decode(bytes));
      } catch {
        json = { error: "PROFILE_PRIVATE" };
      }
      const parsed = parseMetricsJson(json);
      metricsCache.set(key, { at: Date.now(), value: parsed });
      return parsed;
    } catch {
      const fallback = { private: true, activities: [] };
      metricsCache.set(key, { at: Date.now(), value: fallback });
      return fallback;
    }
  });
}
