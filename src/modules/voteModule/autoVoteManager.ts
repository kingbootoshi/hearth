// src/modules/voteModule/autoVoteManager.ts

import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { submitImageJob } from '../imageGenModule/imageGen';
import { enhancePrompt } from '../imageGenModule/enhancePrompt';
import { handleTwitterPost } from '../chatbotModule/tools/twitterTool';
import { setActiveVote, endVote, VoteEntry, VoteData } from './voteManager';
import { logger } from '../../utils/logger';
import { randomPrompt } from '../imageGenModule/randomPrompt';
import { generateImageCaption } from './captioner';
import { createImagesEmbed, createButtonRows } from './voteEmbedBuilder';
import { 
  getActiveDailyVote, 
  createDailyVote, 
  finalizeDailyVote, 
  DailyVoteRow 
} from './database/voteDB';
import moment from 'moment-timezone';

/**
 * Returns the current date string in PST in "YYYY-MM-DD" format.
 */
function getPSTDateString(): string {
  return moment().tz('America/Los_Angeles').format('YYYY-MM-DD');
}

/**
 * Returns a moment object set to “today at 10:00 AM PST”.
 * If the current PST time is **already** past 10 AM, it uses **tomorrow** at 10 AM PST.
 */
function getNext10AMPST(): moment.Moment {
  const now = moment().tz('America/Los_Angeles');
  const next10AM = now.clone().set({ hour: 10, minute: 0, second: 0, millisecond: 0 });

  // If it's already past 10:00 in PST, schedule for tomorrow
  if (now.isAfter(next10AM)) {
    next10AM.add(1, 'day');
  }
  return next10AM;
}

/**
 * Returns how many milliseconds from "right now" until the next 10 AM PST.
 */
function msUntilNext10AMPST(): number {
  const now = moment().tz('America/Los_Angeles');
  const next10AM = getNext10AMPST();
  return next10AM.diff(now, 'milliseconds');
}

/**
 * The AutoVoteManager runs the daily vote cycle:
 *   - One daily vote for each PST day
 *   - Start around or after 10 AM PST
 *   - End the next day at 10 AM PST
 */
export class AutoVoteManager {
  private static instance: AutoVoteManager;
  private currentTimeout: ReturnType<typeof setTimeout> | null = null;
  private isGenerating = false;
  private dailyVoteRecordId: number | null = null;  // track the active daily_votes.id

  private constructor(private client: Client) {}

  public static getInstance(client: Client): AutoVoteManager {
    if (!AutoVoteManager.instance) {
      AutoVoteManager.instance = new AutoVoteManager(client);
    }
    return AutoVoteManager.instance;
  }

  /**
   * Main entry point: checks DB for any active vote; if it's for today, resume it;
   * if it's for a past day, finalize it. Then either create a new vote if
   * we are past 10 AM PST with no current vote, or schedule creation at 10 AM PST.
   */
  public async start(): Promise<void> {
    logger.info('AutoVoteManager starting up...');
    try {
      const active = await getActiveDailyVote();
      const todayStr = getPSTDateString();

      if (active) {
        logger.info(`Found active daily vote in DB: id=${active.id}, day_date=${active.day_date}`);

        if (active.day_date === todayStr) {
          // We have a vote for today => just resume
          this.dailyVoteRecordId = active.id!;
          logger.info('Resuming today’s vote; scheduling finalize for next 10 AM PST.');
          this.scheduleFinalize();
          return;
        } else {
          // Active row from a past day => finalize it now
          logger.info(`Active vote belongs to older day: ${active.day_date}. Finalizing immediately.`);
          await this.forceFinalizeOldVote(active);
        }
      }

      // Now check if we already have a row for “today” that’s not active:
      // (Edge case: the bot might crash, or we might have ended the vote but not created the next one.)
      const shouldCreateToday = await this.shouldCreateNewVoteToday();
      const nowPST = moment().tz('America/Los_Angeles');
      const hour = nowPST.hour();

      if (shouldCreateToday) {
        if (hour >= 10) {
          // Past 10 AM => create new vote immediately
          logger.info('It is past 10 AM PST, no active row for today => generating new daily vote now.');
          await this.generateAndStartVote();
        } else {
          // Before 10 AM => schedule new vote creation at 10 AM
          logger.info('Before 10 AM PST => scheduling new vote creation at 10 AM PST.');
          this.setNewTimeout(() => this.generateAndStartVote(), msUntilNext10AMPST());
        }
      } else {
        // Already have a daily vote row for today that’s ended or something else => just finalize tomorrow
        logger.info('We already have a record for today or skip. Scheduling next day create at 10 AM PST.');
        const ms = msUntilNext10AMPST();
        this.setNewTimeout(() => this.generateAndStartVote(), ms);
      }
    } catch (error) {
      logger.error(error, 'Error in AutoVoteManager.start()');
    }
  }

  /**
   * Stop the manager: clear the current scheduled timeout.
   */
  public stop(): void {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    logger.info('AutoVoteManager stopped.');
  }

  /**
   * Schedules finalization for the next 10 AM PST, clearing any old timeouts.
   */
  private scheduleFinalize(): void {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    const ms = msUntilNext10AMPST();
    logger.info(`Scheduling daily vote finalize in ${Math.floor(ms / 1000 / 60)} minutes.`);
    this.setNewTimeout(() => this.finalizeVote(), ms);
  }

  /**
   * Helper to ensure we only run one setTimeout at a time.
   */
  private setNewTimeout(fn: () => void, ms: number) {
    this.currentTimeout = setTimeout(fn, ms);
  }

  /**
   * Creates and starts a new vote for **today**:
   *   - generate 4 images
   *   - insert row in daily_votes
   *   - post to Discord, store in memory
   *   - schedule finalize for next 10 AM PST
   */
  private async generateAndStartVote(): Promise<void> {
    if (this.isGenerating) {
      logger.info('Already generating new vote, skipping duplicate call.');
      return;
    }
    this.isGenerating = true;

    try {
      const dayStr = getPSTDateString();
      logger.info(`Generating new daily vote for date=${dayStr}`);

      // Generate 4 images
      const entries: VoteEntry[] = [];
      for (let i = 0; i < 4; i++) {
        try {
          const basePrompt = await randomPrompt();
          const enhancedPrompt = await enhancePrompt(basePrompt);
          const imageUrl = await submitImageJob(enhancedPrompt);
          const finalCaption = await generateImageCaption(imageUrl);

          entries.push({
            imageUrl,
            prompt: enhancedPrompt,
            caption: finalCaption,
            votes: new Set<string>(),
            number: i + 1,
          });
        } catch (err) {
          logger.error(err, 'Error generating image prompt or job');
        }
      }

      if (entries.length === 0) {
        logger.error('No images generated - cannot start vote.');
        return;
      }

      // Insert a new row in daily_votes
      const rowData = await createDailyVote(dayStr, entries);
      if (!rowData?.id) {
        logger.error('Failed to create daily_votes row, aborting daily vote creation.');
        return;
      }
      this.dailyVoteRecordId = rowData.id;

      // Post to Discord
      const channel = await this.client.channels.fetch('1331164045704695830') as TextChannel;
      if (!channel) {
        logger.error('Target channel not found, cannot post daily vote.');
        return;
      }

      const embeds = createImagesEmbed(entries);
      const rows = createButtonRows(entries);
      const message = await channel.send({
        embeds: embeds.map(e => e.toJSON()),
        components: rows,
      });

      // Track in in-memory manager so we can record votes
      const voteData: VoteData = {
        entries,
        endTime: getNext10AMPST().valueOf(), // numeric ms time
        messageId: message.id,
        currentIndex: 0,
        votedUsers: new Set<string>(),
      };
      setActiveVote(message.id, voteData);

      logger.info(`New daily vote posted in #${channel.id}, message=${message.id}`);

      // Finally, schedule finalize
      this.scheduleFinalize();
    } catch (error) {
      logger.error(error, 'generateAndStartVote() failed');
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Called by scheduleFinalize() at next 10 AM PST:
   *   1) picks winner from memory  
   *   2) updates the daily_votes row (finalizeDailyVote)  
   *   3) posts winner to Discord & Twitter  
   *   4) schedules new vote creation for tomorrow at 10 AM PST
   */
  private async finalizeVote(): Promise<void> {
    logger.info('Finalizing the daily vote now...');
    if (!this.dailyVoteRecordId) {
      logger.warn('No dailyVoteRecordId; might have been none started. Scheduling next create...');
      this.scheduleNextVote();
      return;
    }

    // Try to find the best in-memory VoteData
    let winner: VoteEntry | null = null;
    let winnerVotes = 0;

    // Our manager can hold multiple active votes if posted multiple times,
    // so we do a quick scan
    const allVotes = require('./voteManager').getActiveVotes() as Map<string, VoteData>;
    for (const [msgId, data] of allVotes.entries()) {
      if (data.entries) {
        const topEntry = data.entries.reduce((prev, curr) =>
          curr.votes.size > prev.votes.size ? curr : prev
        );
        if (topEntry.votes.size > winnerVotes) {
          winner = topEntry;
          winnerVotes = topEntry.votes.size;
        }
      }
    }

    if (!winner) {
      logger.info('No in-memory winner found. Possibly the bot restarted or no votes. Finalizing with blank winner.');
      await finalizeDailyVote(this.dailyVoteRecordId, '', 'No winner');
      this.dailyVoteRecordId = null;
      this.scheduleNextVote();
      return;
    }

    logger.info(`Found winner with ${winnerVotes} votes, imageUrl=${winner.imageUrl}`);

    // Post the winner to Discord + Twitter
    try {
      const channel = await this.client.channels.fetch('1331164045704695830') as TextChannel;
      const embed = new EmbedBuilder()
        .setTitle('🎉 Winning Image!')
        .setDescription(`${winner.caption}\n\nVotes: ${winnerVotes}`)
        .setImage(winner.imageUrl)
        .setColor('#ff9900');

      if (channel) {
        await channel.send({ embeds: [embed] });
        logger.info('Posted winner in channel.');
      }

      // Tweet
      await handleTwitterPost({
        text: winner.caption,
        image_url: winner.imageUrl,
        channelId: channel?.id || '',
      }, this.client);

      logger.info('Winner tweeted successfully.');

      // Mark daily vote as finished in DB
      await finalizeDailyVote(this.dailyVoteRecordId, winner.imageUrl, winner.caption);
    } catch (err) {
      logger.error(err, 'Error tweeting or posting winner, but finalizing anyway.');
      await finalizeDailyVote(this.dailyVoteRecordId, '', 'Failed to post or tweet winner');
    }

    // Clear current day
    this.dailyVoteRecordId = null;
    // Schedule next day’s vote
    this.scheduleNextVote();
  }

  /**
   * Force-finalize an old “active” vote from a previous day if we find it on startup.
   */
  private async forceFinalizeOldVote(oldRow: DailyVoteRow): Promise<void> {
    try {
      // Just finalize with empty winner or reuse any stored fields
      await finalizeDailyVote(
        oldRow.id!,
        oldRow.winner_image || '',
        oldRow.winner_caption || 'Missed finalization – forced on startup'
      );
    } catch (err) {
      logger.error(err, 'Error forcibly finalizing old daily vote');
    }
  }

  /**
   * Schedules creation of the *next day’s* vote at 10 AM PST.
   */
  private scheduleNextVote() {
    logger.info('Scheduling the next day’s vote creation at 10 AM PST...');
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    const ms = msUntilNext10AMPST();
    this.setNewTimeout(() => this.generateAndStartVote(), ms);
  }

  /**
   * Checks if we “should” create a new vote for today or not.
   * If there's *already* a row (active or ended) for today’s date, returns false.
   * If no row for today, returns true.
   */
  private async shouldCreateNewVoteToday(): Promise<boolean> {
    const todayStr = getPSTDateString();
    // Attempt to see if there's any daily_votes row for today
    // (Doesn’t matter if is_active or not—if it exists, we do not create a new one.)
    const { data, error } = await require('../../utils/supabase/client').supabase
      .from('daily_votes')
      .select('*')
      .eq('day_date', todayStr)
      .single();

    if (error) {
      logger.warn(error, 'Error checking for existing daily_votes row for today, defaulting to TRUE');
      return true; 
    }
    if (data) {
      logger.info(`A daily_votes row already exists for day_date=${todayStr}. Not creating a new one.`);
      return false; 
    }
    return true;
  }
}
