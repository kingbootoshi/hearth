import { Client, Message, TextChannel, Attachment } from 'discord.js';
import pino from 'pino';
import type { ChatCompletionMessageParam, ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText } from 'openai/resources/chat/completions';
import { chatbotConfig } from '../../config';
import { ChatMemoryManager } from './memory/chatMemoryManager';
import { queryAllMemories } from './memory/memoryProcessor';
import { Logger } from './logger';
import { supabase } from '../../utils/supabase/client';
import { openRouter, createChatCompletion } from '../../utils/openRouter/client';
import fetch from 'node-fetch';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Interface for our database message type
interface ChatMessage {
  user_id: string;
  username: string;
  content: string;
  timestamp: string;
  is_bot: boolean;
  images?: string[];
}

// Function to convert image URL to base64
async function getImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.error({ url, status: response.status }, 'Failed to fetch image');
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      logger.error({ url, contentType }, 'Invalid content type');
      return null;
    }

    const buffer = await response.buffer();
    const base64 = buffer.toString('base64');
    const base64Url = `data:${contentType};base64,${base64}`;
    
    // Log only the first 20 characters of the base64 string
    logger.info({
      url,
      base64Preview: base64Url.substring(0, 20) + '...'
    }, 'Converted image to base64');

    return base64Url;
  } catch (error) {
    logger.error({ url, error }, 'Error converting image to base64');
    return null;
  }
}

// Add this function to extract images from recent messages
async function getRecentImagesFromChannel(channel: TextChannel, messageLimit: number = 5): Promise<string[]> {
  const messages = await channel.messages.fetch({ limit: messageLimit });
  const imageUrls: string[] = [];
  
  messages.forEach(msg => {
    // Get images from attachments
    msg.attachments.forEach(attachment => {
      if (attachment.contentType?.startsWith('image/')) {
        imageUrls.push(attachment.url);
      }
    });
    
    // Get images from embeds
    msg.embeds.forEach(embed => {
      if (embed.image) {
        imageUrls.push(embed.image.url);
      }
    });
  });

  // Limit to 10 most recent images
  return imageUrls.slice(0, 10);
}

// Add this function to format chat history into OpenAI messages with images
async function formatChatHistoryToMessages(messages: ChatMessage[]): Promise<ChatCompletionMessageParam[]> {
  // Convert chat history entries to OpenAI message format
  const formattedMessages = await Promise.all(messages.map(async msg => {
    const content: ChatCompletionContentPart[] = [{
      type: 'text',
      text: msg.content
    } as ChatCompletionContentPartText];
    
    // If the message has images stored
    if (msg.images && Array.isArray(msg.images)) {
      // Convert each image URL to base64
      const base64Promises = msg.images.map(imageUrl => getImageAsBase64(imageUrl));
      const base64Results = await Promise.all(base64Promises);
      
      // Add only successfully converted images
      base64Results.forEach(base64Url => {
        if (base64Url) {
          content.push({
            type: 'image_url',
            image_url: { url: base64Url }
          } as ChatCompletionContentPartImage);
        }
      });
    }
    
    return {
      role: msg.is_bot ? 'assistant' : 'user',
      content: content.length === 1 ? (content[0] as ChatCompletionContentPartText).text : content
    } as ChatCompletionMessageParam;
  }));

  return formattedMessages;
}

export class ChatbotModule {
  private client: Client;
  private botUserId: string | undefined;
  private logger: Logger;
  private chatMemoryManager: ChatMemoryManager;

  constructor(client: Client) {
    logger.info('Constructing ChatbotModule (separate file).');
    this.client = client;
    this.logger = new Logger();
    this.chatMemoryManager = new ChatMemoryManager(client, 30);
  }

  public async start(readyClient: any): Promise<void> {
    logger.info('Starting separate ChatbotModule');
    this.botUserId = chatbotConfig.discordId || readyClient.user.id;
    logger.info({ botUserId: this.botUserId }, 'Bot user ID set');
  }

  public async stop(): Promise<void> {
    logger.info('Stopping separate ChatbotModule');
  }

  public async handleMessage(message: Message): Promise<void> {
    if (!chatbotConfig.enabled) {
      return;
    }

    // Basic logging
    logger.info({ 
      userId: message.author.id, 
      content: message.content 
    }, 'handleMessage called in ChatbotModule');

    if (message.author.bot) {
      logger.debug('Message from bot, ignoring');
      return;
    }

    let isReplyToBot = false;
    if (message.reference?.messageId) {
      const refMsg = await message.channel.messages.fetch(message.reference.messageId);
      if (refMsg.author.id === this.botUserId) {
        isReplyToBot = true;
      }
    }

    const botNameLower = chatbotConfig.botName.toLowerCase();
    const isMentioned = message.mentions.users.has(this.botUserId || '')
      || message.content.toLowerCase().includes(botNameLower);

    const randomTrigger = Math.random() < 0.005;

    if (!(isMentioned || isReplyToBot || randomTrigger)) {
      return;
    }

    // Get recent images from the channel
    const recentImages = await getRecentImagesFromChannel(message.channel as TextChannel);
    logger.info({ 
      imageCount: recentImages.length,
      imageUrls: recentImages
    }, 'Processing images from recent messages');

    // Store user message with any attached images
    const userMessageImages = Array.from(message.attachments.values())
      .filter(att => att.contentType?.startsWith('image/'))
      .map(att => att.url);
    
    if (userMessageImages.length > 0) {
      logger.info({
        imageCount: userMessageImages.length,
        imageUrls: userMessageImages
      }, 'Found images in current message');
    }

    const messageToStore: ChatMessage = {
      user_id: message.author.id,
      username: message.author.username,
      content: message.content,
      timestamp: new Date().toISOString(),
      is_bot: false,
      images: userMessageImages
    };

    await this.chatMemoryManager.addMessage(messageToStore);

    // Build up context
    await message.channel.sendTyping();
    const memoryContext = await queryAllMemories(message.content, message.author.id);

    // Get chat history from Supabase, excluding the current message
    const { data: chatHistory } = await supabase
      .from('chat_history')
      .select('*')
      .lt('timestamp', new Date().toISOString())
      .order('timestamp', { ascending: true });

    // Format chat history into messages array with images
    const historyMessages = await formatChatHistoryToMessages(chatHistory || []);

    const summaries = await this.chatMemoryManager.formatRecentSummariesForPrompt();
    const allMessages = await this.chatMemoryManager.getAllMessages();
    const chatHistoryText = allMessages.length > 0
      ? "\nChat History in Memory:\n" + allMessages.map(msg =>
        `[${new Date(msg.timestamp).toLocaleString('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: true,
          timeZone: 'UTC'
        })} UTC] ${msg.username}: ${msg.content}`
      ).join('\n')
      : '';

    const channelName = message.channel.isDMBased()
      ? 'Direct Message'
      : `#${(message.channel as TextChannel).name}`;

    const addContext = `Channel: ${channelName}${chatHistoryText}`;

    // Prepare final prompt
    let finalPrompt = chatbotConfig.personality;
    finalPrompt = finalPrompt.replace('{{SUMMARIES_HERE}}', summaries);
    finalPrompt = finalPrompt.replace('{{MEMORIES_HERE}}', memoryContext);
    finalPrompt = finalPrompt.replace('{{ADDITIONAL_CONTEXT_HERE}}', addContext);

    // Construct messages array with system prompt first, chat history in middle,
    // and current user message last (now including images)
    const userContent: ChatCompletionContentPart[] = [{
      type: 'text',
      text: `${message.member?.displayName || message.author.username}: ${message.content}`
    } as ChatCompletionContentPartText];

    // Add recent images to the current message
    if (recentImages.length > 0) {
      // Convert each image URL to base64
      const base64Promises = recentImages.map(imageUrl => getImageAsBase64(imageUrl));
      const base64Results = await Promise.all(base64Promises);
      
      // Add only successfully converted images
      base64Results.forEach(base64Url => {
        if (base64Url) {
          userContent.push({
            type: 'image_url',
            image_url: { url: base64Url }
          } as ChatCompletionContentPartImage);
        }
      });
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: finalPrompt },
      ...historyMessages,
      { role: 'user', content: userContent }
    ];

    const result = await createChatCompletion({
      model: chatbotConfig.openRouterModel,
      messages,
      max_tokens: 1000,
      temperature: 0.8
    });

    this.logger.logApiCall(finalPrompt, messages, result);

    let botReply = '';
    let sentMessage: Message;
    if (result.choices && result.choices.length > 0) {
      botReply = result.choices[0].message?.content || '';
    } else {
      botReply = "no answer from me right now...";
    }

    // Send the reply and store the sent message
    if (isReplyToBot) {
      sentMessage = await message.reply(botReply);
    } else {
      sentMessage = await message.channel.send(botReply);
    }

    // When storing bot's reply, get images from the sent message
    const botMessageImages = Array.from(sentMessage.attachments.values())
      .filter(att => att.contentType?.startsWith('image/'))
      .map(att => att.url);

    await this.chatMemoryManager.addMessage({
      user_id: 'bot',
      username: chatbotConfig.botName,
      content: botReply,
      timestamp: new Date().toISOString(),
      is_bot: true,
      images: botMessageImages
    });

    // Log the completion of image processing
    logger.info({
      recentImagesCount: recentImages.length,
      userImagesCount: userMessageImages.length,
      botImagesCount: botMessageImages.length,
      savedMessages: {
        user: messageToStore,
        bot: {
          content: botReply,
          images: botMessageImages
        }
      }
    }, 'Completed processing all images in conversation');
  }
}