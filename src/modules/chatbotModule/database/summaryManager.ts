import { supabase } from '../../../utils/supabase/client';
import { condenseSummaries } from '../memory/memoryAITools';
import { createModuleLogger } from '../../../utils/logger';
const logger = createModuleLogger('summaryManager');

interface SummaryRecord {
  summary: string;
  archived: boolean;
}

// Run the 3-2-1 pipeline:
// After 3 short-term summaries, condense into 1 mid-term summary and archive them
// After 2 mid-term summaries, condense into 1 long-term summary and archive them
export async function runSummaryPipeline() {
  logger.info('Starting summary pipeline');

  // Check short-term summaries
  let { data: shortUnarchived } = await supabase.from('short_term_summaries')
    .select('*')
    .eq('archived', false)
    .order('timestamp', { ascending: true });

  shortUnarchived = shortUnarchived || [];

  // If we have 3 unarchived short-term, condense into mid-term
  if (shortUnarchived.length >= 3) {
    const toCondense = shortUnarchived.slice(0, 3);
    const summariesToCondense = toCondense.map((s: SummaryRecord) => s.summary);
    const newMidTerm = await condenseSummaries(summariesToCondense, 'mid_term', 'Condensing 3 short-term summaries into a mid-term summary.');

    // Archive those 3 short-term
    for (let s of toCondense) {
      s.archived = true;
    }
    await supabase.from('short_term_summaries').upsert(toCondense);

    // Save mid-term summary
    await supabase.from('mid_term_summaries').insert([{
      timestamp: new Date().toISOString(),
      summary: newMidTerm,
      archived: false
    }]);
  }

  // Check mid-term
  let { data: midUnarchived } = await supabase.from('mid_term_summaries')
    .select('*')
    .eq('archived', false)
    .order('timestamp', { ascending: true });

  midUnarchived = midUnarchived || [];

  // If we have 2 unarchived mid-term, condense into long-term
  if (midUnarchived.length >= 2) {
    const toCondense = midUnarchived.slice(0, 2);
    const summariesToCondense = toCondense.map((m: SummaryRecord) => m.summary);
    const newLongTerm = await condenseSummaries(summariesToCondense, 'long_term', 'Condensing 2 mid-term summaries into a long-term summary.');

    // Archive those 2 mid-term
    for (let m of toCondense) {
      m.archived = true;
    }
    await supabase.from('mid_term_summaries').upsert(toCondense);

    // Save or update long-term summary
    let { data: longData } = await supabase.from('long_term_summaries').select('*');
    longData = longData || [];
    if (longData.length > 0) {
      // Combine with existing long-term summary
      const existing = longData[longData.length - 1];
      const combined = await condenseSummaries([existing.summary, newLongTerm], 'long_term');
      existing.summary = combined;
      existing.timestamp = new Date().toISOString();
      await supabase.from('long_term_summaries').upsert(existing);
    } else {
      await supabase.from('long_term_summaries').insert([{
        timestamp: new Date().toISOString(),
        summary: newLongTerm
      }]);
    }
  }

  logger.info('Finished summary pipeline');
}

export async function generateConversationSummary(conversation: any) {
  logger.info('Generating conversation summary');
  try {
    // ... existing code ...
    logger.debug({ conversationLength: conversation.length }, 'Conversation length');
    // ... existing code ...

    logger.info('Finished generating conversation summary');
  } catch (error) {
    logger.error({ err: error }, 'Error generating summary');
    throw error;
  }
}