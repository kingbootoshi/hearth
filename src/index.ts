import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';
import * as dotenv from 'dotenv';
import { DiscordBot } from './DiscordBot';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent  // This intent is required to receive message content
  ]
});

const bot = new DiscordBot();
bot.start();

process.on("SIGINT", async () => {
  console.warn("stopping");
  await bot.stop();
  process.exit(0);
});