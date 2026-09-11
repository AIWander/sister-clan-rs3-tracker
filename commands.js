import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOLD,
  SKILL_NAMES,
  citadelHint,
  combatLevelFromSkills,
  compactXp,
  compactXpLabel,
  computeGains,
  normalizeRsn,
  skillsRecord,
  totalLevel,
} from "./lib/clan.js";
import {
  allSnapshots,
  capsThisMonth,
  clearCap,
  flagMissing,
  getMember,
  getSetting,
  insertSnapshot,
  lastSnapshot,
  lastSnapshotAt,
  linkMember,
  listCaps,
  listMembers,
  markPromoApplied,
  memberByDiscord,
  memberRsns,
  reportCap,
  setSetting,
  snapshotCount,
  unlinkMember,
  upsertRoster,
} from "./lib/db.js";
import { JagexError, fetchHiscores, fetchMetrics, fetchRoster } from "./lib/jagex.js";

const configPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "config.json");

function config() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function tickCfg() {
  const c = config();
  return { weekday: c.tick_weekday, hour: c.tick_hour, minute: c.tick_minute };
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function isOfficer(member) {
  if (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }
  const names = new Set(config().officer_role_names.map((n) => n.toLowerCase()));
  return member.roles.cache.some((r) => names.has(r.name.toLowerCase()));
}

function deny(interaction, who) {
  return interaction.reply({
    content: who === "admin" ? "Need Administrator for that." : "Officers only.",
    ephemeral: true,
  });
}

function errText(e) {
  if (e instanceof JagexError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong talking to Jagex.";
}

function embed() {
  return new EmbedBuilder().setColor(GOLD);
}

async function resolveRsn(interaction, optionName = "rsn") {
  const given = interaction.options.getString(optionName);
  if (given) return normalizeRsn(given);
  const linked = memberByDiscord(interaction.user.id);
  return linked?.rsn ?? null;
}

export async function snapshotPass(onProgress) {
  const names = memberRsns();
  let ok = 0;
  let missing = 0;
  for (let i = 0; i < names.length; i += 1) {
    const rsn = names[i];
    try {
      const hs = await fetchHiscores(rsn, true);
      insertSnapshot(rsn, hs.overall.xp, JSON.stringify(skillsRecord(hs.skills)));
      ok += 1;
    } catch (e) {
      missing += 1;
      flagMissing(rsn, errText(e));
    }
    if (onProgress && (i + 1) % 25 === 0) {
      await onProgress({ i: i + 1, total: names.length, ok, missing });
    }
  }
  setSetting("last_snapshot_at", new Date().toISOString());
  return { ok, missing, total: names.length };
}

export const commandData = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Save clan name, pull roster, take the first snapshot")
    .addStringOption((o) =>
      o.setName("clan").setDescription("In-game clan name").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Bind your Discord account to an RSN")
    .addStringOption((o) => o.setName("rsn").setDescription("RuneScape name").setRequired(true)),
  new SlashCommandBuilder().setName("unlink").setDescription("Remove your RSN link"),
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Combat, total level, XP, top skills, clan rank")
    .addStringOption((o) => o.setName("rsn").setDescription("RuneScape name (default: linked)")),
  new SlashCommandBuilder()
    .setName("roster")
    .setDescription("Paginated clan list from Jagex members_lite")
    .addStringOption((o) => o.setName("rank").setDescription("Filter by clan rank"))
    .addIntegerOption((o) =>
      o.setName("page").setDescription("Page number").setMinValue(1),
    ),
  new SlashCommandBuilder()
    .setName("gains")
    .setDescription("Clan XP gained from snapshots")
    .addStringOption((o) =>
      o.setName("skill").setDescription("Skill (Overall default)").setAutocomplete(true),
    )
    .addStringOption((o) =>
      o
        .setName("period")
        .setDescription("Window")
        .addChoices(
          { name: "day", value: "day" },
          { name: "week", value: "week" },
          { name: "month", value: "month" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("cap")
    .setDescription("Self-report that you capped the citadel this tick")
    .addStringOption((o) => o.setName("note").setDescription("Optional note")),
  new SlashCommandBuilder()
    .setName("uncap")
    .setDescription("Officer: clear a false cap")
    .addStringOption((o) => o.setName("rsn").setDescription("RuneScape name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("cappers")
    .setDescription("Who has /cap this tick")
    .addStringOption((o) =>
      o
        .setName("which")
        .setDescription("Tick")
        .addChoices(
          { name: "current", value: "current" },
          { name: "last", value: "last" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("promos")
    .setDescription("Officer shortlist — does not change in-game ranks"),
  new SlashCommandBuilder()
    .setName("promo-applied")
    .setDescription("Officer: mark an in-game rank as done")
    .addStringOption((o) => o.setName("rsn").setDescription("RuneScape name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Officer: refresh roster + one snapshot pass now"),
].map((c) => c.toJSON());

export async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "skill") return interaction.respond([]);
  const q = String(focused.value ?? "").toLowerCase();
  const matches = SKILL_NAMES.filter((s) => s.toLowerCase().includes(q)).slice(0, 25);
  return interaction.respond(matches.map((s) => ({ name: s, value: s })));
}

export async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case "setup":
      return cmdSetup(interaction);
    case "link":
      return cmdLink(interaction);
    case "unlink":
      return cmdUnlink(interaction);
    case "stats":
      return cmdStats(interaction);
    case "roster":
      return cmdRoster(interaction);
    case "gains":
      return cmdGains(interaction);
    case "cap":
      return cmdCap(interaction);
    case "uncap":
      return cmdUncap(interaction);
    case "cappers":
      return cmdCappers(interaction);
    case "promos":
      return cmdPromos(interaction);
    case "promo-applied":
      return cmdPromoApplied(interaction);
    case "refresh":
      return cmdRefresh(interaction);
    default:
      return interaction.reply({ content: "Unknown command.", ephemeral: true });
  }
}

async function cmdSetup(interaction) {
  if (!isAdmin(interaction.member)) return deny(interaction, "admin");
  const clan = normalizeRsn(interaction.options.getString("clan", true));
  await interaction.deferReply();
  try {
    const roster = await fetchRoster(clan, true);
    upsertRoster(roster);
    setSetting("clan_name", clan);
    await interaction.editReply({
      embeds: [
        embed()
          .setTitle(clan)
          .setDescription(
            `Loaded **${roster.length}** members from Jagex. Starting the first snapshot pass (350ms between players). This does not change in-game ranks.`,
          ),
      ],
    });
    const result = await snapshotPass(async (p) => {
      await interaction.editReply({
        content: `Snapshot ${p.i}/${p.total} · ok ${p.ok} · missing ${p.missing}`,
      });
    });
    await interaction.editReply({
      content: null,
      embeds: [
        embed()
          .setTitle(`${clan} is set`)
          .setDescription(
            `Roster **${roster.length}**. Snapshots **${result.ok}**. Missing hiscores **${result.missing}**.\nRun \`/stats\` any time. \`/gains\` needs a second snapshot (or wait for the ${process.env.SNAPSHOT_HOURS || 6}h schedule).`,
          ),
      ],
    });
  } catch (e) {
    await interaction.editReply({ content: errText(e) });
  }
}

async function cmdLink(interaction) {
  const rsn = normalizeRsn(interaction.options.getString("rsn", true));
  const ok = linkMember(rsn, interaction.user.id);
  if (!ok) {
    return interaction.reply({
      content: `${rsn} is not on the current clan roster. Ask an officer to /refresh first.`,
      ephemeral: true,
    });
  }
  return interaction.reply({ content: `Linked to **${rsn}**.`, ephemeral: true });
}

async function cmdUnlink(interaction) {
  unlinkMember(interaction.user.id);
  return interaction.reply({ content: "Unlinked.", ephemeral: true });
}

async function cmdStats(interaction) {
  const rsn = await resolveRsn(interaction);
  if (!rsn) {
    return interaction.reply({
      content: "Pass an RSN or `/link` your account first.",
      ephemeral: true,
    });
  }
  await interaction.deferReply();
  try {
    const [hs, metrics] = await Promise.all([fetchHiscores(rsn), fetchMetrics(rsn)]);
    const member = getMember(rsn);
    const snap = lastSnapshot(rsn);
    const combat = metrics.combatLevel ?? combatLevelFromSkills(hs.skills);
    const top = [...hs.skills]
      .filter((s) => s.name !== "Overall")
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 8)
      .map((s) => `**${s.name}** ${s.level} · ${compactXp(s.xp)}`)
      .join("\n");
    const hint = metrics.private ? null : citadelHint(metrics.activities);
    const e = embed()
      .setTitle(metrics.name || rsn)
      .addFields(
        { name: "Combat", value: String(combat), inline: true },
        {
          name: "Total level",
          value: String(metrics.totalSkill ?? totalLevel(hs.skills)),
          inline: true,
        },
        { name: "Total XP", value: compactXpLabel(hs.overall.xp), inline: true },
        { name: "Clan rank", value: member?.clan_rank ?? "Not on roster", inline: true },
        {
          name: "Last snapshot",
          value: snap?.taken_at ?? "no snapshot yet — run /setup",
          inline: true,
        },
        { name: "Top skills", value: top || "\u2014" },
      );
    if (metrics.private) {
      e.setFooter({
        text: "RuneMetrics is private — showing hiscores only. Set the profile + Adventure Log to public for citadel hints.",
      });
    } else if (hint) {
      e.setFooter({
        text: `Public log looks like a citadel visit (“${hint}”). Still self-report with /cap — there is no cap API.`,
      });
    }
    await interaction.editReply({ embeds: [e] });
  } catch (e) {
    await interaction.editReply({ content: errText(e) });
  }
}

async function cmdRoster(interaction) {
  const clan = getSetting("clan_name");
  if (!clan) {
    return interaction.reply({ content: "no snapshot yet — run /setup", ephemeral: true });
  }
  await interaction.deferReply();
  try {
    const rank = interaction.options.getString("rank");
    const page = interaction.options.getInteger("page") ?? 1;
    const roster = await fetchRoster(clan);
    upsertRoster(roster);
    let rows = roster;
    if (rank) {
      rows = rows.filter((r) => r.clanRank.toLowerCase() === rank.toLowerCase());
    }
    const per = 20;
    const pages = Math.max(1, Math.ceil(rows.length / per));
    const p = Math.min(page, pages);
    const slice = rows.slice((p - 1) * per, p * per);
    const body =
      slice
        .map(
          (r, i) =>
            `\`${String((p - 1) * per + i + 1).padStart(3, " ")}\` **${r.rsn}** · ${r.clanRank} · ${compactXp(r.totalXp)}`,
        )
        .join("\n") || "Nobody on this page.";
    await interaction.editReply({
      embeds: [
        embed()
          .setTitle(`${clan} roster`)
          .setDescription(body)
          .setFooter({ text: `Page ${p}/${pages} · ${rows.length} shown · cached 15 min` }),
      ],
    });
  } catch (e) {
    await interaction.editReply({ content: errText(e) });
  }
}

async function cmdGains(interaction) {
  if (snapshotCount() === 0) {
    return interaction.reply({ content: "no snapshot yet — run /setup", ephemeral: true });
  }
  const rawSkill = interaction.options.getString("skill") || "Overall";
  const skill = SKILL_NAMES.includes(rawSkill) ? rawSkill : "Overall";
  const period = interaction.options.getString("period") || "week";
  const snaps = allSnapshots().map((s) => ({
    rsn: s.rsn,
    takenAt: Date.parse(String(s.taken_at).replace(" ", "T") + "Z") || Date.parse(s.taken_at),
    overallXp: s.overall_xp,
    skills: JSON.parse(s.skills_json || "{}"),
  }));
  const rows = computeGains(snaps, skill, period, Date.now()).slice(0, 15);
  const body =
    rows
      .map((r, i) => `\`${String(i + 1).padStart(2, " ")}\` **${r.rsn}** · ${compactXpLabel(r.gained)}`)
      .join("\n") || "No snapshot rows.";
  return interaction.reply({
    embeds: [
      embed()
        .setTitle(`${skill} · ${period}`)
        .setDescription(body)
        .setFooter({
          text:
            snapshotCount() < 2
              ? "Need a second snapshot before gains are more than zero."
              : `Lifetime XP diffs only · last snapshot ${lastSnapshotAt() ?? "n/a"}`,
        }),
    ],
  });
}

async function cmdCap(interaction) {
  const linked = memberByDiscord(interaction.user.id);
  if (!linked) {
    return interaction.reply({
      content: "Link an RSN with `/link` first.",
      ephemeral: true,
    });
  }
  const note = interaction.options.getString("note");
  reportCap(linked.rsn, interaction.user.id, note, tickCfg());
  return interaction.reply({
    content: `Recorded **${linked.rsn}** as capped this tick.`,
    ephemeral: true,
  });
}

async function cmdUncap(interaction) {
  if (!isOfficer(interaction.member)) return deny(interaction, "officer");
  const rsn = normalizeRsn(interaction.options.getString("rsn", true));
  clearCap(rsn, tickCfg(), "current");
  return interaction.reply({ content: `Cleared cap for **${rsn}** this tick.`, ephemeral: true });
}

async function cmdCappers(interaction) {
  const which = interaction.options.getString("which") || "current";
  const rows = listCaps(tickCfg(), which);
  const body =
    rows.map((r) => `**${r.rsn}**${r.note ? ` — ${r.note}` : ""}`).join("\n") ||
    "Nobody has /cap this tick.";
  return interaction.reply({
    embeds: [
      embed()
        .setTitle(`Cappers · ${which} tick`)
        .setDescription(body)
        .setFooter({
          text: "Self-report only. There is no official citadel-cap API. Set the real tick in config.json.",
        }),
    ],
  });
}

async function cmdPromos(interaction) {
  if (!isOfficer(interaction.member)) return deny(interaction, "officer");
  if (snapshotCount() === 0) {
    return interaction.reply({ content: "no snapshot yet — run /setup", ephemeral: true });
  }
  const cfg = config();
  const snaps = allSnapshots().map((s) => ({
    rsn: s.rsn,
    takenAt: Date.parse(String(s.taken_at).replace(" ", "T") + "Z") || Date.parse(s.taken_at),
    overallXp: s.overall_xp,
    skills: JSON.parse(s.skills_json || "{}"),
  }));
  const week = computeGains(snaps, "Overall", "week", Date.now());
  const lines = [];
  for (const m of listMembers()) {
    if (m.promo_applied_at) continue;
    const gained = week.find((g) => g.rsn === m.rsn)?.gained ?? 0;
    const caps = capsThisMonth(m.rsn);
    if (gained >= cfg.min_week_xp && caps >= cfg.min_caps_this_month) {
      lines.push(
        `**${m.rsn}** · ${m.clan_rank} · ${compactXpLabel(gained)} this week · ${caps} caps`,
      );
    }
  }
  return interaction.reply({
    embeds: [
      embed()
        .setTitle("Promotion shortlist")
        .setDescription(lines.join("\n") || "Nobody currently meets both thresholds.")
        .setFooter({
          text: `Need ${compactXpLabel(cfg.min_week_xp)} / week and ${cfg.min_caps_this_month} caps this month. This does not change in-game ranks — apply in Clan Settings, then /promo-applied.`,
        }),
    ],
    ephemeral: true,
  });
}

async function cmdPromoApplied(interaction) {
  if (!isOfficer(interaction.member)) return deny(interaction, "officer");
  const rsn = normalizeRsn(interaction.options.getString("rsn", true));
  markPromoApplied(rsn);
  return interaction.reply({
    content: `Marked **${rsn}** as applied. They drop off /promos. Rank them in-game yourself.`,
    ephemeral: true,
  });
}

async function cmdRefresh(interaction) {
  if (!isOfficer(interaction.member)) return deny(interaction, "officer");
  const clan = getSetting("clan_name") || process.env.CLAN_NAME;
  if (!clan) {
    return interaction.reply({ content: "no snapshot yet — run /setup", ephemeral: true });
  }
  await interaction.deferReply();
  try {
    const roster = await fetchRoster(clan, true);
    upsertRoster(roster);
    await interaction.editReply({
      content: `Roster ${roster.length}. Snapshot pass running (350ms between players)…`,
    });
    const result = await snapshotPass(async (p) => {
      await interaction.editReply({
        content: `Snapshot ${p.i}/${p.total} · ok ${p.ok} · missing ${p.missing}`,
      });
    });
    await interaction.editReply({
      content: `Roster **${roster.length}**. Snapshots **${result.ok}**. Missing **${result.missing}**.`,
    });
  } catch (e) {
    await interaction.editReply({ content: errText(e) });
  }
}
