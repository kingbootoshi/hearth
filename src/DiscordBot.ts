import { Client } from 'discord.js';
import { SummaryModule } from './modules/summaryModule';
import { RuneAlertModule } from './modules/runeModule';
import { NewFeatureModule } from './modules/NewFeatureModule';
import { CommandHandler } from './CommandHandler';

export class DiscordBot {
  private summaryModule: SummaryModule;
  private runeAlertModule: RuneAlertModule;
  private newFeatureModule: NewFeatureModule;
  private commandHandler: CommandHandler;

  constructor(private client: Client) {
    this.summaryModule = new SummaryModule(client);
    this.runeAlertModule = new RuneAlertModule(client);
    this.newFeatureModule = new NewFeatureModule(client);
    this.commandHandler = new CommandHandler(client);
  }

  public start(): void {
    this.client.once('ready', () => {
      console.log(`Ready! Logged in as ${this.client.user?.tag}`);
      this.summaryModule.scheduleTasks();
      // Initialize any tasks for your new module if needed
      // this.newFeatureModule.initializeTasks();
    });

    this.client.on('messageCreate', async (message) => {
      await this.summaryModule.handleMessage(message);
      await this.runeAlertModule.handleMessage(message);
      await this.newFeatureModule.handleMessage(message);
      await this.commandHandler.handleMessage(message);
    });

    this.client.login(process.env.DISCORD_TOKEN);
  }
}