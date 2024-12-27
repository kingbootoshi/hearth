import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { SummaryModule } from './modules/summaryModule/summaryModule';
import { chatbotModule } from './modules/chatbotModule/chatbotModule';
import { CommandHandler } from './CommandHandler';

export class DiscordBot {
  private summaryModule: SummaryModule;
  private chatbotModule: chatbotModule;
  private commandHandler: CommandHandler;
  private client: Client;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessageTyping,
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
      ],
    });

    this.summaryModule = new SummaryModule(this.client);
    this.chatbotModule = new chatbotModule(this.client);
    this.commandHandler = new CommandHandler(this.client);
  }

  public async start(): Promise<void> {
    this.client.once('ready', async (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
      this.summaryModule.scheduleTasks();
      await this.chatbotModule.start(readyClient);

      await this.commandHandler.registerCommands();
    });

    this.client.on('interactionCreate', async (interaction) => {
      await this.commandHandler.handleInteraction(interaction);
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      await this.summaryModule.handleMessage(message);
      await this.chatbotModule.handleMessage(message);
    });

    this.client.on('messageReactionAdd', async (reaction, user) => {
      console.log(`Reaction added: ${reaction.emoji.name} by ${user.tag}`);
    });

    await this.client.login(process.env.DISCORD_TOKEN);
  }

  public async stop(): Promise<void> {
    await this.chatbotModule.stop();
    await this.client.destroy();
  }
}