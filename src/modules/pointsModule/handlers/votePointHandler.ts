import { ButtonInteraction } from 'discord.js';
import { PointsManager } from '../pointsManager';
import { logger } from '../../../utils/logger';

export async function handleVotePoint(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  
  logger.info(`[Points] Attempting to award point to ${username} (${userId}) for voting...`);
  
  try {
    const pointsManager = PointsManager.getInstance();
    logger.info(`[Points] Got PointsManager instance, trying to award point...`);
    
    const result = await pointsManager.tryAwardPoint(userId, username);
    
    // Send an ephemeral message about points
    let message = result.success
      ? `🎉 You earned a point for voting! Total points: ${result.newTotal}`
      : `Error awarding point. Current total: ${result.newTotal}`;
      
    await interaction.followUp({
      content: message,
      ephemeral: true
    });

    logger.info(`[Points] Point award attempt complete for ${username} (${userId}):
      Success: ${result.success}
      New Total: ${result.newTotal}
      Message Sent: ${message}`);
  } catch (error) {
    logger.error(`[Points] Error in handleVotePoint for ${username} (${userId}):`, error);
    // Don't send error to user since this is a followup to voting
  }
} 