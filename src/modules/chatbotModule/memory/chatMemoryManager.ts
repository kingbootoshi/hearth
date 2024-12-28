import { supabase } from '../../../utils/supabase/client';
import { EmbedBuilder, Client, TextChannel } from 'discord.js';
import pino from 'pino';

interface ChatMessage {
  user_id: string;
  username: string;
  content: string;
  timestamp: string; 
  is_bot: boolean;
}

const logger = pino({ name: 'chatMemoryManager', level: 'debug' });

export class ChatMemoryManager {
  private max_messages: number;
  private client: Client;

  constructor(client: Client, max_messages: number = 30) {
    this.client = client;
    this.max_messages = max_messages;
  }

  async addMessage(messageData: ChatMessage): Promise<void|{extracted_knowledge: any}> {
    // Insert the message into Supabase
    await supabase.from('chat_history').insert(messageData);
    const count = await this.getMessageCount();
    if (count >= this.max_messages) {
      // Trigger processing
      const extracted = await this.processChatHistory();
      return extracted;
    }
  }

  async getMessageCount(): Promise<number> {
    const { count } = await supabase.from('chat_history').select('*', { count: 'exact', head: true });
    return count || 0;
  }

  async getAllMessages(): Promise<ChatMessage[]> {
    const { data } = await supabase
      .from('chat_history')
      .select('*')
      .order('timestamp', { ascending: true });
    return data || [];
  }

  async archiveMessages(messagesToArchive: ChatMessage[]) {
    // Insert into archive
    if (messagesToArchive.length > 0) {
      await supabase.from('chat_history_archive').insert(messagesToArchive);
      const timestamps = messagesToArchive.map(m => m.timestamp);
      // Delete them from chat_history
      await supabase.from('chat_history').delete().in('timestamp', timestamps);
    }
  }

  async processChatHistory(): Promise<{extracted_knowledge: any}> {

    logger.info('Processing chat history');
    // Load entire current chat_history
    const current_history = await this.getAllMessages();
    const messages_to_archive = current_history.slice(0, current_history.length - 2);
    if (messages_to_archive.length > 0) {
      await this.archiveMessages(messages_to_archive);
    }

    // After archiving, we have last two messages still in chat_history
    // Extract knowledge
    const { extractChatKnowledge } = await import('./memoryAITools');
    const extracted_knowledge = await extractChatKnowledge(current_history);
    logger.debug({ extracted_knowledge }, "Extracted knowledge");

    // Store extracted knowledge in mem0 and database
    await this.saveExtractedKnowledge(extracted_knowledge);
    await this.saveSummary(extracted_knowledge);

    return { extracted_knowledge };
  }

  async saveExtractedKnowledge(extracted_knowledge: any) {
    // First save to database
    await supabase.from('extracted_knowledge').insert({
      timestamp: new Date().toISOString(),
      extracted_data: extracted_knowledge
    });

    // Format memories for mem0 storage
    const formattedMemories = {
      general_knowledge: Array.isArray(extracted_knowledge.general_knowledge) 
        ? extracted_knowledge.general_knowledge.map((m: string) => ({ memory: m }))
        : [],
      agent_self: Array.isArray(extracted_knowledge.agent_self)
        ? extracted_knowledge.agent_self.map((m: string) => ({ memory: m }))
        : [],
      user_specific: extracted_knowledge.user_specific?.users?.map((user: any) => ({
        user_id: user.user_id,
        memories: Array.isArray(user.learnings) 
          ? user.learnings.map((m: string) => ({ memory: m }))
          : []
      })) || []
    };

    // Store in mem0
    const { storeKnowledgeInMem0 } = await import('./memoryProcessor');
    await storeKnowledgeInMem0(formattedMemories, this.client);

    logger.debug({ formattedMemories }, 'Formatted and stored memories in mem0');
  }

  async saveSummary(extracted_knowledge: any) {
    // Insert short term summary
    const summary = extracted_knowledge.summary || "No summary available";
    await supabase.from('short_term_summaries').insert([{
      timestamp: new Date().toISOString(),
      summary: summary,
      archived: false
    }]);

    const { runSummaryPipeline } = await import('./summaryManager');
    await runSummaryPipeline();
  }

  async formatRecentSummariesForPrompt(): Promise<string> {
    function parseTimestamp(ts: string): Date {
      try {
        return new Date(ts);
      } catch {
        return new Date();
      }
    }

    let sections: string[] = [];
    const now = new Date();
    sections.push(`Current UTC Time: ${now.toUTCString()}\n`);

    // Long-term summary
    let { data: longData } = await supabase
      .from('long_term_summaries')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(1);
    if (longData && longData.length > 0) {
      let lts = longData[0];
      const t = parseTimestamp(lts.timestamp);
      sections.push("## Long-Term Summary:");
      sections.push(`${t.toLocaleString()} - ${lts.summary}`);
    }

    // Mid-term summaries (most recent 2 unarchived)
    let { data: midData } = await supabase
      .from('mid_term_summaries')
      .select('*')
      .eq('archived', false)
      .order('timestamp', { ascending: false })
      .limit(2);
    if (midData && midData.length > 0) {
      sections.push("\n## Recent Mid-Term Summaries:");
      for (let i = midData.length - 1; i >= 0; i--) {
        const mts = midData[i];
        const t = parseTimestamp(mts.timestamp);
        sections.push(`${t.toLocaleString()} - ${mts.summary}`);
      }
    }

    // Short-term summaries (most recent 3 unarchived)
    let { data: shortData } = await supabase
      .from('short_term_summaries')
      .select('*')
      .eq('archived', false)
      .order('timestamp', { ascending: false })
      .limit(3);
    if (shortData && shortData.length > 0) {
      sections.push("\n## Latest Short-Term Summaries:");
      for (let i = shortData.length - 1; i >= 0; i--) {
        const sts = shortData[i];
        const t = parseTimestamp(sts.timestamp);
        sections.push(`${t.toLocaleString()} - ${sts.summary}`);
      }
    }

    return sections.join("\n");
  }

}