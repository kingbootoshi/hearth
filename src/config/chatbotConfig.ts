import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface ChatbotConfig {
  enabled: boolean;
  openRouterModel: string;   // e.g. "openai/gpt-4o"
  botName: string;           // e.g. "quest_boo" after normalization
  personality: string;       // replaces the old questBooPrompt.md content
  discordId: string;         // the bot's Discord user ID
  memoryApiUrl: string;      // memory server URL
  memoryEmbedChannelId: string; // channel to post memory embeds
}

// By default, read config/chatbot.yaml
export function loadChatbotConfig(nameNormalizer: (name: string) => string): ChatbotConfig {
  const configPath = path.join(process.cwd(), 'config', 'chatbot.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`chatbot.yaml config file not found at: ${configPath}`);
  }

  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<ChatbotConfig>;
  // Provide defaults or checks
  const enabled = raw.enabled !== undefined ? raw.enabled : true;
  const rawName = raw.botName || 'questboo';
  const normalizedName = nameNormalizer(rawName);

  const finalConfig: ChatbotConfig = {
    enabled,
    openRouterModel: raw.openRouterModel || 'openai/gpt-4o',
    botName: normalizedName,
    personality: raw.personality || 'This is my personality!',
    discordId: raw.discordId || '',
    memoryApiUrl: raw.memoryApiUrl || 'http://localhost:8000',
    memoryEmbedChannelId: raw.memoryEmbedChannelId || '',
  };

  return finalConfig;
}