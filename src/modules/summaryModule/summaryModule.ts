import { Client, Message, TextChannel } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';
import { createMessage } from './summarizeAI';
import {
  insertMessage,         // Saves an individual message
  getMessages,           // Retrieves all ungathered messages
  clearMessages,         // Clears the messages once summarized
  insertHourlySummary,   // Saves an hourly summary
  getHourlySummaries,    // Retrieves all hourly summaries
  clearHourlySummaries,  // Clears the hourly summaries once turned into daily
  insertDailySummary     // Saves a daily summary
} from '../../utils/supabase/summaryDB';

export class SummaryModule {
  private channelId = '1201049178906832956';
  private summaryChannelId = '1215463522176339978';
  private messagesFilePath = path.join(__dirname, '..', '..', 'messages.json');
  private hourlySummariesFilePath = path.join(__dirname, '..', '..', 'hourlySummaries.json');

  constructor(private client: Client) {}

  public async handleMessage(message: Message): Promise<void> {
    if (message.channel.id === this.channelId) {
      const messageData = {
        username: message.author.username,
        content: message.content,
      };

      // Insert message into Supabase
      await insertMessage(messageData);
    }
  }

  public scheduleTasks(): void {
    const now = new Date();
    const delayUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

    setTimeout(() => {
      cron.schedule('0 0-9,11-23 * * *', this.summarizeMessages.bind(this), {
        timezone: "America/Los_Angeles"
      });
      this.summarizeMessages();
    }, delayUntilNextHour);

    cron.schedule('0 10 * * *', this.summarizeDaily.bind(this), {
      timezone: "America/Los_Angeles"
    });
  }

  private async summarizeMessages(): Promise<void> {
    // Retrieve messages from Supabase instead of local file
    const messages = await getMessages();
    if (messages.length < 10) return;

    const formattedMessages = messages.map((msg: { username: string; content: string }) => `${msg.username}: ${msg.content}`).join('\n');
    
    const summary = await createMessage(formattedMessages);

    const summaryChannel = this.client.channels.cache.get(this.summaryChannelId) as TextChannel;
    if (summaryChannel) {
      summaryChannel.send(summary);
    }

    // Insert the hourly summary into Supabase
    await insertHourlySummary(summary);

    // Clear out the original messages after summarizing
    await clearMessages();
  }

  private async summarizeDaily(): Promise<void> {
    // Retrieve hourly summaries from Supabase
    const hourlySummaries = await getHourlySummaries();
    if (!hourlySummaries.length) return;

    const dailySummary = hourlySummaries.join('\n\n');
    
    const formattedDailySummary = await createMessage(`## YOU ARE SUMMARIZING THE ENTIRE DAYS WORTH OF ALPHA. HERE IS EVERY HOUR OF THE PREVIOUS DAY SUMMARIZED\n\n${dailySummary}\n## STATE THAT THIS IS THE DAILY SUMMARY OF YESTERDAY`);

    const summaryChannel = this.client.channels.cache.get(this.summaryChannelId) as TextChannel;
    if (summaryChannel) {
      summaryChannel.send(formattedDailySummary);
    }

    // Insert the daily summary into Supabase
    await insertDailySummary(formattedDailySummary);

    // Clear out the hourly summaries once we have the daily summary
    await clearHourlySummaries();
  }
}