import * as dotenv from 'dotenv';
import { DiscordBot } from './DiscordBot';

dotenv.config();

// Parse optional comma-separated ignore IDs (channels, guilds)
const ignoreChannels = (process.env.IGNORE_DISCORD_CHANNEL_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);  // Remove empty strings

const ignoreGuilds = (process.env.IGNORE_DISCORD_GUILD_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);  // Remove empty strings

const bot = new DiscordBot({
  ignoreChannels,
  ignoreGuilds
});

bot.start();

process.on("SIGINT", async () => {
  console.warn("stopping");
  await bot.stop();
  process.exit(0);
});