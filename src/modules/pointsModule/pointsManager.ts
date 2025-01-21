import { PointsData, savePoints, getPoints } from './database/pointsDB';
import { logger } from '../../utils/logger';

export class PointsManager {
  private static instance: PointsManager;

  private constructor() {}

  public static getInstance(): PointsManager {
    if (!PointsManager.instance) {
      PointsManager.instance = new PointsManager();
    }
    return PointsManager.instance;
  }

  // Award a point (100% chance)
  public async tryAwardPoint(userId: string, username: string): Promise<{
    success: boolean;
    newTotal: number;
  }> {
    logger.info(`[Points] tryAwardPoint called for ${username} (${userId})`);
    // Always award point
    return this.addPoint(userId, username);
  }

  // Add a custom amount of points to the user's total
  public async addPoints(userId: string, username: string, amount: number): Promise<{
    success: boolean;
    newTotal: number;
  }> {
    try {
      logger.info(`[Points] Getting current points for ${username} (${userId})...`);
      const currentData = await getPoints(userId);
      const currentPoints = currentData?.points || 0;
      const newPoints = currentPoints + amount;

      logger.info(`[Points] Current points: ${currentPoints}, awarding ${amount} points...`);

      await savePoints({
        user_id: userId,
        username,
        points: newPoints,
        last_updated: new Date()
      });

      logger.info(`[Points] Successfully saved new points (${newPoints}) for ${username}`);

      return {
        success: true,
        newTotal: newPoints
      };
    } catch (error) {
      logger.error(`[Points] Error adding points for ${username} (${userId}):`, error);
      const currentPoints = await this.getCurrentPoints(userId);
      return {
        success: false,
        newTotal: currentPoints
      };
    }
  }

  // Add a single point to the user's total
  public async addPoint(userId: string, username: string): Promise<{
    success: boolean;
    newTotal: number;
  }> {
    return this.addPoints(userId, username, 1);
  }

  // Remove a point from the user's total
  public async removePoint(userId: string, username: string): Promise<{
    success: boolean;
    newTotal: number;
  }> {
    try {
      logger.info(`[Points] Getting current points for ${username} (${userId})...`);
      const currentData = await getPoints(userId);
      const currentPoints = currentData?.points || 0;
      const newPoints = Math.max(0, currentPoints - 1); // Don't go below 0

      logger.info(`[Points] Current points: ${currentPoints}, removing 1 point...`);

      await savePoints({
        user_id: userId,
        username,
        points: newPoints,
        last_updated: new Date()
      });

      logger.info(`[Points] Successfully saved new points (${newPoints}) for ${username}`);

      return {
        success: true,
        newTotal: newPoints
      };
    } catch (error) {
      logger.error(`[Points] Error removing point for ${username} (${userId}):`, error);
      const currentPoints = await this.getCurrentPoints(userId);
      return {
        success: false,
        newTotal: currentPoints
      };
    }
  }

  // Get current points for a user
  private async getCurrentPoints(userId: string): Promise<number> {
    try {
      const data = await getPoints(userId);
      const points = data?.points || 0;
      logger.info(`[Points] Retrieved current points (${points}) for user ${userId}`);
      return points;
    } catch (error) {
      logger.error(`[Points] Error getting current points for ${userId}:`, error);
      return 0;
    }
  }
} 