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
import { ChatMemoryManager } from './memory/chatMemoryManager';
import { queryAllMemories } from './memory/memoryProcessor';
import { Logger } from './logger';
import { supabase } from '../../utils/supabase/client';
import { openRouter, createChatCompletion } from '../../utils/openRouter/client';
import fetch from 'node-fetch';
import { executeToolCall } from './tools/toolHandler'; // [ADDED FOR TOOLS]

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

interface ChatMessage {
  user_id: string;
  username: string;
  content: string;
  timestamp: string;
  is_bot: boolean;
  images?: string[];
}

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

async function getRecentImagesFromChannel(
  channel: TextChannel,
  messageLimit: number = 5
): Promise<string[]> {
  const messages = await channel.messages.fetch({ limit: messageLimit });
  const imageUrls: string[] = [];

  messages.forEach((msg) => {
    msg.attachments.forEach((attachment) => {
      if (attachment.contentType?.startsWith('image/')) {
        imageUrls.push(attachment.url);
      }
    });
    msg.embeds.forEach((embed) => {
      if (embed.image) {
        imageUrls.push(embed.image.url);
      }
    });
  });

  return imageUrls.slice(0, 10);
}

async function formatChatHistoryToMessages(
  messages: ChatMessage[]
): Promise<ChatCompletionMessageParam[]> {
  const formattedMessages = await Promise.all(
    messages.map(async (msg) => {
      const content: ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: msg.content,
        } as ChatCompletionContentPartText,
      ];
      if (msg.images && Array.isArray(msg.images)) {
        const base64Promises = msg.images.map((imageUrl) =>
          getImageAsBase64(imageUrl)
        );
        const base64Results = await Promise.all(base64Promises);
        base64Results.forEach((base64Url) => {
          if (base64Url) {
            content.push({
              type: 'image_url',
              image_url: { url: base64Url },
            } as ChatCompletionContentPartImage);
          }
        });
      }

      return {
        role: msg.is_bot ? 'assistant' : 'user',
        content:
          content.length === 1
            ? (content[0] as ChatCompletionContentPartText).text
            : content,
      } as ChatCompletionMessageParam;
    })
  );

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
    logger.info(
      {
        imageCount: recentImages.length,
        imageUrls: recentImages,
      },
      'Processing images from recent messages'
    );

    const userMessageImages = Array.from(message.attachments.values())
      .filter((att) => att.contentType?.startsWith('image/'))
      .map((att) => att.url);

    if (userMessageImages.length > 0) {
      logger.info(
        {
          imageCount: userMessageImages.length,
          imageUrls: userMessageImages,
        },
        'Found images in current message'
      );
    }

    const messageToStore: ChatMessage = {
      user_id: message.author.id,
      username: message.author.username,
      content: message.content,
      timestamp: new Date().toISOString(),
      is_bot: false,
      images: userMessageImages,
    };

    await this.chatMemoryManager.addMessage(messageToStore);

    // Build memory context
    await message.channel.sendTyping();
    const memoryContext = await queryAllMemories(message.content, message.author.id);

    // Get chat history from DB
    const { data: chatHistory } = await supabase
      .from('chat_history')
      .select('*')
      .lt('timestamp', new Date().toISOString())
      .order('timestamp', { ascending: true });

    const historyMessages = await formatChatHistoryToMessages(chatHistory || []);
    const summaries = await this.chatMemoryManager.formatRecentSummariesForPrompt();
    const allMessages = await this.chatMemoryManager.getAllMessages();
    const chatHistoryText =
      allMessages.length > 0
        ? '\nChat History in Memory:\n' +
          allMessages
            .map((msg) => {
              const timeStamp = new Date(msg.timestamp).toLocaleString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: true,
                timeZone: 'UTC',
              });
              return `[${timeStamp} UTC] ${msg.username}: ${msg.content}`;
            })
            .join('\n')
        : '';

    const channelName = message.channel.isDMBased()
      ? 'Direct Message'
      : `#${(message.channel as TextChannel).name}`;

    const channelId = message.channel.id;
    const addContext = `## DISCORD GROUP CHAT CONTEXT\nChannel Name: ${channelName}\nChannel ID: ${channelId}${chatHistoryText}`;

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
        userImagesCount: userMessageImages.length,
        botImagesCount: botMessageImages.length,
      },
      'Completed processing all images in conversation'
    );
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

    for (const call of toolCalls) {
      const toolName = call.function.name;
      const argsStr = call.function.arguments;
      const toolResult = await executeToolCall(toolName, argsStr, this.client);

      // If run_again tool returns false, don't make additional completions
      if (toolName === 'run_again') {
        try {
          const args = JSON.parse(argsStr);
          if (!args.shouldRun) {
            return lastMessage; // Return current reply without making additional completions
          }
        } catch (error) {
          logger.error({ error, argsStr }, 'Failed to parse run_again arguments');
        }
      }

      // Provide the tool result as a user message
      const toolResponseUserMessage = {
        role: 'user' as const,
        content: `[TOOL USED ${toolName} RESULTS: ${JSON.stringify(toolResult)}]`,
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