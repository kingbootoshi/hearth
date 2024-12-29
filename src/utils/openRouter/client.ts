// Centralized OpenRouter client configuration and setup
import OpenAI from "openpipe/openai";
import type { 
  ChatCompletionCreateParams,
  ChatCompletionMessageParam 
} from 'openai/resources/chat/completions';
import pino from 'pino';

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Create a singleton OpenRouter client instance
class OpenRouterClient {
  private static instance: OpenAI;

  private constructor() {}

  public static getInstance(): OpenAI {
    if (!OpenRouterClient.instance) {
      logger.info('Initializing OpenRouter client with OpenPipe integration');
      OpenRouterClient.instance = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        // OpenPipe configuration for logging and fine-tuning capabilities
        openpipe: {
          apiKey: process.env.OPENPIPE_API_KEY, // OpenPipe API key for logging
          baseUrl: 'https://api.openpipe.ai/api/v1', // OpenPipe API endpoint
        },
      });
    }
    return OpenRouterClient.instance;
  }
}

// Export a pre-initialized instance
export const openRouter = OpenRouterClient.getInstance();

// Helper function for common chat completion calls
export async function createChatCompletion(params: Omit<ChatCompletionCreateParams, 'stream'>) {
  logger.info({ model: params.model }, 'Creating chat completion with OpenRouter');
  
  try {
    const response = await openRouter.chat.completions.create(params);
    logger.debug({ response }, 'Received response from OpenRouter');
    return response;
  } catch (error) {
    logger.error({ err: error }, 'Failed to create chat completion with OpenRouter');
    throw error;
  }
}

// Re-export the message param type for convenience
export type { ChatCompletionMessageParam }; 