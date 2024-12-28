import { ChatbotConfig, loadChatbotConfig } from './chatbotConfig';
import { ImageGenConfig, loadImageGenConfig } from './imageGenConfig';
import { SummaryConfig, loadSummaryConfig } from './summaryConfig';

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

// Load configs
const chatbotConfig: ChatbotConfig = loadChatbotConfig(normalizeBotName);
const imageGenConfig: ImageGenConfig = loadImageGenConfig();
const summaryConfig: SummaryConfig = loadSummaryConfig();

export {
  chatbotConfig,
  imageGenConfig,
  summaryConfig,
  normalizeBotName,
};