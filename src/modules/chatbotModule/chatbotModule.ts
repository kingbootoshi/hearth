import { Client, Message } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getSystemPrompt } from './config';

export class chatbotModule {
  private client: Client;
  private anthropic: Anthropic;
  private memoryFilePath: string;
  private botUserId: string | undefined;

  constructor(client: Client) {
    this.client = client;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
    this.memoryFilePath = path.join(__dirname, 'chatbotMemory.json');
  }

  public async start(readyClient: any): Promise<void> {
    this.botUserId = readyClient.user.id;
  }

  public async stop(): Promise<void> {
    // Cleanup if needed
  }

  // Load chat memory
  private loadMemory(): { role: string; content: string }[] {
    if (fs.existsSync(this.memoryFilePath)) {
      const data = fs.readFileSync(this.memoryFilePath, 'utf-8');
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    }
    return [];
  }

  // Save chat memory
  private saveMemory(memory: { role: string; content: string }[]): void {
    fs.writeFileSync(this.memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
  }

  public async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    // 0.5% chance to chime in randomly
    const randomTrigger = Math.random() < 0.005;

    const isMentioned = message.mentions.users.has(this.botUserId || '') || 
                       message.content.toLowerCase().includes('quest boo') ||
                       message.content.toLowerCase().includes('quest');

    if (!isMentioned && !randomTrigger) return;

    // Start typing indicator as soon as we know we'll respond
    await message.channel.sendTyping();

    try {
      // Fetch last 5 messages as context (not including current)
      const lastMessages = await message.channel.messages.fetch({ limit: 6, before: message.id });
      const sorted = lastMessages
        .filter((m) => m.id !== message.id)
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const contextText = sorted.map(msg => `${msg.member?.displayName || msg.author.username}: ${msg.content}`).join('\n');

      // Load memory
      const memory = this.loadMemory();
      const memoryWindow = memory.slice(-20);

      const systemPrompt = getSystemPrompt(contextText, JSON.stringify(memoryWindow));
      memoryWindow.push({ role: 'user', content: message.content });

      const msg = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        temperature: 0.8,
        system: systemPrompt,
        messages: memoryWindow.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        })) as Anthropic.Messages.MessageParam[]
      });

      let assistantReply = '';
      if (msg.content && msg.content.length > 0 && msg.content[0].type === 'text') {
        assistantReply = msg.content[0].text.trim();
      } else {
        assistantReply = "Quack... I have nothing to say.";
      }

      // Add assistant response to memory
      memoryWindow.push({ role: 'assistant', content: assistantReply });

      // Save updated memory to file
      const fullMemory = [...memory.slice(0, memory.length - memoryWindow.length), ...memoryWindow];
      this.saveMemory(fullMemory);

      // Send the message in Discord
      await message.channel.send(assistantReply);
      
    } catch (error) {
      console.error('Error in chatbot response:', error);
      // Send error message to channel
      await message.channel.send("Sorry, I encountered an error while processing your message.");
    }
  }
}