import { Client, Message, TextChannel } from 'discord.js';
import pino from 'pino';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { chatbotConfig } from '../../config';
import { ChatMemoryManager } from './memory/chatMemoryManager';
import { queryAllMemories } from './memory/memoryProcessor';
import { Logger } from './logger';
import { supabase } from '../../utils/supabase/client';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Add this function to format chat history into OpenAI messages
async function formatChatHistoryToMessages(messages: any[]): Promise<ChatCompletionMessageParam[]> {
  // Convert chat history entries to OpenAI message format
  return messages.map(msg => ({
    role: msg.is_bot ? 'assistant' : 'user',
    content: msg.content
  }));
}

export class ChatbotModule {
  private client: Client;
  private botUserId: string | undefined;
  private logger: Logger;
  private openai: OpenAI;
  private chatMemoryManager: ChatMemoryManager;

  constructor(client: Client) {
    logger.info('Constructing ChatbotModule (separate file).');
    this.client = client;
    this.logger = new Logger();
    this.chatMemoryManager = new ChatMemoryManager(client, 30);

    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',

    });
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

    // Store user message
    await this.chatMemoryManager.addMessage({
      user_id: message.author.id,
      username: message.author.username,
      content: message.content,
      timestamp: new Date().toISOString(),
      is_bot: false
    });

    // Build up context
    await message.channel.sendTyping();
    const memoryContext = await queryAllMemories(message.content, message.author.id);

    // Get chat history from Supabase, excluding the current message
    const { data: chatHistory } = await supabase
      .from('chat_history')
      .select('*')
      .lt('timestamp', new Date().toISOString()) // Only get messages before current one
      .order('timestamp', { ascending: true });

    // Format chat history into messages array
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
    // and current user message last
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: finalPrompt },
      ...historyMessages,
      { role: 'user', content: `${message.member?.displayName || message.author.username}: ${message.content}` }
    ];

    const result = await this.openai.chat.completions.create({
      model: chatbotConfig.openRouterModel,
      messages,
      max_tokens: 1000,
      temperature: 0.8
    });

    this.logger.logApiCall(finalPrompt, messages, result);

    let botReply = '';
    if (result.choices && result.choices.length > 0) {
      botReply = result.choices[0].message?.content || '';
    } else {
      botReply = "no answer from me right now...";
    }

    if (isReplyToBot) {
      await message.reply(botReply);
    } else {
      await message.channel.send(botReply);
    }

    await this.chatMemoryManager.addMessage({
      user_id: 'bot',
      username: chatbotConfig.botName,
      content: botReply,
      timestamp: new Date().toISOString(),
      is_bot: true
    });
  }
}