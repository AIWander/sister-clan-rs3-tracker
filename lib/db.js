import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { currentTickStart, previousTickStart, normalizeRsn } from "./clan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "clan.db"));
db.pragma("journal_mode = WAL");
db.exec(`
create table if not exists members (
  rsn text primary key,
  clan_rank text not null default '',
  total_xp integer not null default 0,
  kills integer not null default 0,
  discord_id text,
  missing integer not null default 0,
  last_error text,
  promo_applied_at text,
  updated_at text not null default (datetime('now'))
);
create table if not exists snapshots (
  id integer primary key autoincrement,
  rsn text not null,
  taken_at text not null default (datetime('now')),
  overall_xp integer not null default 0,
  skills_json text not null default '{}'
);
create index if not exists snapshots_rsn_taken_idx on snapshots (rsn, taken_at desc);
create table if not exists caps (
  id integer primary key autoincrement,
  rsn text not null,
  discord_id text,
  tick_start text not null,
  note text,
  created_at text not null default (datetime('now')),
  unique (rsn, tick_start)
);
create table if not exists settings (
  key text primary key,
  value text not null
);
`);

export function getSetting(key) {
  const row = db.prepare("select value from settings where key = ?").get(key);
  return row?.value ?? null;
}

export function setSetting(key, value) {
  db.prepare(
    "insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value",
  ).run(key, String(value));
}

export function upsertRoster(rows) {
  const incoming = new Set(rows.map((r) => r.rsn));
  const insert = db.prepare(`
    insert into members (rsn, clan_rank, total_xp, kills, missing, last_error, updated_at)
    values (@rsn, @clanRank, @totalXp, @kills, 0, null, datetime('now'))
    on conflict(rsn) do update set
      clan_rank = excluded.clan_rank,
      total_xp = excluded.total_xp,
      kills = excluded.kills,
      missing = 0,
      last_error = null,
      updated_at = datetime('now')
  `);
  const tx = db.transaction((list) => {
    for (const r of list) insert.run(r);
    const existing = db.prepare("select rsn from members").all();
    const del = db.prepare("delete from members where rsn = ?");
    for (const e of existing) {
      if (!incoming.has(e.rsn)) del.run(e.rsn);
    }
  });
  tx(rows);
}

export function flagMissing(rsn, error) {
  db.prepare(
    "update members set missing = 1, last_error = ?, updated_at = datetime('now') where rsn = ?",
  ).run(error, rsn);
}

export function insertSnapshot(rsn, overallXp, skillsJson) {
  db.prepare(
    "insert into snapshots (rsn, taken_at, overall_xp, skills_json) values (?, datetime('now'), ?, ?)",
  ).run(rsn, overallXp, skillsJson);
  db.prepare(
    "update members set missing = 0, last_error = null, total_xp = ?, updated_at = datetime('now') where rsn = ?",
  ).run(overallXp, rsn);
}

export function listMembers(rank) {
  if (rank) {
    return db
      .prepare(
        "select * from members where lower(clan_rank) = lower(?) order by total_xp desc, rsn",
      )
      .all(rank);
  }
  return db.prepare("select * from members order by total_xp desc, rsn").all();
}

export function getMember(rsn) {
  return db
    .prepare("select * from members where lower(rsn) = lower(?)")
    .get(normalizeRsn(rsn));
}

export function lastSnapshot(rsn) {
  return db
    .prepare(
      "select * from snapshots where lower(rsn) = lower(?) order by taken_at desc limit 1",
    )
    .get(normalizeRsn(rsn));
}

export function snapshotCount() {
  return db.prepare("select count(*) as n from snapshots").get().n;
}

export function lastSnapshotAt() {
  return db.prepare("select max(taken_at) as t from snapshots").get()?.t ?? null;
}

export function allSnapshots() {
  return db.prepare("select rsn, taken_at, overall_xp, skills_json from snapshots").all();
}

export function linkMember(rsn, discordId) {
  db.prepare("update members set discord_id = null where discord_id = ?").run(discordId);
  const info = db
    .prepare(
      "update members set discord_id = ?, updated_at = datetime('now') where lower(rsn) = lower(?)",
    )
    .run(discordId, normalizeRsn(rsn));
  return info.changes > 0;
}

export function unlinkMember(discordId) {
  db.prepare("update members set discord_id = null where discord_id = ?").run(discordId);
}

export function memberByDiscord(discordId) {
  return db.prepare("select * from members where discord_id = ?").get(discordId);
}

export function reportCap(rsn, discordId, note, tick) {
  const start = currentTickStart(new Date(), tick).toISOString();
  db.prepare(
    `insert into caps (rsn, discord_id, tick_start, note, created_at)
     values (?, ?, ?, ?, datetime('now'))
     on conflict(rsn, tick_start) do update set note = excluded.note, discord_id = excluded.discord_id`,
  ).run(normalizeRsn(rsn), discordId, start, note ?? null);
}

export function clearCap(rsn, tick, which = "current") {
  const now = new Date();
  const start = (which === "last" ? previousTickStart(now, tick) : currentTickStart(now, tick)).toISOString();
  db.prepare("delete from caps where lower(rsn) = lower(?) and tick_start = ?").run(
    normalizeRsn(rsn),
    start,
  );
}

export function listCaps(tick, which = "current") {
  const now = new Date();
  const start = (which === "last" ? previousTickStart(now, tick) : currentTickStart(now, tick)).toISOString();
  return db
    .prepare("select * from caps where tick_start = ? order by created_at")
    .all(start);
}

export function capsThisMonth(rsn) {
  return db
    .prepare(
      "select count(*) as n from caps where lower(rsn) = lower(?) and created_at >= datetime('now', 'start of month')",
    )
    .get(normalizeRsn(rsn)).n;
}

export function markPromoApplied(rsn) {
  db.prepare(
    "update members set promo_applied_at = datetime('now'), updated_at = datetime('now') where lower(rsn) = lower(?)",
  ).run(normalizeRsn(rsn));
}

export function memberRsns() {
  return db.prepare("select rsn from members order by total_xp desc").all().map((r) => r.rsn);
}
