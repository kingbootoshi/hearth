//randomPrompt.ts
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { imageGenConfig } from '../../config';
import pino from 'pino';
import { createChatCompletion } from '../../utils/openRouter/client';
import { generateSeedPhrase } from '../../utils/seedGen';

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
    // Generate a random seed phrase
    const randomSeed = await generateSeedPhrase();
    logger.debug({ randomSeed }, 'Generated random seed phrase');

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: imageGenConfig.randomGenSystemPrompt
      },
      {
        role: 'user',
        content: `Generate a random prompt for an image\n RANDOM SEED: ${randomSeed}`
      }
    ];

    const result = await createChatCompletion({
      model: imageGenConfig.openRouterModel,
      messages,
      temperature: 1.5,
      top_p: 0.9,
      frequency_penalty: 0.8,
      presence_penalty: 0.8,
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