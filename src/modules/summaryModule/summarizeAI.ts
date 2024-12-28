import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { summaryConfig } from '../../config';
import pino from 'pino';
import { createChatCompletion } from '../../utils/openRouter/client';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
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
    const result = await createChatCompletion({
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