import { Client, TextChannel, AttachmentBuilder } from 'discord.js';
import pino from 'pino';
import { submitRemixImageJob } from '../../remixImageModule/remixImage';

// Initialize logger
const logger = pino({
  name: 'remixImageTool',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

interface RemixImageArgs {
  prompt: string;
  channelId: string;
  imageUrl?: string; // Optional - can be provided directly if available in context
}

/**
 * Download base64 image and create Discord attachment
 */
async function createAttachmentFromBase64(base64Image: string): Promise<AttachmentBuilder> {
  try {
    // Extract MIME type and base64 data
    const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 image format');
    }
    
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Get file extension from MIME type
    const extension = mimeType.split('/')[1] || 'png';
    const filename = `remixed-image-${Date.now()}.${extension}`;
    
    return new AttachmentBuilder(buffer, { name: filename });
  } catch (error) {
    logger.error({ error }, 'Failed to create attachment from base64 image');
    throw error;
  }
}

/**
 * Handle Remix Image tool
 */
export async function handleRemixImage(
  args: RemixImageArgs,
  client: Client
): Promise<string> {
  logger.info({ args }, '[remix_image] Tool invoked');
  
  try {
    // Get the Discord channel for messages
    const channel = await client.channels.fetch(args.channelId) as TextChannel;
    if (!channel?.isTextBased()) {
      logger.error({ channelId: args.channelId }, 'Invalid channel or not a text channel');
      throw new Error('Invalid channel or not a text channel');
    }
    
    // Send initial message
    const loadingMsg = await channel.send("🎨 Remixing your image...");
    
    // Check if we have an image URL
    if (!args.imageUrl) {
      await loadingMsg.edit("❌ No image URL provided. Please share an image with your request.");
      throw new Error('No image URL provided in the remix_image tool call');
    }
    
    logger.debug({ imageUrl: args.imageUrl }, 'Using provided image URL');
    
    // Call the remix image module
    const remixedImageBase64 = await submitRemixImageJob({
      prompt: args.prompt,
      imageUrl: args.imageUrl
    });
    
    // Create a Discord attachment from the base64 image
    const attachment = await createAttachmentFromBase64(remixedImageBase64);
    
    // Send the remixed image
    await channel.send({
      content: `✨ Here's your remixed image with prompt: "${args.prompt}"`,
      files: [attachment]
    });
    
    // Update the loading message
    await loadingMsg.edit("✅ Image remixed successfully!");
    
    logger.info('Successfully remixed and sent image');
    return `Remixed image with prompt: "${args.prompt}" and posted it in the channel.`;
  } catch (error: unknown) {
    // Log detailed error information
    const errorObj: Record<string, unknown> = { 
      error, 
      args,
      errorType: typeof error 
    };

    // Safely add error properties if they exist
    if (error instanceof Error) {
      errorObj.errorMessage = error.message;
      errorObj.errorStack = error.stack;
      errorObj.errorName = error.name;
    }
    
    logger.error(errorObj, 'Error in remix_image tool');
    
    // Try to notify user of the error if channel is available
    try {
      const channel = await client.channels.fetch(args.channelId) as TextChannel;
      if (channel?.isTextBased()) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await channel.send(`❌ Failed to remix image: ${errorMessage}`);
      }
    } catch (notifyError) {
      logger.error({ notifyError }, 'Failed to send error notification to channel');
    }
    
    throw error;
  }
}