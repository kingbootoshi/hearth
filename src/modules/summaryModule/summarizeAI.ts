import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { summaryConfig } from '../../config';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Initialize OpenAI client with OpenRouter configuration
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
});

export async function createMessage(inputText: string): Promise<string> {
  logger.info('Creating summary message with OpenRouter');
  
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: summaryConfig.summarizerSystemPrompt
    },
    {
      role: 'user',
      content: inputText
    }
  ];

  try {
    const result = await openai.chat.completions.create({
      model: summaryConfig.openRouterModel,
      messages,
      temperature: 0,
      max_tokens: 1000
    });

    logger.debug({ response: result }, 'Received response from OpenRouter');

    if (result.choices && result.choices.length > 0) {
      const summary = result.choices[0].message?.content?.trim() || '';
      logger.info('Successfully generated summary');
      return summary;
    }

    throw new Error('No valid response content from OpenRouter');
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate summary with OpenRouter');
    throw error;
  }
}