//randomPrompt.ts
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { imageGenConfig } from '../../config';
import pino from 'pino';
import { createChatCompletion } from '../../utils/openRouter/client';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export async function randomPrompt(): Promise<string> {
  logger.info('Generating random image prompt with OpenRouter');

  try {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: imageGenConfig.randomGenSystemPrompt
      }
    ];

    const result = await createChatCompletion({
      model: imageGenConfig.openRouterModel,
      messages,
      temperature: 1,
      max_tokens: 1024,
      response_format: { type: 'json_object' }
    });

    logger.debug({ response: result }, 'Received response from OpenRouter');

    const content = result.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in the bot response');
    }

    const parsed = JSON.parse(content);
    if (!parsed.randomPrompt) {
      throw new Error('JSON does not contain "randomPrompt" field');
    }

    logger.info('Successfully generated random prompt');
    return parsed.randomPrompt.trim();

  } catch (error) {
    logger.error({ err: error }, 'Error generating random prompt');
    throw error;
  }
}