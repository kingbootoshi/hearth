import { Client, Message, TextChannel } from 'discord.js';
import pino from 'pino';
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletion,
} from 'openai/resources/chat/completions';
import { chatbotConfig, chatbotTools } from '../../config/chatbotConfig'; // [ADDED FOR TOOLS]
import { ChatMemoryManager } from './database/chatMemoryManager';
import { queryAllMemories } from './memory/memoryProcessor';
import { Logger } from './logger';
import { supabase } from '../../utils/supabase/client';
import { openRouter, createChatCompletion } from '../../utils/openRouter/client';
import fetch from 'node-fetch';
import { executeToolCall } from './tools/toolHandler'; // [ADDED FOR TOOLS]
import { ChatMessage } from './types/chatbot';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

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
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    logger.error({ url, error }, 'Error converting image to base64');
    return null;
  }
}

// Helper function to check if a URL is an image
function isImageUrl(url: string): boolean {
  // Common image extensions
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
  const urlLower = url.toLowerCase();
  return imageExtensions.some(ext => urlLower.endsWith(ext));
}

// Helper function to extract URLs from text
function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  return text.match(urlRegex) || [];
}

// Helper function to format message with links
function formatMessageWithLinks(msg: Message): string {
  const timeStamp = new Date(msg.createdTimestamp).toLocaleString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true,
    timeZone: 'UTC',
  });

  let content = msg.content;
  const links = extractUrls(msg.content);
  
  // Add links from embeds
  msg.embeds.forEach(embed => {
    if (embed.url) links.push(embed.url);
  });

  // If there are links, append them to the message
  if (links.length > 0) {
    content += ` (Links: ${links.join(', ')})`;
  }

  return `[${timeStamp} UTC] ${msg.author.username}: ${content}`;
}

async function getRecentImagesFromChannel(
  channel: TextChannel,
  messageLimit: number = 5
): Promise<string[]> {
  if (!channel.guild || !(channel instanceof TextChannel)) {
    logger.debug("Not a valid text channel for images, skipping.");
    return [];
  }
  const me = channel.guild.members.me;
  if (!me) {
    logger.debug("No valid guild member for me, skipping images.");
    return [];
  }
  if (!channel.permissionsFor(me)?.has(['ViewChannel', 'ReadMessageHistory'])) {
    logger.debug("No permission to read message history, skipping images.");
    return [];
  }

  const messages = await channel.messages.fetch({ limit: messageLimit });
  const imageUrls: string[] = [];

  messages.forEach((msg) => {
    // Get images from attachments
    msg.attachments.forEach((attachment) => {
      if (attachment.contentType?.startsWith('image/')) {
        imageUrls.push(attachment.url);
      }
    });

    // Get images from embeds
    msg.embeds.forEach((embed) => {
      // Check main image
      if (embed.image) {
        imageUrls.push(embed.image.url);
      }
      // Check thumbnail
      if (embed.thumbnail) {
        imageUrls.push(embed.thumbnail.url);
      }
      // Check author icon if it's an image
      if (embed.author?.iconURL) {
        imageUrls.push(embed.author.iconURL);
      }
      // Check footer icon if it's an image
      if (embed.footer?.iconURL) {
        imageUrls.push(embed.footer.iconURL);
      }
    });

    // Get images from message content (URLs)
    const contentUrls = extractUrls(msg.content);
    contentUrls.forEach(url => {
      if (isImageUrl(url)) {
        imageUrls.push(url);
      }
    });
  });

  // Remove duplicates and limit to 10 images
  return [...new Set(imageUrls)].slice(0, 10);
}

async function formatChatHistoryToMessages(
  messages: ChatMessage[]
): Promise<ChatCompletionMessageParam[]> {
  return messages.map((msg) => ({
    role: msg.is_bot ? 'assistant' as const : 'user' as const,
    content: msg.is_bot ? msg.content : `${msg.username}: ${msg.content}`
  }));
}

// Create an interface to accept ignore options
interface ChatbotModuleConfig {
  ignoreChannels: string[];
  ignoreGuilds: string[];
}

export class ChatbotModule {
  private client: Client;
  private botUserId: string | undefined;
  private logger: Logger;
  private chatMemoryManager: ChatMemoryManager;
  // Store the ignore arrays
  private ignoreChannels: string[];
  private ignoreGuilds: string[];

  constructor(client: Client, config?: ChatbotModuleConfig) {
    logger.info('Constructing ChatbotModule (separate file).');
    this.client = client;
    this.logger = new Logger();
    this.chatMemoryManager = new ChatMemoryManager(client, 30);

    // Pull ignore arrays from config
    this.ignoreChannels = config?.ignoreChannels ?? [];
    this.ignoreGuilds = config?.ignoreGuilds ?? [];
  }

  /**
   * Checks if the bot can view, read message history, and send messages in the given channel.
   */
  private canAccessChannel(channel: TextChannel): boolean {
    // Single-line comment: Grab the "me" member from the guild.
    const me = channel.guild?.members.me; 
    if (!me) {
      // Single-line comment: Return false if we don't have a guild member object.
      return false;
    }

    // Single-line comment: Safely get the permissions for a valid member.
    const permissions = channel.permissionsFor(me);
    if (!permissions) {
      return false;
    }

    const canView = permissions.has('ViewChannel');
    const canReadHistory = permissions.has('ReadMessageHistory');
    const canSend = permissions.has('SendMessages');
    return canView && canReadHistory && canSend;
  }

  // Helper function to get recent chat history
  private async getRecentChatHistory(channel: TextChannel, limit: number = 10): Promise<string> {
    if (!this.canAccessChannel(channel)) {
      logger.debug("Cannot read channel history, returning empty context.");
      return '';
    }

    const messages = await channel.messages.fetch({ limit });
    return messages.reverse().map(msg => {
      let content = msg.content;
      const links: string[] = [];

      // Get links from embeds
      msg.embeds.forEach(embed => {
        if (embed.url) links.push(embed.url);
        if (embed.image?.url) links.push(embed.image.url);
        if (embed.thumbnail?.url) links.push(embed.thumbnail.url);
      });

      // Get links from attachments
      msg.attachments.forEach(attachment => {
        links.push(attachment.url);
      });

      // Get links from content
      const contentLinks = extractUrls(msg.content);
      links.push(...contentLinks);

      // Add unique links to the message
      const uniqueLinks = [...new Set(links)];
      if (uniqueLinks.length > 0) {
        content += ` (Links: ${uniqueLinks.join(', ')})`;
      }

      const timeStamp = new Date(msg.createdTimestamp).toLocaleString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true,
        timeZone: 'UTC',
      });

      return `[${timeStamp} UTC] ${msg.author.username}: ${content}`;
    }).join('\n');
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

    if (!message.guild || !(message.channel instanceof TextChannel)) {
      logger.debug("Not a valid guild channel, skipping.");
      return;
    }
    if (!this.canAccessChannel(message.channel)) {
      logger.debug("Bot lacks permission to read/send in this channel, skipping.");
      return;
    }

    // Check if we should ignore this channel/guild if the bot is NOT mentioned
    const currentChannelId = message.channel.id;
    const currentGuildId = message.guild?.id;
    const isMentioningBot = message.mentions.users.has(this.botUserId || '');

    if (
      (this.ignoreChannels.includes(currentChannelId) ||
       (currentGuildId && this.ignoreGuilds.includes(currentGuildId))) &&
      !isMentioningBot
    ) {
      return;
    }

    logger.info(
      {
        userId: message.author.id,
        content: message.content,
      },
      'handleMessage called in ChatbotModule'
    );

    if (message.author.bot) {
      logger.debug('Message from bot, ignoring');
      return;
    }

    let isReplyToBot = false;
    if (message.reference?.messageId) {
      const refMsg = await message.channel.messages.fetch(
        message.reference.messageId
      );
      if (refMsg.author.id === this.botUserId) {
        isReplyToBot = true;
      }
    }

    const botNameLower = chatbotConfig.botName.toLowerCase();
    const isMentioned =
      message.mentions.users.has(this.botUserId || '') ||
      message.content.toLowerCase().includes(botNameLower);

    const randomTrigger = Math.random() < 0.005;

    if (!(isMentioned || isReplyToBot || randomTrigger)) {
      return;
    }

    const recentImages = await getRecentImagesFromChannel(
      message.channel as TextChannel
    );

    const messageToStore: ChatMessage = {
      user_id: message.author.id,
      username: message.author.username,
      content: message.content,
      timestamp: new Date().toISOString(),
      is_bot: false,
      images: recentImages,
    };

    await this.chatMemoryManager.addMessage(messageToStore);

    // Add debug logging before memory query
    logger.debug(
      { 
        messageId: message.id,
        channelId: message.channel.id,
        content: message.content 
      },
      'Starting memory query process'
    );

    // Build memory context
    try {
      await message.channel.sendTyping();
    } catch (error) {
      logger.error({ error }, "Failed to send typing indicator - lacking permission or other error.");
      return;
    }
    const memoryContext = await queryAllMemories(message.content, message.author.id);

    logger.debug(
      { 
        messageId: message.id,
        memoryContextLength: memoryContext.length,
        hasMemories: memoryContext !== "No relevant memories found." 
      },
      'Memory query completed'
    );

    // Get chat history from DB
    logger.debug('Fetching chat history from Supabase');
    const { data: chatHistory } = await supabase
      .from('chat_history')
      .select('*')
      .lt('timestamp', new Date().toISOString())
      .order('timestamp', { ascending: true });

    logger.debug(
      { historyCount: chatHistory?.length || 0 },
      'Chat history fetched'
    );

    const historyMessages = await formatChatHistoryToMessages(chatHistory || []);
    const summaries = await this.chatMemoryManager.formatRecentSummariesForPrompt();

    // Get recent chat history including links and embeds
    const recentChatHistory = await this.getRecentChatHistory(message.channel as TextChannel);
    
    const channelName = message.channel.isDMBased()
      ? 'Direct Message'
      : `#${(message.channel as TextChannel).name}`;

    const channelId = message.channel.id;
    const addContext = `## DISCORD GROUP CHAT CONTEXT\nChannel Name: ${channelName}\nChannel ID: ${channelId}\n${recentChatHistory}`;

    let finalPrompt = chatbotConfig.personality;
    finalPrompt = finalPrompt.replace('{{SUMMARIES_HERE}}', summaries);
    finalPrompt = finalPrompt.replace('{{MEMORIES_HERE}}', memoryContext);
    finalPrompt = finalPrompt.replace('{{ADDITIONAL_CONTEXT_HERE}}', addContext);

    // Prepare user message (with images)
    const userContent: ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `${message.member?.displayName || message.author.username}: ${message.content}`,
      } as ChatCompletionContentPartText,
    ];

    if (recentImages.length > 0) {
      const base64Promises = recentImages.map((imageUrl) =>
        getImageAsBase64(imageUrl)
      );
      const base64Results = await Promise.all(base64Promises);
      base64Results.forEach((base64Url) => {
        if (base64Url) {
          userContent.push({
            type: 'image_url',
            image_url: { url: base64Url },
          } as ChatCompletionContentPartImage);
        }
      });
    }

    const messagesForLLM: ChatCompletionMessageParam[] = [
      { role: 'system', content: finalPrompt },
      ...historyMessages,
      { role: 'user', content: userContent },
    ];

    // 1) Call createChatCompletion with the loaded tools
    const response = await createChatCompletion({
      model: chatbotConfig.openRouterModel,
      messages: messagesForLLM,
      max_tokens: 1000,
      temperature: 0.8,
      // [ADDED FOR TOOLS] pass the tools from chatbotTools.yaml
      tools: chatbotTools,
      tool_choice: 'auto',
    });

    this.logger.logApiCall(finalPrompt, messagesForLLM, response);

    // 2) Capture the model's partial text and send it before handling tool calls
    const choice = response.choices?.[0];
    let partialBotReply = choice?.message?.content || '';
    if (!choice) partialBotReply = 'no answer from me right now...'; // fallback if no choice

    let finalBotReply = '';

    if (choice?.message.tool_calls && choice.message.tool_calls.length > 0) {
      // Send the initial partial message if present
      if (partialBotReply.trim()) {
        if (isReplyToBot) {
          await message.reply(partialBotReply);
        } else {
          await message.channel.send(partialBotReply);
        }

        // Store partial reply in memory
        await this.chatMemoryManager.addMessage({
          user_id: 'bot',
          username: chatbotConfig.botName,
          content: partialBotReply,
          timestamp: new Date().toISOString(),
          is_bot: true,
          images: [],
        });
      }

      // Pass the partial reply as an assistant message instead of user message
      finalBotReply = await this.handleToolCalls(choice.message.tool_calls, [
        ...messagesForLLM,
        {
          role: 'assistant',
          content: partialBotReply,
        },
      ]);

      // Don't send or store the final message here since it's already handled in handleToolCalls
      return;
    } else {
      finalBotReply = partialBotReply;
    }

    let botMessageImages: string[] = []; // Define at the top level
    
    // 3) If there is any finalBotReply and no tool calls were made, send it
    if (finalBotReply.trim()) {
      let sentMessage: Message;
      if (isReplyToBot) {
        sentMessage = await message.reply(finalBotReply);
      } else {
        sentMessage = await message.channel.send(finalBotReply);
      }

      // Update botMessageImages
      botMessageImages = Array.from(sentMessage.attachments.values())
        .filter((att) => att.contentType?.startsWith('image/'))
        .map((att) => att.url);

      await this.chatMemoryManager.addMessage({
        user_id: 'bot',
        username: chatbotConfig.botName,
        content: finalBotReply,
        timestamp: new Date().toISOString(),
        is_bot: true,
        images: botMessageImages,
      });
    }

    logger.info(
      {
        recentImagesCount: recentImages.length,
        userImagesCount: recentImages.length,
        botImagesCount: botMessageImages.length,
      },
      'Completed processing all images in conversation'
    );
  }

  /**
   * Format a tool call into a readable string
   */
  private formatToolCall(toolName: string, argsStr: string): string {
    try {
      const args = JSON.parse(argsStr);
      // Format the arguments into a readable string
      const formattedArgs = Object.entries(args)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ');
      return `${toolName}(${formattedArgs})`;
    } catch (error) {
      logger.error({ error, toolName, argsStr }, 'Error formatting tool call');
      return `${toolName}(error parsing args)`;
    }
  }

  /**
   * If the model calls one or more tools, we handle them here, then feed the results
   * back into the conversation, possibly re-calling createChatCompletion if needed.
   */
  private async handleToolCalls(
    toolCalls: NonNullable<ChatCompletion['choices'][0]['message']['tool_calls']>,
    baseMessages: ChatCompletionMessageParam[]
  ): Promise<string> {
    let conversationMessages = [...baseMessages];
    let lastMessage = '';
    let toolHistory: string[] = [];

    for (const call of toolCalls) {
      const toolName = call.function.name;
      const argsStr = call.function.arguments;
      
      // Execute the tool
      const toolResult = await executeToolCall(toolName, argsStr, this.client);

      // If run_again, refresh chat history before continuing
      if (toolName === 'run_again') {
        try {
          const args = JSON.parse(argsStr);
          if (!args.shouldRun) {
            return lastMessage;
          }
          // Refresh chat history and log the new conversation state
          const freshHistory = await this.chatMemoryManager.getAllMessages();
          conversationMessages = await formatChatHistoryToMessages(freshHistory);
          
          // Add the system message and personality at the start
          conversationMessages = [
            { role: 'system' as const, content: chatbotConfig.personality },
            ...conversationMessages
          ];
          
          logger.info({ 
            messageCount: freshHistory.length,
            lastMessage: freshHistory[freshHistory.length - 1]?.content 
          }, 'Refreshed chat history for run_again');
        } catch (error) {
          logger.error({ error, argsStr }, 'Failed to handle run_again');
        }
      }

      toolHistory.push(this.formatToolCall(toolName, argsStr));
      
      // Store tool result as a user message in chat history
      await this.chatMemoryManager.addMessage({
        user_id: 'system',
        username: 'Tool Result',
        content: toolResult, // Just store the raw result string
        timestamp: new Date().toISOString(),
        is_bot: false
      });

      // Update the tool response message format
      const toolResponseUserMessage = {
        role: 'user' as const,
        content: `Tool Result: ${toolResult}` // Simplify the tool result format
      };
      conversationMessages.push(toolResponseUserMessage);

      // Re-call the LLM with updated conversation
      const followupResponse = await createChatCompletion({
        model: chatbotConfig.openRouterModel,
        messages: conversationMessages,
        max_tokens: 600,
        temperature: 0.8,
        tools: chatbotTools,
        tool_choice: 'auto',
      });

      // Log the API call
      this.logger.logApiCall(
        'Tool followup conversation', 
        conversationMessages, 
        followupResponse
      );

      const followupChoice = followupResponse.choices?.[0];
      if (!followupChoice) {
        lastMessage = `[No follow-up response for ${toolName}]`;
        continue;
      }

      // Get the assistant's reply
      const assistantReply = followupChoice.message?.content || '';
      
      // Send the message immediately if it's not empty
      if (assistantReply.trim()) {
        const sentMessage = await (baseMessages[baseMessages.length - 1].role === 'user' 
          ? (baseMessages[baseMessages.length - 1].content as ChatCompletionContentPart[])
          : null);
        
        // If the last message was from a user and had content parts (indicating a reply context)
        if (sentMessage) {
          const textContent = sentMessage.find(part => part.type === 'text') as ChatCompletionContentPartText;
          const username = textContent.text.split(':')[0].trim();
          const channel = await this.client.channels.fetch(JSON.parse(argsStr).channelId) as TextChannel;
          const messages = await channel.messages.fetch({ limit: 10 });
          const userMessage = messages.find(m => m.author.username === username || m.member?.displayName === username);
          
          if (userMessage) {
            await userMessage.reply(assistantReply);
          } else {
            await channel.send(assistantReply);
          }
        } else {
          const channel = await this.client.channels.fetch(JSON.parse(argsStr).channelId) as TextChannel;
          await channel.send(assistantReply);
        }

        // Store the message in memory
        await this.chatMemoryManager.addMessage({
          user_id: 'bot',
          username: chatbotConfig.botName,
          content: assistantReply,
          timestamp: new Date().toISOString(),
          is_bot: true,
          images: [],
        });
      }

      // Update conversation context and last message
      conversationMessages.push({
        role: 'assistant',
        content: assistantReply,
      });
      lastMessage = assistantReply;

      // If more tools are called, handle them recursively with updated messages
      if (followupChoice.message.tool_calls && followupChoice.message.tool_calls.length > 0) {
        lastMessage = await this.handleToolCalls(
          followupChoice.message.tool_calls,
          conversationMessages
        );
      }
    }

    return lastMessage;
  }
}