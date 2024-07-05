import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';
import { DiscordBot } from './DiscordBot';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const bot = new DiscordBot(client);
bot.start();
