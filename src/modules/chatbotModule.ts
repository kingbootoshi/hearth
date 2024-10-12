import { ActionEvent, Soul } from "@opensouls/soul";
import { Client, Events, Message, MessageType, ReplyOptions, TextChannel } from "discord.js";
import { getMetadataFromActionEvent, makeMessageCreateDiscordEvent } from "../utils/eventUtils";
import { splitMessage } from "../utils/messageUtils";
import { MongoClient } from 'mongodb';

export type DiscordEventData = {
  type: "messageCreate";
  messageId: string;
  channelId: string;
  guildId: string;
  userId: string;
  userDisplayName: string;
  atMentionUsername: string;
  repliedToUserId?: string;
  chatContext: string;
};

export class chatbotModule {
  private soul: Soul;
  private proactiveChannels: string[] = ['1199102037477048320', '1071136183297515532'];
  private mongoClient: MongoClient;

  constructor(private client: Client) {
    this.soul = new Soul({
      organization: process.env.SOUL_ENGINE_ORG!,
      blueprint: process.env.SOUL_BLUEPRINT!,
      soulId: process.env.SOUL_ID || undefined,
      token: process.env.SOUL_ENGINE_API_KEY || undefined,
      debug: process.env.SOUL_DEBUG === "true",
    });

    this.mongoClient = new MongoClient(process.env.MONGODB_URI!);
  }

  public async start(readyClient: Client<true>): Promise<void> {
    this.soul.on("says", this.onSoulSays.bind(this));
    this.soul.on("saveTrainingData", this.handleTrainingData.bind(this));

    this.soul.connect();

    this.soul.setEnvironment({
      discordUserId: readyClient.user.id,
    });

    // this.startProactiveEngagement();

    try {
      await this.mongoClient.connect();
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
    }
  }

  public async stop(): Promise<void> {
    await this.mongoClient.close();
    return this.soul.disconnect();
  }

  public async handleMessage(message: Message): Promise<void> {
    const allowedChannels = ['1071136183297515532', '1199102037477048320', '1249149957684990073', '1136338059286282371'];
    
    if (!allowedChannels.includes(message.channelId)) {
      return;
    }
  
    const messageSenderIsBot = !!message.author.bot;
    const isPinged = message.mentions.users.has(this.client.user!.id);
    const isRepliedToBot = message.reference?.messageId && 
      (await message.channel.messages.fetch(message.reference.messageId))?.author.id === this.client.user!.id;

    const isPingedOrRepliedToBot = isPinged || isRepliedToBot;

    const isQuestionInGeneralChat = 
      message.channelId === process.env.DISCORD_GENERAL_CHANNEL_ID && 
      message.content.trim().endsWith('?');

    const randomResponse = Math.random() < 0.001; // 0.1% chance

    const shouldRespondToMessage = 
      !messageSenderIsBot && 
      (isPingedOrRepliedToBot || isQuestionInGeneralChat || randomResponse);
  
    if (!shouldRespondToMessage) {
      return;
    }

    try {
      const discordEvent = await makeMessageCreateDiscordEvent(message);
      const userName = discordEvent.userDisplayName;
  
      let content = message.content;
      if (discordEvent.repliedToUserId) {
        content = `<@${discordEvent.repliedToUserId}> ${content}`;
      }
  
      this.soul.dispatch({
        action: "chatted",
        content,
        name: userName,
        _metadata: {
          discordEvent,
          discordUserId: this.client.user?.id,
          chatContext: discordEvent.chatContext,
        },
      });
  
      const channel = await this.client.channels.fetch(discordEvent.channelId);
      if (channel && channel.isTextBased()) {
        await channel.sendTyping();
      } else {
        console.warn(`Channel ${discordEvent.channelId} is not a text channel or doesn't exist.`);
      }
    } catch (error) {
      console.error(`Error handling message in channel ${message.channelId}:`, error);
    }
  }

  private async onSoulSays(event: ActionEvent): Promise<void> {
    const { content } = event;

    const { discordEvent, actionConfig } = getMetadataFromActionEvent(event);
    if (!discordEvent) return;

    console.log("soul said something");

    let reply: ReplyOptions | undefined = undefined;
    if (discordEvent.type === "messageCreate" && actionConfig?.sendAs === "reply") {
      reply = {
        messageReference: discordEvent.messageId,
      };
    }

    try {
      const channel = await this.client.channels.fetch(discordEvent.channelId);
      if (channel && channel.isTextBased()) {
        await channel.sendTyping();
        
        const messageContent = await content();
        const messageParts = splitMessage(messageContent);
  
        for (const part of messageParts) {
          await channel.send({
            content: part,
            reply: reply && messageParts.indexOf(part) === 0 ? reply : undefined,
          });
          reply = undefined; // Only reply to the first message
        }
      } else {
        console.warn(`Channel ${discordEvent.channelId} is not a text channel or doesn't exist.`);
      }
    } catch (error) {
      console.error(`Error sending message to channel ${discordEvent.channelId}:`, error);
    }
  }

  private startProactiveEngagement(): void {
    const scheduleNextMessage = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const timeUntilTomorrow = tomorrow.getTime() - now.getTime();
      const randomDelay = Math.random() * 24 * 60 * 60 * 1000; // Random time within 24 hours
  
      setTimeout(() => {
        this.sendProactiveMessage();
        scheduleNextMessage();
      }, timeUntilTomorrow + randomDelay);
    };
  
    scheduleNextMessage();
  }

  private async sendProactiveMessage(): Promise<void> {
    const channelId = this.proactiveChannels[Math.floor(Math.random() * this.proactiveChannels.length)];
    
    const channel = await this.client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      // Fetch the last 5 messages
      const messages = await (channel as TextChannel).messages.fetch({ limit: 5 });

      // Format the messages into a string
      const chatContext = messages
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(msg => `${msg.author.username}: ${msg.content}`)
        .join('\n');

      const discordEvent: DiscordEventData = {
        type: "messageCreate",
        messageId: "proactive_" + Date.now(),
        channelId: channelId,
        guildId: "",
        userId: this.client.user?.id || "",
        userDisplayName: this.client.user?.username || "Bot",
        atMentionUsername: `<@${this.client.user?.id}>`,
        chatContext: chatContext,
      };

      let content: string;
      if (channelId === '1199102037477048320') {
        content = "Time for a proactive message! You're currently in the kingdom exclusive holder discord chat";
      } else if (channelId === '1071136183297515532') {
        content = "Time for a proactive message! You're about to send something in the non-holder general chat of the discord";
      } else {
        content = "Time for a proactive message!";
      }

      this.soul.dispatch({
        action: "proactiveChat",
        content,
        name: "Quest_Boo_Inner_Mind",
        _metadata: {
          discordEvent,
          discordUserId: this.client.user?.id,
        },
      });

      // Optionally, you can add typing indicator before the soul responds
      if (channel.isTextBased()) {
        await channel.sendTyping();
      }
    }
  }

  private async handleTrainingData(event: ActionEvent): Promise<void> {
    const { content } = event;
    const newTrainingData = JSON.parse(await content());
  
    try {
      const database = this.mongoClient.db('ai_training_data');
      const collection = database.collection('quest_boo');
  
      const result = await collection.insertOne(newTrainingData);
      console.log(`Training data inserted with ID: ${result.insertedId}`);
    } catch (error) {
      console.error('Error saving training data to MongoDB:', error);
    }
  }
}