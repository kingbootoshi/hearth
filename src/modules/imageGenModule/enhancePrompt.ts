// enhancePrompt.ts
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

export async function enhancePrompt(prompt: string): Promise<string> {
  logger.info('Enhancing image prompt with OpenRouter');
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: imageGenConfig.enhanceSystemPrompt
        },
        {
          role: 'user',
          content: prompt
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

      if (!result.choices[0]?.message?.content) {
        throw new Error('No content in AI response');
      }

      const content = result.choices[0].message.content;
      const parsed = JSON.parse(content);

      if (!parsed.prompt) {
        throw new Error('JSON does not contain "prompt" field');
      }

      logger.info('Successfully enhanced prompt');
      return parsed.prompt.trim();

    } catch (error) {
      logger.error({ attempt: attempt + 1, err: error }, 'Error enhancing prompt');
      attempt++;
      
      if (attempt >= maxRetries) {
        throw new Error('Failed to enhance prompt after maximum retries');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected error in enhancePrompt');
}
