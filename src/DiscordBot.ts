import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { CommandHandler } from './CommandHandler';

// Interface that all modules must implement
interface BotModule {
  // Required methods
  init?(client: Client): Promise<void>;
  start?(client: Client): Promise<void>;
  stop?(): Promise<void>;
  // Optional handlers
  handleMessage?(message: any): Promise<void>;
  handleInteraction?(interaction: any): Promise<void>;
  handleReaction?(reaction: any, user: any): Promise<void>;
  scheduleTasks?(): void;
}

// Registry to keep track of all modules
class ModuleRegistry {
  private modules: BotModule[] = [];

  register(module: BotModule) {
    this.modules.push(module);
  }

  getModules(): BotModule[] {
    return this.modules;
  }
}

export class DiscordBot {
  private moduleRegistry: ModuleRegistry;
  private commandHandler: CommandHandler;
  private client: Client;

  constructor() {
    this.moduleRegistry = new ModuleRegistry();
    
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

    this.commandHandler = new CommandHandler(this.client);
    
    // Register modules
    this.registerModules();
  }

  // Method to register all modules
  private registerModules() {
    // Import and register modules
    const { SummaryModule } = require('./modules/summaryModule/summaryModule');
    const { ChatbotModule } = require('./modules/chatbotModule/chatbotModule');

    this.moduleRegistry.register(new SummaryModule(this.client));
    this.moduleRegistry.register(new ChatbotModule(this.client));
  }

  public async start(): Promise<void> {
    // Initialize all modules
    for (const module of this.moduleRegistry.getModules()) {
      if (module.init) await module.init(this.client);
    }

    this.client.once('ready', async (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
      
      // Start all modules
      for (const module of this.moduleRegistry.getModules()) {
        if (module.start) await module.start(readyClient);
        if (module.scheduleTasks) module.scheduleTasks();
      }

      await this.commandHandler.registerCommands();
    });

    this.client.on('interactionCreate', async (interaction) => {
      await this.commandHandler.handleInteraction(interaction);
      // Handle interactions in modules
      for (const module of this.moduleRegistry.getModules()) {
        if (module.handleInteraction) await module.handleInteraction(interaction);
      }
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      // Handle messages in modules
      for (const module of this.moduleRegistry.getModules()) {
        if (module.handleMessage) await module.handleMessage(message);
      }
    });

    this.client.on('messageReactionAdd', async (reaction, user) => {
      console.log(`Reaction added: ${reaction.emoji.name} by ${user.tag}`);
      // Handle reactions in modules
      for (const module of this.moduleRegistry.getModules()) {
        if (module.handleReaction) await module.handleReaction(reaction, user);
      }
    });

    await this.client.login(process.env.DISCORD_TOKEN);
  }

  public async stop(): Promise<void> {
    // Stop all modules
    for (const module of this.moduleRegistry.getModules()) {
      if (module.stop) await module.stop();
    }
    await this.client.destroy();
  }
}