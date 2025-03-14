import { Client, TextChannel } from 'discord.js';
import pino from 'pino';
import { submitImageJob } from '../../imageGenModule/imageGen';
import { enhancePrompt } from '../../imageGenModule/enhancePrompt';
import { handleTwitterPost } from './twitterTool';
import { handleRemixImage } from './remixImageTool';
import { supabase } from '../../../utils/supabase/client';

/** Tool argument shapes */
interface RunAgainArgs {
  shouldRun: boolean;
  channelId: string;
}

interface GenerateImageArgs {
  prompt: string;
  channelId: string;
}

interface RemixImageArgs {
  prompt: string;
  channelId: string;
  imageUrl?: string;
}

interface ChatMessage {
  user_id: string;
  username: string;
  content: string;
  timestamp: string;
  is_bot: boolean;
  images?: string[];
}

/** Logger */
const logger = pino({
  name: 'toolHandler',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Store a message in the chat history
 */
async function storeChatMessage(message: ChatMessage) {
  try {
    const { error } = await supabase.from('chat_history').insert([message]);
    if (error) throw error;
    logger.info({ userId: message.user_id, username: message.username, isBot: message.is_bot }, 'Successfully stored message in chat history');
  } catch (error) {
    logger.error({ error }, 'Failed to store message in chat history');
  }
}

/**
 * Handle image generation tool
 * @param args an object containing { prompt, channelId }
 * @param client the Discord.js client to send a message if needed
 * @returns the result string
 */
export async function handleGenerateImage(
  args: GenerateImageArgs,
  client: Client
): Promise<string> {
  logger.info({ args }, '[generate_image] Tool invoked');

  try {
    // Get the Discord channel
    const channel = await client.channels.fetch(args.channelId) as TextChannel;
    if (!channel?.isTextBased()) {
      logger.error({ channelId: args.channelId }, 'Invalid channel or not a text channel');
      throw new Error('Invalid channel or not a text channel');
    }

    // Send initial message
    const loadingMsg = await channel.send("🎨 Painting...");

    // Enhance the prompt
    const enhancedPrompt = await enhancePrompt(args.prompt);
    logger.debug({ enhancedPrompt }, 'Enhanced prompt for image generation');

    // Generate the image
    const imageUrl = await submitImageJob(enhancedPrompt);
    logger.debug({ imageUrl }, 'Generated image URL');

    // Send the image URL in a new message
    await channel.send(imageUrl);

    // Store the image generation as an assistant message in chat history
    await storeChatMessage({
      user_id: 'system',
      username: 'Tool Result',
      content: `🎨 Generated image:\n${imageUrl}`,
      timestamp: new Date().toISOString(),
      is_bot: false,
      images: [imageUrl],
    });

    logger.info('Successfully generated and sent image');
    return `Generated image with prompt: "${args.prompt}" and posted it in the channel. Image link is ${imageUrl}`;
  } catch (error) {
    logger.error({ error }, 'Error in generate_image tool');
    throw error;
  }
}

/**
 * Example "run_again" tool executor
 * @param args an object containing { shouldRun, channelId }
 * @param client the Discord.js client to send a message if needed
 * @returns the result string
 */
export async function handleRunAgain(
  args: RunAgainArgs,
  client: Client
): Promise<string> {
  logger.info({ args }, '[run_again] Tool invoked');

  if (args.shouldRun) {
    // Try to find the given channel
    const channel = client.channels.cache.get(args.channelId);
    if (!channel) {
      logger.warn({ channelId: args.channelId }, 'Channel not found');
      return `Channel with ID ${args.channelId} not found. Can't run again.`;
    }

    // We won't actually send a message here; we'll just return a
    // "result" string. We'll handle re-calling the LLM in the chatbot logic.
    // However, for demonstration, you can optionally post a notice:

    return `Bot will re-run and produce another response in channel #${args.channelId}`;
  } else {
    return `No re-run needed. shouldRun was false.`;
  }
}

/**
 * Main function: choose the right tool and run it
 * @param toolName name of the tool
 * @param argsStr JSON string with function arguments
 * @param client Discord client (needed if a tool wants to do something in discord)
 */
export async function executeToolCall(
  toolName: string,
  argsStr: string,
  client: Client
): Promise<string> {
  try {
    const args = JSON.parse(argsStr);

    switch (toolName) {
      case 'run_again':
        return await handleRunAgain(args, client);
      case 'generate_image':
        return await handleGenerateImage(args, client);
      case 'twitter_post':
        return await handleTwitterPost(args, client);
      case 'remix_image':
        return await handleRemixImage(args, client);
      default:
        return `Unknown tool called: ${toolName}`;
    }
  } catch (err) {
    logger.error({ err, toolName, argsStr }, 'Error executing tool');
    return `Tool execution error for ${toolName}: ${String(err)}`;
  }
}