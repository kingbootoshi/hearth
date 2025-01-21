import { ButtonInteraction, Client } from 'discord.js';
import { logger } from '../../../utils/logger';
import { getActiveVote, updateVoteCount } from '../voteManager';
import { handleVotePoint } from '../../pointsModule/handlers/votePointHandler';

// Handler for vote button interactions
// Manages vote recording, point allocation, and user feedback
export async function handleVoteButton(interaction: ButtonInteraction, client: Client): Promise<void> {
  try {
    console.log(`[DEBUG] Vote button clicked by ${interaction.user.username} (${interaction.user.id})`);
    await interaction.deferReply({ ephemeral: true });
    
    // Get active vote
    const activeVote = await getActiveVote(interaction.message.id);
    if (!activeVote) {
      await interaction.editReply({ content: 'No active vote found for this message.' });
      return;
    }

    // Extract vote number from button ID
    const voteNumber = parseInt(interaction.customId.split('_')[1]);
    if (isNaN(voteNumber)) {
      await interaction.editReply({ content: 'Invalid vote button.' });
      return;
    }

    // Process vote
    console.log(`[DEBUG] Processing vote for image ${voteNumber}`);
    const { success, isNewVote } = await updateVoteCount(
      interaction.message.id,
      voteNumber,
      interaction.user.id
    );

    // If this is a new vote in this poll, award a point
    if (success && isNewVote) {
      try {
        console.log(`[DEBUG] New vote - awarding point to ${interaction.user.username}`);
        await handleVotePoint(interaction);
      } catch (error) {
        console.error(`[DEBUG] Error awarding point:`, error);
        // Continue with vote confirmation even if point award fails
      }
    }

    // Send confirmation message
    const message = success
      ? `Voted for Image ${voteNumber}!${isNewVote ? ' You earned a point!' : ''}`
      : 'This vote has ended.';
    
    console.log(`[DEBUG] Sending response: ${message}`);
    await interaction.editReply({ content: message });

  } catch (error) {
    console.error(`[DEBUG] Error in vote button handler:`, error);
    await interaction.editReply({ 
      content: 'An error occurred while processing your vote. Please try again.' 
    });
  }
}
