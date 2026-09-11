# Clan Hall — sister-clan-rs3-tracker

Discord bot for an RS3 clan: live Jagex roster, XP snapshots, citadel cap self-report, promotion shortlist.

**This is not an official Jagex product.** Officers still change ranks in-game by hand. `/promos` only recommends. There is no citadel-cap API — members use `/cap`.

Send her this page. She does not need Grok or any AI after that.

**Repo:** [github.com/AIWander/sister-clan-rs3-tracker](https://github.com/AIWander/sister-clan-rs3-tracker)

**Download ZIP:** [main.zip](https://github.com/AIWander/sister-clan-rs3-tracker/archive/refs/heads/main.zip)

---

## Load it (Windows, no AI)

1. Install **Node.js LTS** from [nodejs.org](https://nodejs.org) (big green button). Restart if it asks.
2. Download the ZIP above. Unzip to `Documents\sister-clan-rs3-tracker`.
3. Create the Discord application (one-time, ~5 minutes) — steps below.
4. Double-click **`setup.bat`**. Paste token / Application ID / server ID when Notepad opens. Save.
5. Double-click **`start.bat`**. Leave that window open.
6. In the clan Discord type:

   `/setup clan:YourExactInGameClanName`

Then try `/roster` and `/stats`. Members `/link rsn:TheirName`.

Closing `start.bat` or sleeping the PC takes the bot **offline**. That is normal.

### One-file installer (optional)

After Node.js is installed, PowerShell:

```powershell
irm https://raw.githubusercontent.com/AIWander/sister-clan-rs3-tracker/main/install.ps1 | iex
```

Or unzip the repo and right-click `install.ps1` → **Run with PowerShell**.

---

## Create the Discord application

1. Open [discord.com/developers/applications](https://discord.com/developers/applications) and log in with **your** Discord.
2. **New Application** → name it `Clan Hall` → Create.
3. Left: **Bot** → Reset Token → **Copy**. That is `DISCORD_TOKEN`. Never paste it in chat.
4. Left: **General Information** → copy **Application ID**. That is `CLIENT_ID`.
5. Left: **OAuth2 → URL Generator**
   - Scopes: `bot` and `applications.commands`
   - Bot permissions: **Send Messages** and **Embed Links**
   - Copy the URL, open it, pick the **clan Discord**, Authorize.
6. Discord → User Settings → Advanced → **Developer Mode** on.
   Right-click the clan server name → **Copy Server ID**. That is `GUILD_ID`.

Privileged Gateway Intents stay **off**. This bot only uses slash commands.

---

## Commands

| Command | Who | What |
|---|---|---|
| `/setup clan:` | Admin | Save clan, pull roster, first snapshot |
| `/link rsn:` | Anyone | Bind Discord id → RSN |
| `/unlink` | Anyone | Clear the link |
| `/stats [rsn]` | Anyone | Combat, total level, total XP, top 8 skills, clan rank |
| `/roster [rank] [page]` | Anyone | Paginated Jagex `members_lite` list |
| `/gains [skill] [period]` | Anyone | Snapshot XP gained (day / week / month) |
| `/cap [note]` | Linked member | Self-report capped this tick |
| `/uncap rsn:` | Officer | Clear a false cap |
| `/cappers [current\|last]` | Anyone | Who `/cap` this tick |
| `/promos` | Officer | Shortlist vs `config.json` thresholds |
| `/promo-applied rsn:` | Officer | Drop them off `/promos` |
| `/refresh` | Officer | Roster + one snapshot pass now |

---

## Tell the clan

Set **RuneMetrics + Adventure Log to public** if you want combat from RuneMetrics and a soft citadel hint on `/stats`. Cap tracking is **self-report only** either way (`/cap`). Private profiles still show hiscores.

Officers: apply ranks in **Clan Settings**, then `/promo-applied rsn:`. The bot cannot change in-game clan ranks.

Edit `config.json` **before** you trust caps or promos:

- `tick_weekday` / `tick_hour` / `tick_minute` — citadel reset in **UTC**. Default Sunday 00:00 is a guess. Set the real tick.
- `min_week_xp` — default 1,000,000
- `min_caps_this_month` — default 2
- `officer_role_names` — Discord role names that count as officers (plus Manage Server)

Jagex stores **lifetime XP only**. Gains = current snapshot minus an earlier snapshot. New members show 0 until a second snapshot exists.

---

## Always-on (optional)

The bot only runs while `start.bat` is open on a PC. For 24/7, run `node index.js` on any cheap always-on box with Node 20+, the same `.env`, and `npm install`. Do not commit `.env`.

SQLite lives in `data/clan.db`.

---

## Mac / Linux

```bash
cp .env.example .env   # then edit
npm install
node deploy-commands.js
node index.js
```

---

## Jagex

Unauthenticated official endpoints only (`members_lite`, `index_lite`, public RuneMetrics). User-Agent `sister-clan-rs3-tracker/1.0`, 350ms between player fetches, roster cached 15 minutes, player stats cached 10 minutes. Never bursts the full roster on `/stats` / `/roster` / `/gains`.
