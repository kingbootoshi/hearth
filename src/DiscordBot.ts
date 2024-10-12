import { Client } from 'discord.js';
import { SummaryModule } from './modules/summaryModule';
import { RuneAlertModule } from './modules/runeModule';
// import { chatbotModule } from './modules/chatbotModule';
import { CommandHandler } from './CommandHandler';

export class DiscordBot {
  private summaryModule: SummaryModule;
  private runeAlertModule: RuneAlertModule;
  // private chatbotModule: chatbotModule;
  private commandHandler: CommandHandler;

  constructor(private client: Client) {
    this.summaryModule = new SummaryModule(client);
    this.runeAlertModule = new RuneAlertModule(client);
    // this.chatbotModule = new chatbotModule(client);
    this.commandHandler = new CommandHandler(client);
  }

  public async start(): Promise<void> {
    this.client.once('ready', async (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
      this.summaryModule.scheduleTasks();
      // await this.chatbotModule.start(readyClient);

      // Register slash commands after the client is ready
      await this.commandHandler.registerCommands();
    });

    // Add an interactionCreate listener for commands and buttons
    this.client.on('interactionCreate', async (interaction) => {
      await this.commandHandler.handleInteraction(interaction);
    });

    // **Add the messageCreate listener back**
    this.client.on('messageCreate', async (message) => {
      // Ensure the bot doesn't respond to itself or other bots
      if (message.author.bot) return;

      // Handle messages in your modules
      await this.summaryModule.handleMessage(message);
      await this.runeAlertModule.handleMessage(message);
      // await this.chatbotModule.handleMessage(message);
    });

    await this.client.login(process.env.DISCORD_TOKEN);
  }

  public async stop(): Promise<void> {
    // await this.chatbotModule.stop();
    await this.client.destroy();
  }
}
