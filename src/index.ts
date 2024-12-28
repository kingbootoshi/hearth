import * as dotenv from 'dotenv';
import { DiscordBot } from './DiscordBot';

dotenv.config();

const bot = new DiscordBot();
bot.start();

process.on("SIGINT", async () => {
  console.warn("stopping");
  await bot.stop();
  process.exit(0);
});