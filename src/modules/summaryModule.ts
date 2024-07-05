import { Client, Message, TextChannel } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';
import { createMessage } from '../utils/claude';

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

      let messages = [];
      if (fs.existsSync(this.messagesFilePath)) {
        const fileContent = fs.readFileSync(this.messagesFilePath, 'utf-8');
        messages = JSON.parse(fileContent);
      }

      messages.push(messageData);

      fs.writeFileSync(this.messagesFilePath, JSON.stringify(messages, null, 2), 'utf-8');
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
    if (fs.existsSync(this.messagesFilePath)) {
      const fileContent = fs.readFileSync(this.messagesFilePath, 'utf-8');
      const messages = JSON.parse(fileContent);

      if (messages.length < 10) return;

      const formattedMessages = messages.map((msg: { username: string; content: string }) => `${msg.username}: ${msg.content}`).join('\n');
      
      const summary = await createMessage(formattedMessages);

      const summaryChannel = this.client.channels.cache.get(this.summaryChannelId) as TextChannel;
      if (summaryChannel) {
        summaryChannel.send(summary);
      }

      let hourlySummaries = [];
      if (fs.existsSync(this.hourlySummariesFilePath)) {
        const hourlyContent = fs.readFileSync(this.hourlySummariesFilePath, 'utf-8');
        hourlySummaries = JSON.parse(hourlyContent);
      }

      hourlySummaries.push(summary);
      fs.writeFileSync(this.hourlySummariesFilePath, JSON.stringify(hourlySummaries, null, 2), 'utf-8');
      fs.writeFileSync(this.messagesFilePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private async summarizeDaily(): Promise<void> {
    if (fs.existsSync(this.hourlySummariesFilePath)) {
      const fileContent = fs.readFileSync(this.hourlySummariesFilePath, 'utf-8');
      const hourlySummaries = JSON.parse(fileContent);

      const dailySummary = hourlySummaries.join('\n\n');
      
      const formattedDailySummary = await createMessage(`## YOU ARE SUMMARIZING THE ENTIRE DAYS WORTH OF ALPHA. HERE IS EVERY HOUR OF THE PREVIOUS DAY SUMMARIZED\n\n${dailySummary}\n## STATE THAT THIS IS THE DAILY SUMMARY OF YESTERDAY`);

      const summaryChannel = this.client.channels.cache.get(this.summaryChannelId) as TextChannel;
      if (summaryChannel) {
        summaryChannel.send(formattedDailySummary);
      }

      fs.writeFileSync(this.hourlySummariesFilePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }
}