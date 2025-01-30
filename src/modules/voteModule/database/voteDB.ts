import { supabase } from '../../../utils/supabase/client';
import { logger } from '../../../utils/logger';

export interface DailyVoteRow {
  id?: number;
  day_date: string;         // e.g. '2025-01-21'
  is_active: boolean;
  started_at: string;       // timestamp
  ended_at?: string | null; // timestamp
  images: any;              // JSON array of vote entries
  winner_image?: string;
  winner_caption?: string;
  message_id?: string;      // NEW FIELD for storing the Discord message ID
}

/**
 * Fetch the active daily vote row (if any).
 */
export async function getActiveDailyVote(): Promise<DailyVoteRow | null> {
  logger.debug('[voteDB] getActiveDailyVote called');
  const { data, error } = await supabase
    .from('daily_votes')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error) {
    logger.error('[voteDB] Error in getActiveDailyVote:', error);
    return null;
  }
  return data || null;
}

/**
 * Create a new daily vote row for a given day.
 */
export async function createDailyVote(dayDate: string, images: any): Promise<DailyVoteRow | null> {
  logger.debug(`[voteDB] createDailyVote for dayDate=${dayDate}`);
  const startedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('daily_votes')
    .insert({
      day_date: dayDate,
      is_active: true,
      started_at: startedAt,
      images,
    })
    .select()
    .single();

  if (error) {
    logger.error('[voteDB] Error creating daily vote:', error);
    return null;
  }

  logger.info('[voteDB] Created new daily vote:', data);
  return data;
}

/**
 * Update the daily vote row to store the Discord messageId once we’ve sent the message.
 */
export async function updateDailyVoteMessageId(id: number, messageId: string): Promise<void> {
  logger.debug(`[voteDB] updateDailyVoteMessageId for id=${id}, messageId=${messageId}`);
  const { error } = await supabase
    .from('daily_votes')
    .update({ message_id: messageId })
    .eq('id', id);

  if (error) {
    logger.error('[voteDB] Error updating daily vote message_id:', error);
  } else {
    logger.info('[voteDB] Successfully stored message_id on daily vote row');
  }
}

/**
 * Finalize an existing daily vote: set is_active=false, ended_at=now,
 * store winner_image and winner_caption.
 */
export async function finalizeDailyVote(
  id: number,
  winnerImage: string,
  winnerCaption: string
): Promise<boolean> {
  logger.debug(`[voteDB] finalizeDailyVote for id=${id}`);
  const endedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('daily_votes')
    .update({
      is_active: false,
      ended_at: endedAt,
      winner_image: winnerImage,
      winner_caption: winnerCaption,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('[voteDB] Error finalizing daily vote:', error);
    return false;
  }

  logger.info('[voteDB] Successfully finalized daily vote:', data);
  return true;
}
