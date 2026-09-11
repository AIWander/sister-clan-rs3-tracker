import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandData } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("Need DISCORD_TOKEN, CLIENT_ID, and GUILD_ID in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
  console.log(`Registered ${commandData.length} guild commands.`);
} catch (e) {
  console.error("Deploy failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
