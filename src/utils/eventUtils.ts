import { ActionEvent } from "@opensouls/engine";
import { Message } from "discord.js";

export function getMetadataFromActionEvent(evt: ActionEvent) {
  return {
    discordEvent: evt._metadata?.discordEvent as DiscordEventData,
    actionConfig: evt._metadata?.actionConfig as SoulActionConfig,
  };
}

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

export type DiscordAction = "chatted" | "joined";

export type SoulActionConfig =
  | {
      type: "says";
      sendAs: "message" | "reply";
    }
  | {
      type: "reacts";
      sendAs: "emoji";
    };

export async function makeMessageCreateDiscordEvent(message: Message): Promise<DiscordEventData> {
  let repliedToUserId: string | undefined = undefined;
  if (message.reference && message.reference.messageId) {
    const repliedToMessage = await message.channel.messages.fetch(message.reference.messageId);
    repliedToUserId = repliedToMessage.author.id;
  }

  // Fetch the last 5 messages (including the current one)
  const messages = await message.channel.messages.fetch({ limit: 6, before: message.id });
  
  // Format the messages into a string, excluding the current message
  const chatContext = messages
    .filter(msg => msg.id !== message.id)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(msg => `${msg.author.displayName}: ${msg.content}`)
    .join('\n');

  return {
    type: "messageCreate",
    messageId: message.id,
    channelId: message.channel.id,
    guildId: message.guild?.id || "",
    userId: message.author.id,
    userDisplayName: message.author.displayName,
    atMentionUsername: `<@${message.author.id}>`,
    repliedToUserId,
    chatContext,
  };
}