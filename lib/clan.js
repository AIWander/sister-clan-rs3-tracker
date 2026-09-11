export const SKILL_NAMES = [
  "Overall",
  "Attack",
  "Defence",
  "Strength",
  "Constitution",
  "Ranged",
  "Prayer",
  "Magic",
  "Cooking",
  "Woodcutting",
  "Fletching",
  "Fishing",
  "Firemaking",
  "Crafting",
  "Smithing",
  "Mining",
  "Herblore",
  "Agility",
  "Thieving",
  "Slayer",
  "Farming",
  "Runecrafting",
  "Hunter",
  "Construction",
  "Summoning",
  "Dungeoneering",
  "Divination",
  "Invention",
  "Archaeology",
  "Necromancy",
];

export const USER_AGENT = "sister-clan-rs3-tracker/1.0";
export const PLAYER_FETCH_DELAY_MS = 350;
export const ROSTER_CACHE_MS = 15 * 60 * 1000;
export const PLAYER_CACHE_MS = 10 * 60 * 1000;
export const GOLD = 0xc6a15b;

export function normalizeRsn(name) {
  return String(name ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function encodeRsName(name) {
  return encodeURIComponent(normalizeRsn(name)).replace(/%20/g, "+");
}

function trim1(n) {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function compactXp(n) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${sign}${trim1(a / 1_000_000_000)}b`;
  if (a >= 1_000_000) return `${sign}${trim1(a / 1_000_000)}m`;
  if (a >= 10_000) return `${sign}${trim1(a / 1_000)}k`;
  return `${sign}${Math.round(a).toLocaleString("en-US")}`;
}

export function compactXpLabel(n) {
  return `${compactXp(n)} XP`;
}

export function parseRosterCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const out = [];
  for (const raw of cleaned.split("\n")) {
    const line = raw.trim();
    if (!line || /^clanmate\b/i.test(line)) continue;
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const rsn = normalizeRsn(parts[0]);
    if (!rsn) continue;
    out.push({
      rsn,
      clanRank: normalizeRsn(parts[1]),
      totalXp: toInt(parts[2], 0),
      kills: toInt(parts[3], 0),
    });
  }
  return out;
}

export function parseHiscoresCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const skills = [];
  for (let i = 0; i < SKILL_NAMES.length; i += 1) {
    const cols = (lines[i] ?? "").split(",");
    const rank = toInt(cols[0], -1);
    const level = toInt(cols[1], 1);
    const xp = toInt(cols[2], 0);
    skills.push({
      name: SKILL_NAMES[i],
      rank: rank < 0 ? -1 : rank,
      level: level < 0 ? 1 : level,
      xp: xp < 0 ? 0 : xp,
    });
  }
  return { skills, overall: skills[0] };
}

export function parseMetricsJson(json) {
  if (!json || typeof json !== "object") return { private: true, activities: [] };
  if (json.error === "PROFILE_PRIVATE" || json.error === "NOT_A_MEMBER") {
    return { private: true, activities: [] };
  }
  const activities = Array.isArray(json.activities)
    ? json.activities.map((a) => ({
        date: String(a?.date ?? ""),
        details: String(a?.details ?? ""),
        text: String(a?.text ?? ""),
      }))
    : [];
  return {
    private: false,
    name: typeof json.name === "string" ? json.name : undefined,
    totalXp: typeof json.totalxp === "number" ? json.totalxp : undefined,
    totalSkill: typeof json.totalskill === "number" ? json.totalskill : undefined,
    combatLevel: typeof json.combatlevel === "number" ? json.combatlevel : undefined,
    activities,
  };
}

const CITADEL_RE =
  /\b(clan\s+citadel|citadel|capped\b|clan\s+keep|skill\s+plot|clan\s+meeting)\b/i;

export function citadelHint(activities) {
  for (const a of activities ?? []) {
    const blob = `${a.text} ${a.details}`;
    if (CITADEL_RE.test(blob)) return a.text || a.details;
  }
  return null;
}

export function skillsRecord(skills) {
  const rec = {};
  for (const s of skills) rec[s.name] = s.xp;
  return rec;
}

export function totalLevel(skills) {
  return skills.filter((s) => s.name !== "Overall").reduce((n, s) => n + s.level, 0);
}

export function combatLevelFromSkills(skills) {
  const lvl = (name) => skills.find((s) => s.name === name)?.level ?? 1;
  const defenceStyle =
    lvl("Defence") +
    lvl("Constitution") +
    Math.floor(lvl("Prayer") / 2) +
    Math.floor(lvl("Summoning") / 2);
  const melee = lvl("Attack") + lvl("Strength");
  const style = Math.max(
    melee,
    Math.floor(lvl("Magic") * 2),
    Math.floor(lvl("Ranged") * 2),
    Math.floor(lvl("Necromancy") * 2),
  );
  return Math.floor(0.25 * defenceStyle) + Math.floor(0.325 * style);
}

export function currentTickStart(now, cfg) {
  const candidate = new Date(now);
  candidate.setUTCHours(cfg.hour, cfg.minute, 0, 0);
  const back = (candidate.getUTCDay() - cfg.weekday + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() - back);
  if (candidate.getTime() > now.getTime()) candidate.setUTCDate(candidate.getUTCDate() - 7);
  return candidate;
}

export function previousTickStart(now, cfg) {
  const cur = currentTickStart(now, cfg);
  const prev = new Date(cur);
  prev.setUTCDate(prev.getUTCDate() - 7);
  return prev;
}

const PERIOD_MS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export function computeGains(snapshots, skill, period, nowMs) {
  const cutoff = nowMs - PERIOD_MS[period];
  const byRsn = new Map();
  for (const s of snapshots) {
    const list = byRsn.get(s.rsn) ?? [];
    list.push(s);
    byRsn.set(s.rsn, list);
  }
  const rows = [];
  for (const [rsn, list] of byRsn) {
    list.sort((a, b) => a.takenAt - b.takenAt);
    const latest = list[list.length - 1];
    if (!latest) continue;
    let earlier;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].takenAt <= cutoff) {
        earlier = list[i];
        break;
      }
    }
    const xpOf = (p) => (skill === "Overall" ? p.overallXp : (p.skills[skill] ?? 0));
    if (!earlier) {
      rows.push({ rsn, gained: 0 });
      continue;
    }
    rows.push({ rsn, gained: Math.max(0, xpOf(latest) - xpOf(earlier)) });
  }
  rows.sort((a, b) => b.gained - a.gained || a.rsn.localeCompare(b.rsn));
  return rows;
}

function toInt(v, fallback) {
  if (v == null || v === "") return fallback;
  const n = Number.parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
