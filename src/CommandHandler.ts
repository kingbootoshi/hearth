import { Client, Message, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonComponent, ButtonInteraction } from 'discord.js';

interface TreasureData {
  prizeName: string;
  claimed: boolean;
  claimedBy?: string;
}

export class CommandHandler {
  private commands: Map<string, (message: Message, args: string[]) => Promise<void>>;
  private treasures: Map<string, TreasureData> = new Map();

  constructor(private client: Client) {
    this.commands = new Map();
    this.registerCommands();
    this.setupButtonHandler();
  }

  private registerCommands(): void {
    this.commands.set('treasure', this.treasureCommand.bind(this));
  }

  public async handleMessage(message: Message): Promise<void> {
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (command && this.commands.has(command)) {
      await this.commands.get(command)!(message, args);
    }
  }

  private async treasureCommand(message: Message, args: string[]): Promise<void> {
    // Check if the user has permission to use this command
    if (!message.member?.permissions.has('ManageMessages')) {
      await message.reply('You do not have permission to use this command.');
      return;
    }

    // Check if all required arguments are provided

    if (args.length < 4) {
        await message.reply('Usage: !treasure <channelID> <prizeName> <imageURL> <description>');
        return;
      }
    
    // Parse arguments, respecting quoted strings
    const parsedArgs = message.content.slice(message.content.indexOf(' ') + 1).match(/("[^"]+"|[^\s"]+)/g);
    
    if (!parsedArgs || parsedArgs.length < 4) {
        await message.reply('Usage: !treasure <channelID> "<prizeName>" <imageURL> <description>');
        return;
    }

    const channelId = parsedArgs.shift()!.replace(/"/g, '');
    const prizeName = parsedArgs.shift()!.replace(/"/g, '');
    const imageUrl = parsedArgs.shift()!.replace(/"/g, '');
    const description = parsedArgs.join(' ').replace(/"/g, '');

    // Create the treasure embed
    const treasureEmbed = new EmbedBuilder()
        .setTitle(`🎁 New Treasure: ${prizeName}`)
        .setDescription(description)
        .setColor('#FFD700')
        .setTimestamp();

    // Set image only if URL is valid
    try {
        new URL(imageUrl);
        treasureEmbed.setImage(imageUrl);
    } catch (error) {
        console.warn('Invalid image URL:', imageUrl);
        await message.reply('The provided image URL is invalid. The treasure will be created without an image.');
    }
        
      // Get the specified channel
      const channel = this.client.channels.cache.get(channelId) as TextChannel;
    
      if (!channel || !(channel instanceof TextChannel)) {
        await message.reply('Invalid channel ID or not a text channel.');
        return;
      }
    
      // Create the claim button
      const buttonId = `claim_${Date.now()}`;
      const claimButton = new ButtonBuilder()
        .setCustomId(buttonId)
        .setLabel('Claim Treasure')
        .setStyle(ButtonStyle.Primary);
    
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimButton);
    
      // Send the message to the specified channel
      try {
        // Send the embed and button
        const sentMessage = await channel.send({
          embeds: [treasureEmbed],
          components: [row]
        });
    
        // Store the treasure data
        this.treasures.set(buttonId, {
          prizeName,
          claimed: false
        });
    
        await message.reply(`Treasure message sent to <#${channelId}>`);
      } catch (error) {
        console.error('Error sending treasure message:', error);
        await message.reply('An error occurred while sending the treasure message.');
      }
    }

  private setupButtonHandler(): void {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const { customId } = interaction;
      const treasureData = this.treasures.get(customId);

      if (treasureData && !treasureData.claimed) {
        await this.handleTreasureClaim(interaction, treasureData);
      }
    });
  }

  private async handleTreasureClaim(interaction: ButtonInteraction, treasureData: TreasureData): Promise<void> {
    treasureData.claimed = true;
    treasureData.claimedBy = interaction.user.username;

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setTitle(`🎉 Treasure Claimed: ${treasureData.prizeName}`)
      .setDescription(`This treasure has been claimed by ${interaction.user.username}!`);

      const disabledButton = ButtonBuilder.from(interaction.message.components[0].components[0] as ButtonComponent)
      .setDisabled(true)
      .setLabel('Claimed');

    const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

    await interaction.update({
      embeds: [updatedEmbed],
      components: [updatedRow]
    });

    await interaction.followUp({
      content: `Congratulations, ${interaction.user.username}! You've claimed the ${treasureData.prizeName}!`,
      ephemeral: true
    });
  }
}