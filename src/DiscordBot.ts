import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { SummaryModule } from './modules/summaryModule/summaryModule';
import { RuneAlertModule } from './modules/runeModule/runeModule';
import { chatbotModule } from './modules/chatbotModule/chatbotModule';
import { CommandHandler } from './CommandHandler';

export class DiscordBot {
  private summaryModule: SummaryModule;
  private runeAlertModule: RuneAlertModule;
  private chatbotModule: chatbotModule;
  private commandHandler: CommandHandler;
  private client: Client;

  constructor() {
    // Initialize the client with required intents and partials
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
    this.runeAlertModule = new RuneAlertModule(this.client);
    this.chatbotModule = new chatbotModule(this.client);
    this.commandHandler = new CommandHandler(this.client);
  }

  public async start(): Promise<void> {
    this.client.once('ready', async (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
      this.summaryModule.scheduleTasks();
      await this.chatbotModule.start(readyClient);

      // Register slash commands after the client is ready
      await this.commandHandler.registerCommands();
    });

    // Add an interactionCreate listener for commands and buttons
    this.client.on('interactionCreate', async (interaction) => {
      await this.commandHandler.handleInteraction(interaction);
    });

    // Add the messageCreate listener
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      await this.summaryModule.handleMessage(message);
      await this.runeAlertModule.handleMessage(message);
      await this.chatbotModule.handleMessage(message);
    });

    // Listen for message reaction additions
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