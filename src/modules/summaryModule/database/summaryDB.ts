import { supabase } from '../../../utils/supabase/client';

// Table: messages
// Table: hourly_summaries
// Table: daily_summaries

/**
 * Inserts an individual message into Supabase.
 * @param message An object with 'username' and 'content'
 */
export async function insertMessage(message: { username: string; content: string }): Promise<void> {
  try {
    await supabase.from('temp_alpha_messages').insert([{ username: message.username, content: message.content }]);
  } catch (error) {
    console.error('Error inserting temp_alpha_messages:', error);
  }
}

/**
 * Retrieves all messages that have not been summarized yet.
 */
export async function getMessages(): Promise<Array<{ username: string; content: string }>> {
  try {
    const { data, error } = await supabase.from('temp_alpha_messages').select('*');
    if (error) {
      console.error('Error retrieving temp_alpha_messages:', error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error('Error in getMessages:', error);
    return [];
  }
}

/**
 * Clears out all messages after summarizing them.
 */
export async function clearMessages(): Promise<void> {
  try {
    await supabase.from('temp_alpha_messages').delete().neq('id', 0); // deletes all rows
  } catch (error) {
    console.error('Error clearing messages:', error);
  }
}

/**
 * Inserts an hourly summary into Supabase.
 */
export async function insertHourlySummary(summary: string): Promise<void> {
  try {
    await supabase.from('hourly_summaries').insert([{ summary }]);
  } catch (error) {
    console.error('Error inserting hourly summary:', error);
  }
}

/**
 * Retrieves all hourly summaries that have not yet been summarized into a daily summary.
 */
export async function getHourlySummaries(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('hourly_summaries').select('summary');
    if (error) {
      console.error('Error retrieving hourly summaries:', error);
      return [];
    }
    // Return only the 'summary' field
    return data ? data.map((item: { summary: string }) => item.summary) : [];
  } catch (error) {
    console.error('Error in getHourlySummaries:', error);
    return [];
  }
}

/**
 * Clears out hourly summaries after creating a daily summary.
 */
export async function clearHourlySummaries(): Promise<void> {
  try {
    await supabase.from('hourly_summaries').delete().neq('id', 0);
  } catch (error) {
    console.error('Error clearing hourly summaries:', error);
  }
}

/**
 * Inserts a daily summary into Supabase.
 * @param summary The final daily summary content
 */
export async function insertDailySummary(summary: string): Promise<void> {
  try {
    await supabase.from('daily_summaries').insert([{ summary }]);
  } catch (error) {
    console.error('Error inserting daily summary:', error);
  }
}
