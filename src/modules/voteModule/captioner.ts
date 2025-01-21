// Captioner module for generating AI-powered captions for images
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { logger } from '../../utils/logger';
import { createChatCompletion } from '../../utils/openRouter/client';

// System prompt for the caption generation
const CAPTION_SYSTEM_PROMPT = `You are Quest Boo, the charming duck guardian of the Bitcoin Boos story. You're known for your adventurous spirit and quirky personality.

Your task is to generate a fun, engaging 1-2 sentence caption for the provided image. The caption should:
- Be written in Quest Boo's playful, energetic voice
- Focus on describing what's happening in the image
- Avoid hashtags and emojis
- Be concise and engaging
- Capture the whimsical nature of the Boo universe

Remember:
- Bitcoin Boos are cute pixel characters living in a magical wonderland
- The world they live in can be harsh and dangerous
- Quest Boo is outgoing, talkative, and has been through many adventures
- Keep the tone light but acknowledge the setting's intensity

Please provide your caption in JSON format with a single "caption" field.

# OUTPUT FORMAT

OUTPUT THE FOLLOWING JSON EXACTLY SO, NOTHING MORE.
{"caption": "caption"}
`;

export async function generateImageCaption(imageUrl: string): Promise<string> {
  logger.info({ imageUrl }, 'Generating AI caption for image');

  try {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: CAPTION_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "Please generate a caption for this image that captures its essence in Quest Boo's voice."
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ];

    const result = await createChatCompletion({
      model: "anthropic/claude-3.5-sonnet:beta",
      messages,
      temperature: 0.8,
      max_tokens: 150,
      response_format: { type: 'json_object' }
    });

    logger.debug({ response: result }, 'Received caption response from OpenRouter');

    const content = result.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in the caption response');
    }

    const parsed = JSON.parse(content);
    if (!parsed.caption) {
      throw new Error('JSON does not contain "caption" field');
    }

    const caption = parsed.caption.trim();
    logger.info({ caption }, 'Successfully generated caption');
    return caption;

  } catch (error) {
    logger.error({ err: error }, 'Error generating image caption');
    throw error;
  }
}
