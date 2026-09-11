import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleAutocomplete, handleCommand, snapshotPass } from "./commands.js";
import { getSetting } from "./lib/db.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  const clan = getSetting("clan_name") || process.env.CLAN_NAME || "(unset)";
  console.log(`Clan Hall ready as ${c.user.tag} · clan ${clan}`);
  const hours = Number(process.env.SNAPSHOT_HOURS || 6);
  const ms = Math.max(1, hours) * 60 * 60 * 1000;
  setInterval(() => {
    const name = getSetting("clan_name");
    if (!name) return;
    console.log("Scheduled snapshot pass starting");
    snapshotPass()
      .then((r) => console.log(`Scheduled snapshot done · ok ${r.ok} · missing ${r.missing}`))
      .catch((e) => console.error("Scheduled snapshot failed", e instanceof Error ? e.message : e));
  }, ms);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    await handleCommand(interaction);
  } catch (e) {
    console.error("Command failed", e instanceof Error ? e.message : e);
    const payload = { content: "That command failed. Try again in a moment.", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(token);
