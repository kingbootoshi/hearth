import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { submitImageJob } from '../imageGenModule/imageGen';
import { enhancePrompt } from '../imageGenModule/enhancePrompt';
import { handleTwitterPost } from '../chatbotModule/tools/twitterTool';
import { setActiveVote, endVote, getActiveVote, VoteEntry, VoteData } from './voteManager';
import { logger } from '../../utils/logger';
import { randomPrompt } from '../imageGenModule/randomPrompt';
import { generateImageCaption } from './captioner';
import { createImagesEmbed, createButtonRows } from './voteEmbedBuilder';
import {
  getActiveDailyVote,
  createDailyVote,
  finalizeDailyVote,
  DailyVoteRow,
  updateDailyVoteMessageId
} from './database/voteDB';
import moment from 'moment-timezone';
import { voteConfig } from '../../config/voteConfig';

function getPSTDateString(): string {
  return moment().tz('America/Los_Angeles').format('YYYY-MM-DD');
}

function getNext10AMPST(): moment.Moment {
  const now = moment().tz('America/Los_Angeles');
  const next10AM = now.clone().set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  if (now.isAfter(next10AM)) {
    next10AM.add(1, 'day');
  }
  return next10AM;
}

function msUntilNext10AMPST(): number {
  const now = moment().tz('America/Los_Angeles');
  const next10AM = getNext10AMPST();
  return next10AM.diff(now, 'milliseconds');
}

export class AutoVoteManager {
  private static instance: AutoVoteManager;
  private currentTimeout: ReturnType<typeof setTimeout> | null = null;
  private isGenerating = false;
  private dailyVoteRecordId: number | null = null;
  private voteChannelId: string;

  private constructor(private client: Client) {
    this.voteChannelId = voteConfig.voteChannelId;
  }

  public static getInstance(client: Client): AutoVoteManager {
    if (!AutoVoteManager.instance) {
      AutoVoteManager.instance = new AutoVoteManager(client);
    }
    return AutoVoteManager.instance;
  }

  public async start(): Promise<void> {
    if (!voteConfig.enabled) {
      logger.info('AutoVoteManager is disabled via config.');
      return;
    }

    logger.info('AutoVoteManager starting up...');
    try {
      const active = await getActiveDailyVote();
      const todayStr = getPSTDateString();

      if (active) {
        logger.info(`Found active daily vote in DB: id=${active.id}, day_date=${active.day_date}`);
        if (active.day_date === todayStr) {
          this.dailyVoteRecordId = active.id!;
          logger.info('Resuming today’s vote; scheduling finalize for next 10 AM PST.');
          this.scheduleFinalize();
          return;
        } else {
          logger.info(`Active vote belongs to older day: ${active.day_date}. Finalizing immediately.`);
          await this.forceFinalizeOldVote(active);
        }
      }

      const shouldCreateToday = await this.shouldCreateNewVoteToday();
      const nowPST = moment().tz('America/Los_Angeles');
      const hour = nowPST.hour();

      if (shouldCreateToday) {
        if (hour >= 10) {
          logger.info('It is past 10 AM PST, no active row for today => generating new daily vote now.');
          await this.generateAndStartVote();
        } else {
          logger.info('Before 10 AM PST => scheduling new vote creation at 10 AM PST.');
          this.setNewTimeout(() => this.generateAndStartVote(), msUntilNext10AMPST());
        }
      } else {
        logger.info('We already have a record for today. Scheduling next day create at 10 AM PST.');
        const ms = msUntilNext10AMPST();
        this.setNewTimeout(() => this.generateAndStartVote(), ms);
      }
    } catch (error) {
      logger.error(error, 'Error in AutoVoteManager.start()');
    }
  }

  public stop(): void {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    logger.info('AutoVoteManager stopped.');
  }

  private scheduleFinalize(): void {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    const ms = msUntilNext10AMPST();
    logger.info(`Scheduling daily vote finalize in ${Math.floor(ms / 1000 / 60)} minutes.`);
    this.setNewTimeout(() => this.finalizeVote(), ms);
  }

  private setNewTimeout(fn: () => void, ms: number) {
    this.currentTimeout = setTimeout(fn, ms);
  }

  private async generateAndStartVote(): Promise<void> {
    if (!voteConfig.enabled) {
      logger.info('Config disabled, skipping generateAndStartVote.');
      return;
    }
    if (this.isGenerating) {
      logger.info('Already generating new vote, skipping duplicate call.');
      return;
    }
    this.isGenerating = true;

    try {
      const dayStr = getPSTDateString();
      logger.info(`Generating new daily vote for date=${dayStr}`);

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

      // Create DB row
      const rowData = await createDailyVote(dayStr, entries);
      if (!rowData?.id) {
        logger.error('Failed to create daily_votes row, aborting daily vote creation.');
        return;
      }
      this.dailyVoteRecordId = rowData.id;

      // Post the vote in Discord
      const channel = await this.client.channels.fetch(this.voteChannelId) as TextChannel;
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

      // Store the poll in memory
      const voteData: VoteData = {
        entries,
        endTime: getNext10AMPST().valueOf(),
        messageId: message.id,
        currentIndex: 0,
        votedUsers: new Set<string>(),
      };
      setActiveVote(message.id, voteData);

      // Update DB with the message ID
      await updateDailyVoteMessageId(rowData.id!, message.id);

      logger.info(`New daily vote posted in #${channel.id}, message=${message.id}`);
      this.scheduleFinalize();
    } catch (error) {
      logger.error(error, 'generateAndStartVote() failed');
    } finally {
      this.isGenerating = false;
    }
  }

  private async finalizeVote(): Promise<void> {
    logger.info('Finalizing the daily vote now...');
    if (!this.dailyVoteRecordId) {
      logger.warn('No dailyVoteRecordId; might have been none started. Scheduling next create...');
      this.scheduleNextVote();
      return;
    }

    // Fetch the row from DB to get the messageId we stored
    // (We assume it's still active.)
    let dailyVoteRow: DailyVoteRow | null = null;
    try {
      const activeRow = await getActiveDailyVote();
      dailyVoteRow = activeRow && activeRow.id === this.dailyVoteRecordId ? activeRow : null;
    } catch (error) {
      logger.error(error, 'Error re-fetching active daily vote row');
    }

    if (!dailyVoteRow?.message_id) {
      logger.info('No daily vote row or missing message_id. Scheduling next day creation...');
      this.scheduleNextVote();
      return;
    }

    // Now get that poll from memory
    const voteData = getActiveVote(dailyVoteRow.message_id);
    if (!voteData) {
      logger.info('No in-memory vote found for message_id=' + dailyVoteRow.message_id);
      // Possibly no votes cast or bot was restarted
      // We'll finalize anyway with no winner
      await finalizeDailyVote(this.dailyVoteRecordId, '', 'No votes cast or poll not found');
      this.dailyVoteRecordId = null;
      this.scheduleNextVote();
      return;
    }

    // Calculate winner from the single poll
    let winner: VoteEntry | null = null;
    let winnerVotes = 0;
    for (const entry of voteData.entries) {
      const count = entry.votes.size;
      if (count > winnerVotes) {
        winner = entry;
        winnerVotes = count;
      }
    }

    if (!winner) {
      logger.info('No one voted, finalizing with blank winner');
      await finalizeDailyVote(this.dailyVoteRecordId, '', 'No winner');
      endVote(dailyVoteRow.message_id);
      this.dailyVoteRecordId = null;
      this.scheduleNextVote();
      return;
    }

    // We have a winner
    logger.info(`Found winner with ${winnerVotes} votes, imageUrl=${winner.imageUrl}`);

    try {
      const channel = await this.client.channels.fetch(this.voteChannelId) as TextChannel;
      const embed = new EmbedBuilder()
        .setTitle('🎉 Winning Image!')
        .setDescription(`${winner.caption}\n\nVotes: ${winnerVotes}`)
        .setImage(winner.imageUrl)
        .setColor('#ff9900');

      if (channel) {
        await channel.send({ embeds: [embed] });
        logger.info('Posted winner in channel.');
      }

      // Tweet it
      await handleTwitterPost({
        text: winner.caption,
        image_url: winner.imageUrl,
        channelId: channel?.id || '',
      }, this.client);

      logger.info('Winner tweeted successfully.');
      await finalizeDailyVote(this.dailyVoteRecordId, winner.imageUrl, winner.caption);
    } catch (err) {
      logger.error(err, 'Error tweeting or posting winner, but finalizing anyway.');
      await finalizeDailyVote(this.dailyVoteRecordId, '', 'Failed to post or tweet winner');
    }

    // Now remove this poll from memory
    endVote(dailyVoteRow.message_id);
    this.dailyVoteRecordId = null;

    // SCHEDULING next day’s poll at 10 AM
    logger.info('Done finalizing current day. Next poll scheduled for tomorrow at 10 AM PST.');
    this.scheduleNextVote();
  }

  private async forceFinalizeOldVote(oldRow: DailyVoteRow): Promise<void> {
    try {
      await finalizeDailyVote(
        oldRow.id!,
        oldRow.winner_image || '',
        oldRow.winner_caption || 'Forced finalize from old day'
      );
    } catch (err) {
      logger.error(err, 'Error forcibly finalizing old daily vote');
    }
  }

  private scheduleNextVote() {
    logger.info('Scheduling the next day’s vote creation at 10 AM PST...');
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    const ms = msUntilNext10AMPST();
    this.setNewTimeout(() => this.generateAndStartVote(), ms);
  }

  private async shouldCreateNewVoteToday(): Promise<boolean> {
    const todayStr = getPSTDateString();
    const { supabase } = require('../../utils/supabase/client');
    const { data, error } = await supabase
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
