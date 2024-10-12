import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,  // Changed from CommandInteraction
  TextChannel,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonInteraction,
  ButtonStyle,
  ButtonComponent,
} from 'discord.js';

interface TreasureData {
  prizeName: string;
  claimed: boolean;
  claimedBy?: string;
}

const treasures = new Map<string, TreasureData>();

export const data = new SlashCommandBuilder()
  .setName('treasure')
  .setDescription('Create a new treasure for someone to claim')
  .addStringOption(option =>
    option.setName('prize')
      .setDescription('The name of the treasure')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('description')
      .setDescription('Description of the treasure')
      .setRequired(true))
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('Channel to send the treasure to')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('image_url')
      .setDescription('URL of image to include')
      .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const prizeName = interaction.options.getString('prize', true);
  const description = interaction.options.getString('description', true);
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const imageUrl = interaction.options.getString('image_url', false);

  // Create the treasure embed
  const treasureEmbed = new EmbedBuilder()
    .setTitle(`🎁 New Treasure: ${prizeName}`)
    .setDescription(description)
    .setColor('#FFD700')
    .setTimestamp();

  if (imageUrl) {
    if (isValidImageUrl(imageUrl)) {
      treasureEmbed.setImage(imageUrl);
    } else {
      console.warn('Invalid image URL:', imageUrl);
      await interaction.reply({
        content: 'The provided image URL is invalid. The treasure will be created without an image.',
        ephemeral: true,
      });
    }
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
    await channel.send({
      embeds: [treasureEmbed],
      components: [row],
    });

    // Store the treasure data
    treasures.set(buttonId, {
      prizeName,
      claimed: false,
    });

    await interaction.reply({
      content: `Treasure message sent to ${channel.toString()}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error sending treasure message:', error);
    await interaction.reply({
      content: 'An error occurred while sending the treasure message.',
      ephemeral: true,
    });
  }
}

// Function to handle button interactions
export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  const treasureData = treasures.get(customId);

  if (treasureData && !treasureData.claimed) {
    treasureData.claimed = true;
    treasureData.claimedBy = interaction.user.username;

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setTitle(`🎉 Treasure Claimed: ${treasureData.prizeName}`)
      .setDescription(`This treasure has been claimed by ${interaction.user.username}!`);

    const disabledButton = ButtonBuilder.from(
      interaction.message.components[0].components[0] as ButtonComponent
    )
      .setDisabled(true)
      .setLabel('Claimed');

    const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

    await interaction.update({
      embeds: [updatedEmbed],
      components: [updatedRow],
    });

    await interaction.followUp({
      content: `Congratulations, ${interaction.user.username}! You've claimed the ${treasureData.prizeName}!`,
      ephemeral: true,
    });

    // Remove the treasure from the map
    treasures.delete(customId);
  } else {
    await interaction.reply({
      content: 'This treasure has already been claimed or is invalid.',
      ephemeral: true,
    });
  }
}

// Helper function to validate image URLs (simple check)
function isValidImageUrl(url: string): boolean {
  return /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
}