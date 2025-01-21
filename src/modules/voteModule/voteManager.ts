import { Client, ButtonInteraction } from 'discord.js';
import { logger } from '../../utils/logger';

export interface VoteEntry {
  imageUrl: string;
  prompt: string;
  caption: string;
  votes: Set<string>; // Users who voted for this image
  number: number;
}

export interface VoteData {
  entries: VoteEntry[];
  endTime: number;
  messageId: string;
  currentIndex: number;
  votedUsers: Set<string>; // Track who has voted in this poll
}

// Store active votes in memory
const activeVotes = new Map<string, VoteData>();

// Set an active vote
export function setActiveVote(messageId: string, voteData: VoteData): void {
  logger.info({ messageId }, 'Setting active vote');
  activeVotes.set(messageId, voteData);
}

// Get an active vote
export function getActiveVote(messageId: string): VoteData | undefined {
  return activeVotes.get(messageId);
}

// End a vote and return the vote data
export function endVote(messageId: string): VoteData | undefined {
  logger.info({ messageId }, 'Ending vote');
  const voteData = activeVotes.get(messageId);
  activeVotes.delete(messageId);
  return voteData;
}

// Get all active votes
export function getActiveVotes(): Map<string, VoteData> {
  return activeVotes;
}

// Clear all votes (useful for cleanup)
export function clearVotes(): void {
  activeVotes.clear();
}

// Export emoji constants
export const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

// Update vote count for a specific vote
export async function updateVoteCount(messageId: string, voteNumber: number, userId: string): Promise<{
  success: boolean;
  isNewVote: boolean;
}> {
  console.log(`[DEBUG] Processing vote for message ${messageId}`);
  try {
    const voteData = activeVotes.get(messageId);
    if (!voteData) {
      console.log(`[DEBUG] No active vote found`);
      return { success: false, isNewVote: false };
    }

    // Check if vote has ended
    if (Date.now() > voteData.endTime) {
      console.log(`[DEBUG] Vote has ended`);
      endVote(messageId);
      return { success: false, isNewVote: false };
    }

    // Find the entry for this vote number
    const entry = voteData.entries.find(e => e.number === voteNumber);
    if (!entry) {
      console.log(`[DEBUG] Invalid vote number`);
      return { success: false, isNewVote: false };
    }

    // Check if user has already voted in this poll
    const isNewVote = !voteData.votedUsers.has(userId);
    
    // Add vote
    entry.votes.add(userId);
    voteData.votedUsers.add(userId);

    console.log(`[DEBUG] Vote recorded successfully
      User: ${userId}
      Vote Number: ${voteNumber}
      Is New Vote: ${isNewVote}`);

    return { success: true, isNewVote };
  } catch (error) {
    console.error(`[DEBUG] Error processing vote:`, error);
    return { success: false, isNewVote: false };
  }
} 