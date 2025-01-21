// AutoVoteManager.ts - Manages automated voting cycles for image generation and tweeting
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { submitImageJob } from '../imageGenModule/imageGen';
import { enhancePrompt } from '../imageGenModule/enhancePrompt';
import { handleTwitterPost } from '../chatbotModule/tools/twitterTool';
import { setActiveVote, endVote, VoteEntry, VoteData } from './voteManager';
import { logger } from '../../utils/logger';
import { randomPrompt } from '../imageGenModule/randomPrompt';
import { generateImageCaption } from './captioner';
import { createImagesEmbed, createButtonRows } from './voteEmbedBuilder';

export class AutoVoteManager {
  private static instance: AutoVoteManager;
  private currentVoteTimeout: ReturnType<typeof setTimeout> | null = null;
  private isGenerating: boolean = false;

  private constructor(private client: Client) {}

  public static getInstance(client: Client): AutoVoteManager {
    if (!AutoVoteManager.instance) {
      AutoVoteManager.instance = new AutoVoteManager(client);
    }
    return AutoVoteManager.instance;
  }

  // Calculate time until next 10 AM PST
  private getTimeUntil10AMPST(): number {
    const now = new Date();
    const pstOffset = -7; // PST offset from UTC (not accounting for daylight savings)
    
    // Convert current time to PST
    const pstNow = new Date(now.getTime() + (now.getTimezoneOffset() + pstOffset * 60) * 60000);
    
    // Set target time to 10 AM PST today
    const target = new Date(pstNow);
    target.setHours(10, 0, 0, 0);
    
    // If it's past 10 AM PST, set target to tomorrow
    if (pstNow > target) {
      target.setDate(target.getDate() + 1);
    }
    
    return target.getTime() - now.getTime();
  }

  // Generate images and start a new vote
  private async generateAndStartVote(): Promise<void> {
    if (this.isGenerating) {
      logger.info('Already generating images for a vote, skipping');
      return;
    }

    this.isGenerating = true;
    try {
      const channel = await this.client.channels.fetch('1331164045704695830') as TextChannel;
      if (!channel) {
        throw new Error('Could not find target channel');
      }

      const entries: VoteEntry[] = [];
      
      // Generate 4 images
      for (let i = 0; i < 4; i++) {
        try {
          logger.info({ imageNumber: i + 1 }, 'Starting image generation');
          
          const basePrompt = await randomPrompt();
          const enhancedPrompt = await enhancePrompt(basePrompt);
          const imageUrl = await submitImageJob(enhancedPrompt);
          const finalCaption = await generateImageCaption(imageUrl);
          
          entries.push({
            imageUrl,
            prompt: enhancedPrompt,
            caption: finalCaption,
            votes: new Set<string>(),
            number: i + 1
          });
          
          logger.info({ imageNumber: i + 1, caption: finalCaption }, 'Generated image and caption');
        } catch (error) {
          logger.error({ error, imageNumber: i + 1 }, 'Error generating image');
        }
      }

      if (entries.length === 0) {
        throw new Error('Failed to generate any images');
      }

      // Create and send vote message
      const embeds = createImagesEmbed(entries);
      const rows = createButtonRows(entries);
      const message = await channel.send({
        embeds: embeds.map(embed => embed.toJSON()),
        components: rows
      });

      // Set up vote data
      const voteData: VoteData = {
        entries,
        endTime: Date.now() + this.getTimeUntil10AMPST(),
        messageId: message.id,
        currentIndex: 0,
        votedUsers: new Set<string>()
      };

      setActiveVote(message.id, voteData);

      // Schedule vote end
      this.scheduleVoteEnd(message.id, this.getTimeUntil10AMPST());

      logger.info({
        messageId: message.id,
        endTime: new Date(voteData.endTime).toISOString()
      }, 'Vote started successfully');

    } catch (error) {
      logger.error({ error }, 'Error in generateAndStartVote');
    } finally {
      this.isGenerating = false;
    }
  }

  // Schedule the end of a vote
  private scheduleVoteEnd(messageId: string, delay: number): void {
    if (this.currentVoteTimeout) {
      clearTimeout(this.currentVoteTimeout);
    }

    this.currentVoteTimeout = setTimeout(async () => {
      try {
        const channel = await this.client.channels.fetch('1071136182676754472') as TextChannel;
        if (!channel) {
          throw new Error('Could not find target channel');
        }

        const message = await channel.messages.fetch(messageId);
        const voteData = await endVote(messageId);
        
        if (!voteData || !voteData.entries || voteData.entries.length === 0) {
          throw new Error('No valid vote data found');
        }

        // Find the winner
        const winner = voteData.entries.reduce((prev: VoteEntry, current: VoteEntry) => 
          (current.votes.size > prev.votes.size) ? current : prev
        );

        logger.info({ winner }, 'Vote ended, posting winner');

        // Create winner embed
        const winnerEmbed = new EmbedBuilder()
          .setTitle('🎉 Winning Image!')
          .setDescription(`**${winner.caption}**\n\nVotes: ${winner.votes.size}`)
          .setImage(winner.imageUrl)
          .setColor('#00acee');

        // Post winner and tweet
        await message.edit({
          content: null,
          embeds: [winnerEmbed],
          components: []
        });

        // Automatically post to Twitter
        await handleTwitterPost({
          text: winner.caption,
          image_url: winner.imageUrl,
          channelId: channel.id
        }, this.client);

        logger.info('Successfully tweeted winning image');

        // Start next vote cycle
        await this.generateAndStartVote();

      } catch (error) {
        logger.error({ error }, 'Error handling vote end');
        // Still try to start next vote cycle even if there was an error
        this.generateAndStartVote();
      }
    }, delay);
  }

  // Start the automated voting system
  public async start(): Promise<void> {
    logger.info('Starting automated voting system');
    await this.generateAndStartVote();
  }

  // Stop the automated voting system
  public stop(): void {
    if (this.currentVoteTimeout) {
      clearTimeout(this.currentVoteTimeout);
      this.currentVoteTimeout = null;
    }
  }
} 