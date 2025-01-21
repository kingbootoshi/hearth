// Command to display the points leaderboard
import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ButtonInteraction } from 'discord.js';
import { getLeaderboard } from '../modules/pointsModule/database/pointsDB';
import { logger } from '../utils/logger';

// Constants for pagination
const USERS_PER_PAGE = 25; // Will be changed to 25 later

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show the points leaderboard');

// Helper function to get position emoji
function getPosition(position: number): string {
  switch (position) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return `${position}.`;
  }
}

// Helper function to create leaderboard embed
function createLeaderboardEmbed(leaderboardData: Array<{ username: string; points: number }>, page: number, totalPages: number): EmbedBuilder {
  const startIndex = (page - 1) * USERS_PER_PAGE;
  const pageData = leaderboardData.slice(startIndex, startIndex + USERS_PER_PAGE);

  return new EmbedBuilder()
    .setTitle('🏆 Points Leaderboard')
    .setColor('#FFD700')
    .setDescription(
      pageData.length === 0
        ? 'No points recorded yet!'
        : pageData
            .map(
              (entry, index) =>
                `${getPosition(startIndex + index + 1)} **${entry.username}**: ${entry.points} points`
            )
            .join('\n')
    )
    .setTimestamp()
    .setFooter({ 
      text: `Page ${page} of ${totalPages} • Total Users: ${leaderboardData.length}` 
    });
}

// Helper function to create navigation buttons
function createNavigationButtons(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  // Previous page button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`leaderboard_prev_${currentPage}`)
      .setLabel('◀️ Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage <= 1)
  );

  // Page indicator button (non-functional, just shows current page)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('leaderboard_page')
      .setLabel(`Page ${currentPage}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  // Next page button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`leaderboard_next_${currentPage}`)
      .setLabel('Next ▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage >= totalPages)
  );

  return row;
}

export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    await interaction.deferReply();

    // Get all leaderboard data
    const leaderboardData = await getLeaderboard();
    const totalPages = Math.ceil(leaderboardData.length / USERS_PER_PAGE);
    const currentPage = 1;

    // Create embed and buttons for first page
    const embed = createLeaderboardEmbed(leaderboardData, currentPage, totalPages);
    const row = createNavigationButtons(currentPage, totalPages);

    await interaction.editReply({ 
      embeds: [embed],
      components: totalPages > 1 ? [row] : [] 
    });

    logger.info(`Leaderboard displayed page ${currentPage}/${totalPages} with ${leaderboardData.length} total entries`);
  } catch (error) {
    logger.error('Error displaying leaderboard:', error);
    await interaction.editReply({
      content: 'Sorry, there was an error displaying the leaderboard.'
    });
  }
}

// Handle button interactions
export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferUpdate();

    const [_, action, currentPageStr] = interaction.customId.split('_');
    let currentPage = parseInt(currentPageStr);
    
    // Get all leaderboard data
    const leaderboardData = await getLeaderboard();
    const totalPages = Math.ceil(leaderboardData.length / USERS_PER_PAGE);

    // Calculate new page based on action
    if (action === 'prev') {
      currentPage = Math.max(1, currentPage - 1);
    } else if (action === 'next') {
      currentPage = Math.min(totalPages, currentPage + 1);
    }

    // Create new embed and buttons
    const embed = createLeaderboardEmbed(leaderboardData, currentPage, totalPages);
    const row = createNavigationButtons(currentPage, totalPages);

    await interaction.editReply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : []
    });

    logger.info(`Leaderboard navigation: moved to page ${currentPage}/${totalPages}`);
  } catch (error) {
    logger.error('Error handling leaderboard navigation:', error);
    await interaction.followUp({
      content: 'Sorry, there was an error navigating the leaderboard.',
      ephemeral: true
    });
  }
} 