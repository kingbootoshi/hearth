import { supabase } from '../../../utils/supabase/client';
import { logger } from '../../../utils/logger';

// Interface for points data
export interface PointsData {
  user_id: string;
  username: string;
  points: number;
  last_updated: Date;
}

// Save or update points for a user
export async function savePoints(data: PointsData): Promise<void> {
  const { user_id, username, points, last_updated } = data;
  
  logger.info(`[Points DB] Attempting to save points for ${username} (${user_id}):
    Points: ${points}
    Last Updated: ${last_updated}`);

  // The key fix is adding onConflict: 'user_id'
  const { error } = await supabase
    .from('user_points')
    .upsert(
      {
        user_id,
        username,
        points,
        last_updated: last_updated.toISOString()
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    logger.error('[Points DB] Error saving points:', error);
    throw error;
  }

  logger.info(`[Points DB] Successfully saved points for ${username}`);
}

// Get points for a specific user
export async function getPoints(userId: string): Promise<PointsData | null> {
  logger.info(`[Points DB] Fetching points for user ${userId}`);
  
  const { data, error } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    logger.error('[Points DB] Error getting points:', error);
    return null;
  }

  if (!data) {
    logger.info(`[Points DB] No points found for user ${userId}`);
    return null;
  }

  // Convert ISO string back to Date
  const pointsData = {
    ...data,
    last_updated: new Date(data.last_updated)
  };

  logger.info(`[Points DB] Retrieved points for user ${userId}:
    Points: ${pointsData.points}
    Last Updated: ${pointsData.last_updated}`);

  return pointsData;
}

// Get leaderboard (top users by points)
export async function getLeaderboard(limit: number = 10): Promise<PointsData[]> {
  logger.info(`[Points DB] Fetching leaderboard (limit: ${limit})`);
  
  const { data, error } = await supabase
    .from('user_points')
    .select('*')
    .order('points', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[Points DB] Error getting leaderboard:', error);
    return [];
  }

  // Convert ISO strings back to Dates
  const leaderboard = (data || []).map((entry: { user_id: string; username: string; points: number; last_updated: string }) => ({
    ...entry,
    last_updated: new Date(entry.last_updated)
  }));

  logger.info(`[Points DB] Retrieved leaderboard with ${leaderboard.length} entries`);
  return leaderboard;
}