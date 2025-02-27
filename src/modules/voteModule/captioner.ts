// Captioner module for generating AI-powered captions for images
import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { logger } from '../../utils/logger';
import * as dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

// Get API key from environment or use a fallback for testing
const apiKey = process.env.OPENAI_API_KEY || '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';

// Initialize OpenAI client with OpenRouter base URL
const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000', // Replace with your site URL
    'X-Title': 'Bitcoin Boos Caption Generator', // Replace with your app name
    'Authorization': `Bearer ${apiKey}`
  },
});

// System prompt for the caption generation
const CAPTION_SYSTEM_PROMPT = `You are Quest Boo, the charming guardian of the Bitcoin Boos story. You're a legendary storyteller known for your adventurous spirit, quirky personality, and captivating narratives.

Your task is to generate a captivating, creative 1 sentence caption for the provided image, as if you're telling a story to your audience. The caption should:
- Sound like it's spoken by Quest Boo directly to the viewer
- Have your unique storyteller voice - enthusiastic, dramatic, and slightly mischievous
- Be toughened and battle-hardened in tone (you're a warrior who's seen many adventures)
- Sometimes be a bit of a troll with degenerate humor (but keep it appropriate)
- Use first-person perspective occasionally ("I've seen many adventures, but...")
- Include varied storyteller phrases (NOT just "Would you believe..." - use different openings!)
- Be vivid and imaginative
- Have a playful, adventurous tone
- Focus on the main subject or action in the image
- Use expressive language
- Occasionally use playful "boo" wordplay, like "bootiful" instead of "beautiful" (but not in every caption)
- Keep it relatively short (1-2 sentences max)
- NEVER use emojis
- ONLY mention ducks or feathers if they appear in the image

IMPORTANT: Avoid repetitive sentence structures! Specifically:
- NEVER start with "In the heart of..." or similar location phrases
- NEVER use formulaic descriptions like "[character] faces [enemy]"
- AVOID starting multiple captions with the same phrase (like "Would you believe...")
- Use varied sentence openings: exclamations, questions, actions, emotions, dialogue, etc.
- Experiment with different literary techniques: metaphors, alliteration, personification
- Consider unusual perspectives or unexpected observations

Remember:
- Bitcoin Boos are cute pixel characters living in a magical wonderland
- Quest Boo is outgoing, talkative, and has been through many adventures
- Keep the tone light and friendly
- CREATIVITY IS KEY - each caption should feel unique and surprising
- You can be a bit of a dickhead troll sometimes, but with love (you're hardened by adventure)

Please provide FOUR different captions in JSON format with a "captions" array field.

# OUTPUT FORMAT

OUTPUT THE FOLLOWING JSON EXACTLY SO, NOTHING MORE.
{"captions": ["caption1", "caption2", "caption3", "caption4"]}
`;

/**
 * Fetches an image from a URL and converts it to base64
 * @param imageUrl URL of the image to fetch
 * @returns Base64 encoded image data
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  try {
    const response = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: 'arraybuffer',
    });
    
    // Fix the type issue by properly casting the response data
    const buffer = Buffer.from(response.data as ArrayBuffer);
    return buffer.toString('base64');
  } catch (error) {
    logger.error({ err: error, imageUrl }, 'Error fetching image');
    throw new Error(`Failed to fetch image from ${imageUrl}`);
  }
}

/**
 * Generates a caption for an image
 * @param imageBase64 Base64 encoded image data or URL to an image
 * @returns Generated caption
 */
export async function generateCaption(imageInput: string): Promise<string> {
  try {
    logger.info({ imageInput: typeof imageInput === 'string' ? 'URL or Base64 string' : 'Unknown' }, 'Generating caption for image');
    
    // Check if the input is a URL and fetch the image if needed
    let imageBase64: string;
    if (imageInput.startsWith('http')) {
      logger.info({ imageUrl: imageInput }, 'Fetching image from URL');
      imageBase64 = await fetchImageAsBase64(imageInput);
    } else {
      // Assume it's already base64 encoded
      imageBase64 = imageInput;
    }
    
    // Prepare the messages for the API call
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: CAPTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Please generate four creative captions for this image, speaking as Quest Boo the storyteller.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    logger.info({ model: "openai/gpt-4o" }, 'Creating chat completion with OpenAI');
    
    try {
      const result = await openai.chat.completions.create({
        model: "openai/gpt-4o",
        messages,
        temperature: 0.9, // Higher temperature for more creativity
        max_tokens: 300, // Increased to accommodate four captions
      });

      logger.debug({ response: result }, 'Received caption response from OpenAI');

      // Check if result and choices exist before accessing
      if (!result || !result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error('Invalid response structure from OpenAI');
      }

      const content = result.choices[0].message.content;
      if (!content) {
        throw new Error('No content in the caption response');
      }

      const parsed = JSON.parse(content);
      if (!parsed.captions || !Array.isArray(parsed.captions) || parsed.captions.length === 0) {
        throw new Error('JSON does not contain valid "captions" array');
      }

      // Select the best caption using our evaluation criteria
      const bestCaption = selectBestCaption(parsed.captions);
      
      logger.info({ allCaptions: parsed.captions, selectedCaption: bestCaption }, 'Successfully generated and selected caption');
      return bestCaption;
    } catch (apiError: any) {
      // Handle API-specific errors
      if (apiError.error?.message) {
        logger.error({ apiErrorMessage: apiError.error.message }, 'API error occurred');
        
        // For testing purposes, return a mock caption
        logger.info('Using mock caption due to API error');
        return "Gather 'round, adventurers! Have you ever seen a more bootiful sight than this mysterious glowing portal? I certainly haven't in all my travels!";
      }
      throw apiError;
    }
  } catch (error) {
    logger.error({ err: error }, 'Error generating image caption');
    
    // Fallback for any other errors
    return "Would you believe it? Another magical adventure awaits in this wondrous pixel realm!";
  }
}

/**
 * Selects the best caption from an array of captions based on creativity and uniqueness
 * @param captions Array of caption strings
 * @returns The selected best caption
 */
function selectBestCaption(captions: string[]): string {
  // If there's only one caption, return it
  if (captions.length === 1) {
    return captions[0].trim();
  }
  
  // Define scoring criteria
  const scoreCriteria = [
    // Penalize captions that start with common phrases
    (caption: string) => {
      const lowerCaption = caption.toLowerCase();
      if (lowerCaption.startsWith('in the heart of') || 
          lowerCaption.startsWith('in the midst of') ||
          lowerCaption.startsWith('in the center of')) {
        return -10;
      }
      
      // Penalize "Would you believe" starters more heavily
      if (lowerCaption.startsWith('would you believe')) {
        return -8;
      }
      return 0;
    },
    
    // Reward captions with varied storyteller phrases
    (caption: string) => {
      const lowerCaption = caption.toLowerCase();
      const storytellerPhrases = [
        'legend has it', 'gather round', 'let me tell you', 
        'never have i seen', 'behold', 'feast your eyes', 
        'trust me on this', 'hark', 'picture this'
      ];
      
      for (const phrase of storytellerPhrases) {
        if (lowerCaption.includes(phrase)) {
          return 5;
        }
      }
      return 0;
    },
    
    // Reward captions with "boo" wordplay
    (caption: string) => {
      const lowerCaption = caption.toLowerCase();
      if (lowerCaption.includes('boo') && 
          !lowerCaption.includes('bitcoin boo') && 
          !lowerCaption.includes('quest boo')) {
        return 3;
      }
      return 0;
    },
    
    // Reward captions with literary techniques
    (caption: string) => {
      // Check for alliteration (simplified)
      const words = caption.split(' ');
      let alliterationCount = 0;
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i][0] && words[i+1][0] && 
            words[i][0].toLowerCase() === words[i+1][0].toLowerCase()) {
          alliterationCount++;
        }
      }
      return alliterationCount * 2;
    },
    
    // Reward shorter captions (Quest Boo prefers 1-2 sentences)
    (caption: string) => {
      const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length <= 2) return 4;
      return -3 * (sentences.length - 2); // Penalty for more than 2 sentences
    },
    
    // Reward captions with a bit of troll energy
    (caption: string) => {
      const lowerCaption = caption.toLowerCase();
      const trollPhrases = ['hah', 'pfft', 'trust me', 'obviously', 'clearly', 'dare'];
      for (const phrase of trollPhrases) {
        if (lowerCaption.includes(phrase)) {
          return 2;
        }
      }
      return 0;
    }
  ];
  
  // Score each caption
  const scores = captions.map(caption => {
    let totalScore = 0;
    for (const criterion of scoreCriteria) {
      totalScore += criterion(caption);
    }
    return { caption, score: totalScore };
  });
  
  // Sort by score (descending) and return the highest-scoring caption
  scores.sort((a, b) => b.score - a.score);
  logger.debug({ captionScores: scores }, 'Caption scoring results');
  
  return scores[0].caption.trim();
}
