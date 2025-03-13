# Discord Bot Documentation

This document provides a comprehensive overview of the key components of the Discord bot application, focusing on configuration, modular features, the chatbot component with function calling, and the command system. These elements are essential for understanding how to customize and extend the bot to meet your community's needs.

---

## 1. Configuration

The Discord bot utilizes YAML files for configuration, which are stored in the `config` directory. These files define settings for various modules and features, allowing you to tailor the bot's behavior without modifying the source code.

### Key Configuration Files

- **`chatbot.yaml`**: Configures the chatbot's behavior, including its AI model, personality, and available tools. Example settings include `openRouterModel`, `botName`, and `personality`.
- **`chatbotTools.yaml`**: Defines the tools (functions) the chatbot can use, such as image generation or Twitter posting.
- **`imageGen.yaml`**: Configures the image generation module, specifying the AI model and system prompts for enhancing prompts.
- **`vote.yaml`**: Sets up the voting module, including the channel where votes occur.
- **`summary.yaml`**: Configures the summarization module, defining the channels to monitor and post summaries to.

### How to Set Up Configs

1. **Locate and Edit YAML Files**:
   - Open the relevant YAML file in the `config` directory using a text editor.
   - Modify the parameters to suit your needs. For instance, to change the chatbot's personality in `chatbot.yaml`, update the `personality` field:

     ```yaml
     personality: |
       You are a friendly and helpful assistant, always eager to assist users with a touch of humor.
     ```

2. **Apply Changes**:
   - Save the file after editing.
   - Restart the bot to load the updated configurations. The bot reads these files at runtime, so changes take effect upon restart.

3. **Accessing Configs in Code**:
   - Configuration files are typically loaded into TypeScript modules via files in `src/config`, such as `chatbotConfig.ts`. These modules parse the YAML files and make settings available to the application. For example:

     ```typescript
     import { load } from 'js-yaml';
     import * as fs from 'fs';

     const config = load(fs.readFileSync('config/chatbot.yaml', 'utf8')) as any;
     export const chatbotConfig = config;
     ```

   - Modules then import these configurations to use them, ensuring settings are centralized and easily adjustable.

**Example: Enabling Image Generation**

To enable the image generation module, edit `imageGen.yaml`:

```yaml
enabled: true
openRouterModel: "openai/gpt-4o"
```

Restart the bot, and the `imageGenModule` will activate with the specified model.

---

## 2. Modular Features

The bot employs a modular architecture, where functionalities are separated into distinct modules located in the `src/modules` directory. This design enhances maintainability, extensibility, and customization.

### Key Modules

- **`chatbotModule`**: Manages AI-driven conversations, memory, and tool usage.
- **`imageGenModule`**: Handles image generation tasks, including prompt enhancement and image creation.
- **`voteModule`**: Facilitates voting sessions, such as daily votes or user-initiated polls.
- **`summaryModule`**: Generates summaries of channel activity.
- **`pointsModule`**: Tracks user points for engagement.

### How to Set Up a New Module

1. **Create a Module Directory**:
   - Add a new directory under `src/modules` (e.g., `src/modules/myNewModule`).

2. **Implement Module Logic**:
   - Create a main module file (e.g., `myNewModule.ts`) and any supporting files (e.g., database, utilities).
   - Define a class implementing the `BotModule` interface, which may include methods like `init`, `start`, and `stop`:

     ```typescript
     import { Client } from 'discord.js';
     import { logger } from '../../utils/logger';

     export class MyNewModule {
       constructor(private client: Client) {}

       async init(client: Client): Promise<void> {
         logger.info('Initializing MyNewModule');
       }

       async start(client: Client): Promise<void> {
         logger.info('Starting MyNewModule');
         // Add startup logic here
       }

       async stop(): Promise<void> {
         logger.info('Stopping MyNewModule');
         // Add cleanup logic here
       }
     }
     ```

3. **Register the Module**:
   - Update `src/DiscordBot.ts` to include your module in the `registerModules` method:

     ```typescript
     private registerModules() {
       this.moduleRegistry.register(new SummaryModule(this.client));
       this.moduleRegistry.register(new ChatbotModule(this.client, {
         ignoreChannels: this.ignoreChannels,
         ignoreGuilds: this.ignoreGuilds
       }));
       this.moduleRegistry.register(new AutoVoteModule());
       this.moduleRegistry.register(new MyNewModule(this.client)); // Add your module
     }
     ```

4. **Integrate with Config (Optional)**:
   - If your module requires configuration, create a corresponding YAML file in `config` (e.g., `myNewModule.yaml`) and load it in a config file under `src/config`.

Once registered, the module will initialize and start with the bot, integrating seamlessly with other components.

---

## 3. Chatbot Component with Function Calling

The chatbot is a core feature, enabling natural conversations using AI models from OpenRouter. It can call predefined functions (tools) to perform actions, enhancing its interactivity.

### Configuration

The chatbot's behavior is defined in `config/chatbot.yaml`. Key settings include:

- **`enabled`**: Toggle the chatbot on or off.
- **`openRouterModel`**: Specify the AI model (e.g., `"anthropic/claude-3.5-sonnet:beta"`).
- **`personality`**: Define the chatbot's character and tone.
- **`tools`**: Reference tools from `chatbotTools.yaml`.

### Function Calling (Tools)

Tools are functions the chatbot can invoke, defined in `config/chatbotTools.yaml` and implemented in `src/modules/chatbotModule/tools/toolHandler.ts`. Examples include:

- **`generate_image`**: Creates an image based on a prompt.
- **`twitter_post`**: Posts content to Twitter (X).
- **`run_again`**: Triggers the chatbot to respond again, enabling tool chaining.

#### Adding a New Tool

1. **Define the Tool in `chatbotTools.yaml`**:
   - Add a new entry under the `tools` array with the function's details:

     ```yaml
     - type: "function"
       function:
         name: "send_message"
         description: "Send a message to a specific Discord channel"
         parameters:
           type: "object"
           properties:
             channelId:
               type: "string"
               description: "The ID of the Discord channel"
             message:
               type: "string"
               description: "The message to send"
           required: ["channelId", "message"]
           additionalProperties: false
     ```

2. **Implement the Tool Handler**:
   - In `toolHandler.ts`, define the argument interface and handler function, then add it to the `executeToolCall` switch:

     ```typescript
     import { Client } from 'discord.js';
     import { logger } from '../../../utils/logger';

     interface SendMessageArgs {
       channelId: string;
       message: string;
     }

     async function handleSendMessage(args: SendMessageArgs, client: Client): Promise<string> {
       logger.info({ args }, '[send_message] Tool invoked');
       try {
         const channel = client.channels.cache.get(args.channelId);
         if (!channel || !channel.isTextBased()) {
           throw new Error('Invalid or non-text channel');
         }
         await channel.send(args.message);
         return `Message sent to channel ${args.channelId}: "${args.message}"`;
       } catch (error) {
         logger.error({ error }, 'Error in send_message');
         throw error;
       }
     }

     export async function executeToolCall(toolCall: any, client: Client): Promise<string> {
       switch (toolCall.function.name) {
         case 'send_message':
           return handleSendMessage(toolCall.function.arguments, client);
         // Other cases...
         default:
           throw new Error(`Unknown tool: ${toolCall.function.name}`);
       }
     }
     ```

3. **Usage**:
   - The chatbot automatically recognizes and uses the tool based on conversation context and the tool’s description. No additional registration is needed beyond defining it in the YAML and implementing the handler.

#### Interacting with Modular Functions

Tools can call functions from other modules. For example, the `generate_image` tool uses `submitImageJob` from `imageGenModule`:

```typescript
import { submitImageJob } from '../../imageGenModule/imageGen';

async function handleGenerateImage(args: GenerateImageArgs, client: Client): Promise<string> {
  const imageUrl = await submitImageJob(args.prompt);
  return imageUrl;
}
```

This modularity allows the chatbot to leverage the bot's full functionality dynamically.

---

## 4. Commands

Commands enable user interaction via Discord slash commands, defined in the `src/commands` directory. They are inherently modular, allowing easy addition of new functionalities.

### Structure of a Command

Each command file exports:

- **`data`**: A `SlashCommandBuilder` object defining the command’s name, description, and options.
- **`execute`**: An async function handling the command’s logic.
- **`handleButtonInteraction`** (optional): An async function for button interactions, if applicable.

**Example: `awardPointCommand.ts`**

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PointsManager } from '../modules/pointsModule/pointsManager';

export const data = new SlashCommandBuilder()
  .setName('awardpoint')
  .setDescription('Award points to a user (Admin only)')
  .addUserOption(option => option.setName('user').setDescription('User to award points to').setRequired(true))
  .addIntegerOption(option => option.setName('amount').setDescription('Amount of points').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const targetUser = await interaction.client.users.fetch(interaction.options.get('user')?.value as string);
  const amount = interaction.options.get('amount')?.value as number;
  const pointsManager = PointsManager.getInstance();
  await pointsManager.addPoints(targetUser.id, targetUser.username, amount);
  await interaction.editReply(`Awarded ${amount} points to ${targetUser.username}!`);
}
```

### Adding a New Command

1. **Create Command File**:
   - Add a new file in `src/commands` (e.g., `myCommand.ts`).

2. **Define the Command**:
   - Implement the required exports:

     ```typescript
     import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

     export const data = new SlashCommandBuilder()
       .setName('hello')
       .setDescription('Say hello to a user')
       .addUserOption(option => option.setName('user').setDescription('The user to greet').setRequired(true));

     export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
       const user = interaction.options.getUser('user', true);
       await interaction.reply(`Hello, ${user}! How’s it going?`);
     }
     ```

3. **Handle Button Interactions (Optional)**:
   - If the command uses buttons, add a `handleButtonInteraction` function and update `CommandHandler.ts`:

     ```typescript
     export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
       if (interaction.customId === 'hello_button') {
         await interaction.reply('Hello again!');
       }
     }
     ```

     In `CommandHandler.ts`, add logic to route the button interaction:

     ```typescript
     public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
       let commandName: string | undefined;
       if (interaction.customId === 'hello_button') {
         commandName = 'hello';
       }
       if (commandName) {
         const command = this.commands.get(commandName);
         if (command?.handleButtonInteraction) {
           await command.handleButtonInteraction(interaction);
         }
       }
     }
     ```

4. **Automatic Registration**:
   - The `CommandHandler` class in `src/CommandHandler.ts` automatically loads and registers commands from `src/commands` when the bot starts. No manual registration is needed unless button interactions are involved.

### Modularity of Commands

- **Separation**: Each command is a standalone file, making it easy to add, remove, or modify commands without affecting others.
- **Integration with Modules**: Commands often interact with modules (e.g., `awardPointCommand.ts` uses `PointsManager` from `pointsModule`), leveraging their functionality.

---

## Interaction Between Components

- **Chatbot and Modules**: The chatbot’s tools can invoke module functions, such as generating images via `imageGenModule`.
- **Commands and Modules**: Commands act as user-facing interfaces to module features. For example, the `imagine` command uses `imageGenModule` to generate images.
- **Cross-Module Communication**: Modules share utilities or call each other’s exported functions, enabling complex workflows (e.g., a command triggering a vote that uses chatbot tools).

By mastering these components—configs, modules, the chatbot with function calling, and commands—you can fully customize and extend this Discord bot to enhance your community’s experience.