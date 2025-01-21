// Command to check points for yourself or another user
import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, EmbedBuilder, User } from 'discord.js';
import { getPoints } from '../modules/pointsModule/database/pointsDB';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('points')
  .setDescription('Check your points or another user\'s points')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to check points for (defaults to yourself)')
      .setRequired(false)
  );

export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    await interaction.deferReply();

    // Get target user (either mentioned user or command user)
    const targetUser = (interaction.options.get('user')?.value
      ? await interaction.client.users.fetch(interaction.options.get('user')?.value as string)
      : interaction.user) as User;

    // Get points data
    const pointsData = await getPoints(targetUser.id);
    const points = pointsData?.points || 0;

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('💫 Points Check')
      .setColor('#4CAF50')
      .setDescription(
        targetUser.id === interaction.user.id
          ? `You have **${points} points**!`
          : `**${targetUser.username}** has **${points} points**!`
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp()
      .setFooter({ 
        text: 'Points are earned by participating in votes!' 
      });

    await interaction.editReply({ embeds: [embed] });
    
    logger.info(`Points checked for user ${targetUser.username} (${targetUser.id}): ${points} points`);
  } catch (error) {
    logger.error('Error in points command:', error);
    await interaction.editReply({
      content: 'Sorry, there was an error checking the points.'
    });
  }
} 