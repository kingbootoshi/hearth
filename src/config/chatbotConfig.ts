import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface ChatbotConfig {
  enabled: boolean;
  openRouterModel: string;   
  botName: string;           // Original non-normalized name
  personality: string;       
  discordId: string;        
  memoryApiUrl: string;      
  memoryEmbedChannelId: string;
  normalizedBotName: string; // Normalized version for agent_id
  memorySystemPrompt: string; // System prompt for memory extraction
  summarySystemPrompt: string; // System prompt for summary condensing
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
  const rawName = raw.botName || 'Quest Boo';
  const normalizedName = nameNormalizer(rawName);

  const finalConfig: ChatbotConfig = {
    enabled,
    openRouterModel: raw.openRouterModel || 'openai/gpt-4o',
    botName: rawName,
    normalizedBotName: normalizedName,
    personality: raw.personality || 'This is my personality!',
    discordId: raw.discordId || '',
    memoryApiUrl: raw.memoryApiUrl || 'http://localhost:8000',
    memoryEmbedChannelId: raw.memoryEmbedChannelId || '',
    memorySystemPrompt: raw.memorySystemPrompt || '',
    summarySystemPrompt: raw.summarySystemPrompt || '',
  };

  return finalConfig;
}