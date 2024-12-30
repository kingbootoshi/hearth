import { Client, Message, TextChannel } from 'discord.js';
import * as cron from 'node-cron';
import pino from 'pino';
import { createMessage } from './summarizeAI';
import { summaryConfig } from '../../config';
import {
  insertMessage,         // Saves an individual message
  getMessages,           // Retrieves all ungathered messages
  clearMessages,         // Clears the messages once summarized
  insertHourlySummary,   // Saves an hourly summary
  getHourlySummaries,    // Retrieves all hourly summaries
  clearHourlySummaries,  // Clears the hourly summaries once turned into daily
  insertDailySummary     // Saves a daily summary
} from '../../utils/supabase/summaryDB';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export class SummaryModule {
  private client: Client;
  private scheduledTasks: cron.ScheduledTask[] = [];

  constructor(client: Client) {
    logger.info('Initializing SummaryModule');
    this.client = client;
    
    // Log module status
    if (!summaryConfig.enabled) {
      logger.info('Summary module is disabled');
    }
  }

  public async handleMessage(message: Message): Promise<void> {
    // Early return if module is disabled
    if (!summaryConfig.enabled) {
      return;
    }

    if (message.channel.id === summaryConfig.watchChannelId) {
      logger.debug({
        username: message.author.username,
        channelId: message.channel.id,
        content: message.content
      }, 'Received message in watched channel');

      const messageData = {
        username: message.author.username,
        content: message.content,
      };

      try {
        await insertMessage(messageData);
        logger.debug('Successfully stored message in temp alpha database');
      } catch (error) {
        logger.error({ err: error }, 'Failed to store message in database');
      }
    }
  }

  public scheduleTasks(): void {
    // Early return if module is disabled
    if (!summaryConfig.enabled) {
      logger.info('Summary module is disabled, not scheduling tasks');
      return;
    }

    logger.info('Scheduling summary tasks');
    
    const now = new Date();
    const delayUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

    // Store scheduled tasks so we can stop them if needed
    setTimeout(() => {
      this.scheduledTasks.push(
        cron.schedule('0 0-9,11-23 * * *', this.summarizeMessages.bind(this), {
          timezone: "America/Los_Angeles"
        })
      );
      this.summarizeMessages();
    }, delayUntilNextHour);

    this.scheduledTasks.push(
      cron.schedule('0 10 * * *', this.summarizeDaily.bind(this), {
        timezone: "America/Los_Angeles"
      })
    );

    logger.info('Summary tasks scheduled successfully');
  }

  // Add method to stop tasks if needed
  public stopTasks(): void {
    this.scheduledTasks.forEach(task => task.stop());
    this.scheduledTasks = [];
    logger.info('Summary tasks stopped');
  }

  private async summarizeMessages(): Promise<void> {
    // Double-check enabled status before running
    if (!summaryConfig.enabled) {
      return;
    }

    logger.info('Starting hourly message summarization');

    try {
      const messages = await getMessages();
      
      if (messages.length < 10) {
        logger.info('Not enough messages to summarize (minimum 10 required)');
        return;
      }

      logger.debug({ messageCount: messages.length }, 'Retrieved messages for summarization');

      const formattedMessages = messages.map((msg: { username: string; content: string }) => 
        `${msg.username}: ${msg.content}`
      ).join('\n');
      
      const summary = await createMessage(formattedMessages);
      logger.debug({ summary }, 'Generated summary');

      const summaryChannel = this.client.channels.cache.get(summaryConfig.summaryChannelId) as TextChannel;
      if (summaryChannel) {
        await summaryChannel.send(summary);
        logger.info('Posted summary to Discord channel');
      } else {
        logger.warn('Summary channel not found');
      }

      await insertHourlySummary(summary);
      logger.debug('Stored hourly summary in database');

      await clearMessages();
      logger.debug('Cleared processed messages from database');

    } catch (error) {
      logger.error({ err: error }, 'Failed to create or post hourly summary');
    }
  }

  private async summarizeDaily(): Promise<void> {
    // Double-check enabled status before running
    if (!summaryConfig.enabled) {
      return;
    }

    logger.info('Starting daily summary creation');

    try {
      const hourlySummaries = await getHourlySummaries();
      
      if (!hourlySummaries.length) {
        logger.info('No hourly summaries to compile into daily summary');
        return;
      }

      logger.debug({ summaryCount: hourlySummaries.length }, 'Retrieved hourly summaries');

      const dailySummary = hourlySummaries.join('\n\n');
      const formattedDailySummary = await createMessage(
        `## YOU ARE SUMMARIZING THE ENTIRE DAYS WORTH OF ALPHA. HERE IS EVERY HOUR OF THE PREVIOUS DAY SUMMARIZED\n\n${dailySummary}\n## STATE THAT THIS IS THE DAILY SUMMARY OF YESTERDAY`
      );

      const summaryChannel = this.client.channels.cache.get(summaryConfig.summaryChannelId) as TextChannel;
      if (summaryChannel) {
        await summaryChannel.send(formattedDailySummary);
        logger.info('Posted daily summary to Discord channel');
      } else {
        logger.warn('Summary channel not found');
      }

      await insertDailySummary(formattedDailySummary);
      logger.debug('Stored daily summary in database');

      await clearHourlySummaries();
      logger.debug('Cleared processed hourly summaries from database');

    } catch (error) {
      logger.error({ err: error }, 'Failed to create or post daily summary');
    }
  }
}