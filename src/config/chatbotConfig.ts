import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export interface ChatbotConfig {
  enabled: boolean;
  openRouterModel: string;
  memoryExtractionModel: string;
  memorySummaryModel: string;
  botName: string;
  personality: string;
  discordId: string;
  memoryEmbedChannelId: string;
  normalizedBotName: string;
  memorySystemPrompt: string;
  summarySystemPrompt: string;
}

/**
 * Utility function to normalize the bot name to forced-lowercase, underscores only.
 * E.g. "Quest Boo" becomes "quest_boo".
 */
function normalizeBotName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Format tools into a readable list for the personality prompt
 */
function formatToolsForPersonality(tools: ChatCompletionTool[]): string {
  // If no tools, return empty string
  if (!tools || tools.length === 0) return '';

  // Format each tool as "name: description"
  return tools
    .map(tool => {
      if (tool.type === 'function') {
        return `${tool.function.name}: ${tool.function.description}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n    ');
}

// Load main chatbot.yaml
export function loadChatbotConfig(): ChatbotConfig {
  const configPath = path.join(process.cwd(), 'config', 'chatbot.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`chatbot.yaml config file not found at: ${configPath}`);
  }

  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<ChatbotConfig>;
  const enabled = raw.enabled !== undefined ? raw.enabled : true;
  const rawName = raw.botName || 'Quest Boo';
  const normalizedName = normalizeBotName(rawName);

  // Load tools first
  const tools = loadChatbotTools();
  const toolsList = formatToolsForPersonality(tools);

  // Get the personality and replace the tools placeholder
  let personality = raw.personality || 'This is my personality!';
  personality = personality.replace('{{TOOLS_HERE}}', toolsList);

  return {
    enabled,
    openRouterModel: raw.openRouterModel || 'deepseek/deepseek-chat',
    memoryExtractionModel: raw.memoryExtractionModel || 'anthropic/claude-3-sonnet',
    memorySummaryModel: raw.memorySummaryModel || 'anthropic/claude-3-haiku',
    botName: rawName,
    normalizedBotName: normalizedName,
    personality,
    discordId: raw.discordId || '',
    memoryEmbedChannelId: raw.memoryEmbedChannelId || '',
    memorySystemPrompt: raw.memorySystemPrompt || '',
    summarySystemPrompt: raw.summarySystemPrompt || '',
  };
}

// Load tools from chatbotTools.yaml
export function loadChatbotTools(): ChatCompletionTool[] {
  const toolsPath = path.join(process.cwd(), 'config', 'chatbotTools.yaml');
  if (!fs.existsSync(toolsPath)) {
    console.warn(`No chatbotTools.yaml found at: ${toolsPath}`);
    return [];
  }
  const raw = yaml.load(fs.readFileSync(toolsPath, 'utf8')) as { tools: ChatCompletionTool[] };
  return raw.tools || [];
}

// Actually load them
const chatbotConfig = loadChatbotConfig();
const chatbotTools = loadChatbotTools();

export {
  chatbotConfig,
  chatbotTools,
  normalizeBotName,
};