import { Client, TextChannel } from 'discord.js';
import pino from 'pino';

/** Tool argument shapes */
interface RunAgainArgs {
  shouldRun: boolean;
  channelId: string;
}

/** Logger */
const logger = pino({
  name: 'toolHandler',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Example "run_again" tool executor
 * @param args an object containing { shouldRun, channelId }
 * @param client the Discord.js client to send a message if needed
 * @returns the result string
 */
export async function handleRunAgain(
  args: RunAgainArgs,
  client: Client
): Promise<string> {
  logger.info({ args }, '[run_again] Tool invoked');

  if (args.shouldRun) {
    // Try to find the given channel
    const channel = client.channels.cache.get(args.channelId);
    if (!channel) {
      logger.warn({ channelId: args.channelId }, 'Channel not found');
      return `Channel with ID ${args.channelId} not found. Can't run again.`;
    }

    // We won't actually send a message here; we’ll just return a
    // "result" string. We'll handle re-calling the LLM in the chatbot logic.
    // However, for demonstration, you can optionally post a notice:
    if (channel.isTextBased()) {
      await (channel as TextChannel).send(
        ':sparkles: [run_again tool triggered] Bot will produce another response in this channel...'
      );
    }

    return `Bot will re-run and produce another response in channel #${args.channelId}`;
  } else {
    return `No re-run needed. shouldRun was false.`;
  }
}

/**
 * Main function: choose the right tool and run it
 * @param toolName name of the tool
 * @param argsStr JSON string with function arguments
 * @param client Discord client (needed if a tool wants to do something in discord)
 */
export async function executeToolCall(
  toolName: string,
  argsStr: string,
  client: Client
): Promise<string> {
  try {
    const args = JSON.parse(argsStr);

    switch (toolName) {
      case 'run_again':
        return await handleRunAgain(args, client);

      default:
        return `Unknown tool called: ${toolName}`;
    }
  } catch (err) {
    logger.error({ err, toolName, argsStr }, 'Error executing tool');
    return `Tool execution error for ${toolName}: ${String(err)}`;
  }
}