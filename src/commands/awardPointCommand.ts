// Command to manually award points to users (admin only)
import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { PointsManager } from '../modules/pointsModule/pointsManager';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('awardpoint')
  .setDescription('Award points to a user (Admin only)')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to award points to')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('amount')
      .setDescription('Amount of points to award')
      .setMinValue(1)
      .setMaxValue(1000)
      .setRequired(true)
  );

export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    await interaction.deferReply();

    // Check if user has admin permission
    if (!interaction.memberPermissions?.has('Administrator')) {
      await interaction.editReply('You need Administrator permission to use this command.');
      return;
    }

    const targetUser = await interaction.client.users.fetch(
      interaction.options.get('user')?.value as string
    );

    // Get points amount (now required)
    const amount = interaction.options.get('amount')?.value as number;

    const pointsManager = PointsManager.getInstance();
    const result = await pointsManager.addPoints(targetUser.id, targetUser.username, amount);

    const pointsText = amount === 1 ? 'point' : 'points';
    const embed = new EmbedBuilder()
      .setTitle('🎯 Points Awarded')
      .setColor('#4CAF50')
      .setDescription(
        result.success
          ? `Successfully awarded **${amount} ${pointsText}** to **${targetUser.username}**!\nNew total: **${result.newTotal} points**`
          : `Failed to award points to **${targetUser.username}**`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    
    logger.info(`${amount} points manually awarded to ${targetUser.username} (${targetUser.id}) by ${interaction.user.username}`);
  } catch (error) {
    logger.error('Error in award point command:', error);
    await interaction.editReply({
      content: 'Sorry, there was an error awarding the points.'
    });
  }
} 