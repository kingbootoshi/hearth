import { Client, Message, TextChannel } from 'discord.js';
import { ChatMemoryManager } from './chatMemoryManager';
import { getSystemPrompt } from './config';
import { supabase } from '../../utils/supabase/client';
import Anthropic from '@anthropic-ai/sdk';
import { Logger } from './logger';
import { queryAllMemories } from './memoryProcessor';
import pino from 'pino';

// Initialize PINO logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Using basic formatting instead of transport for Bun compatibility
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export class chatbotModule {
  private client: Client;
  private chatMemoryManager: ChatMemoryManager;
  private botUserId: string | undefined;
  private anthropic: Anthropic;
  private logger: Logger;

  constructor(client: Client) {
    logger.info('Initializing chatbotModule');
    this.client = client;
    this.chatMemoryManager = new ChatMemoryManager(client, 5);
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
    this.logger = new Logger();
    logger.info('chatbotModule initialized successfully');
  }

  public async start(readyClient: any): Promise<void> {
    logger.info('Starting chatbotModule');
    this.botUserId = readyClient.user.id;
    logger.info({ botUserId: this.botUserId }, 'Bot user ID set');
  }

  public async stop(): Promise<void> {
    logger.info('Stopping chatbotModule');
    // Cleanup if needed
  }

  public async handleMessage(message: Message): Promise<void> {
    logger.info({
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channel.id,
      messageId: message.id
    }, 'Received new message');

    if (message.author.bot) {
      logger.debug('Ignoring bot message');
      return;
    }

    // Store message in memory
    logger.info('Adding message to memory manager');
    await this.chatMemoryManager.addMessage({
      user_id: String(message.author.id),
      username: message.author.username,
      content: message.content,
      timestamp: new Date().toISOString(),
      is_bot: false
    });
    logger.debug({ messageContent: message.content }, 'Message added to memory');

    // Check if we should respond
    const isMentioned = message.mentions.users.has(this.botUserId || '') 
      || message.content.toLowerCase().includes('quest boo') 
      || message.content.toLowerCase().includes('quest');

    const randomTrigger = Math.random() < 0.005;
    
    logger.debug({
      isMentioned,
      randomTrigger,
      content: message.content
    }, 'Checking response triggers');

    if (!isMentioned && !randomTrigger) {
      logger.debug('No trigger for response, skipping');
      return;
    }

    logger.info('Bot triggered to respond, starting response generation');
    await message.channel.sendTyping();

    // Query relevant memories
    logger.info('Querying memories for context');
    const memoryContext = await queryAllMemories(message.content, message.author.id);
    logger.debug({ memoryContext }, 'Retrieved memory context');

    // Get channel messages context
    logger.info('Fetching recent channel messages');
    const lastMessages = await message.channel.messages.fetch({ limit: 6 });
    const sorted = Array.from(lastMessages.values())
      .filter((m) => m.id !== message.id)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .slice(0, 5);

    logger.debug({ messageCount: sorted.length }, 'Retrieved recent messages');

    const contextText = sorted.length > 0 
      ? "\nRecent Channel History:\n" + sorted.map(msg => 
          `${msg.member?.displayName || msg.author.username}: ${msg.content}`
        ).join('\n')
      : "\nNo recent messages in channel.";

    // Get formatted summaries
    logger.info('Retrieving memory summaries');
    const summaries = await this.chatMemoryManager.formatRecentSummariesForPrompt();
    logger.debug({ summaries }, 'Retrieved formatted summaries');

    // Get chat history
    logger.info('Retrieving chat history');
    const chatHistory = await this.chatMemoryManager.getAllMessages();
    logger.debug({ messageCount: chatHistory.length }, 'Retrieved chat history');

    const chatHistoryText = chatHistory.length > 0
      ? "\nChat History in Memory:\n" + chatHistory.map(msg =>
          `${msg.username}: ${msg.content}`
        ).join('\n')
      : "\nNo chat history in memory yet.";

    const channelName = message.channel.isDMBased() 
      ? 'Direct Message' 
      : `#${(message.channel as TextChannel).name}`;

    const additionalContext = `Channel: ${channelName}${contextText}${chatHistoryText}`;

    // Get system prompt with memories included
    logger.info('Generating system prompt');
    const systemPrompt = getSystemPrompt(summaries, memoryContext, additionalContext);
    logger.debug({ systemPrompt }, 'Generated system prompt');

    const memoryWindow = [
      { role: 'user', content: message.content }
    ];

    // Send to Anthropics with the constructed prompt
    logger.info('Sending request to Anthropic API');
    const msg = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      temperature: 0.8,
      system: systemPrompt,
      messages: memoryWindow.map(m => ({
        role: m.role,
        content: m.content
      })) as Anthropic.Messages.MessageParam[]
    });

    logger.debug({ 
      response: msg,
      tokens: msg.usage
    }, 'Received response from Anthropic API');

    // Log the API call
    this.logger.logApiCall(
      systemPrompt,
      [
        {
          role: 'system',
          content: `Channel Context:\nChannel: ${channelName}\n${contextText}\n\nChat History:\n${chatHistoryText}`
        },
        ...memoryWindow
      ],
      msg
    );

    let assistantReply = '';
    if (msg.content && msg.content.length > 0 && msg.content[0].type === 'text') {
      assistantReply = msg.content[0].text.trim();
    } else {
      logger.warn('No valid response content from Anthropic API');
      assistantReply = "Quack... I have nothing to say.";
    }

    logger.info('Sending response to Discord channel');
    // Check if the message is a reply and if it's replying to our bot
    const isReplyToBot = message.reference && 
      message.reference.messageId && 
      (await message.channel.messages.fetch(message.reference.messageId))?.author.id === this.botUserId;

    logger.debug({ 
      isReply: !!message.reference,
      isReplyToBot,
      referenceMessageId: message.reference?.messageId
    }, 'Checking message reply status');

    // Send the response, using reply if the original message was a reply to the bot
    if (isReplyToBot) {
      logger.info('Sending response as reply to user\'s message');
      await message.reply(assistantReply);
    } else {
      await message.channel.send(assistantReply);
    }

    // Store assistant response as a bot message in memory
    logger.info('Storing bot response in memory');
    await this.chatMemoryManager.addMessage({
      user_id: "bot",
      username: "QuestBoo",
      content: assistantReply,
      timestamp: new Date().toISOString(),
      is_bot: true
    });
    logger.debug('Bot response stored in memory');
  }
}