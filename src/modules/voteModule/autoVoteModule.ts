// AutoVoteModule.ts - Module for handling automated voting cycles
import { Client, ButtonInteraction } from 'discord.js';
import { AutoVoteManager } from './autoVoteManager';
import { logger } from '../../utils/logger';

export class AutoVoteModule {
  private voteManager: AutoVoteManager | null = null;

  async init(client: Client): Promise<void> {
    logger.info('Initializing AutoVoteModule');
    this.voteManager = AutoVoteManager.getInstance(client);
  }

  async start(client: Client): Promise<void> {
    logger.info('Starting AutoVoteModule');
    if (this.voteManager) {
      await this.voteManager.start();
    } else {
      logger.error('VoteManager not initialized');
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping AutoVoteModule');
    if (this.voteManager) {
      this.voteManager.stop();
    }
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    // Handle vote button interactions
    if (interaction.isButton() && interaction.customId.startsWith('vote_')) {
      // The vote handling logic is managed by the VoteManager
      // This is just a placeholder in case we need to add module-specific handling
      logger.debug({ 
        userId: interaction.user.id,
        buttonId: interaction.customId 
      }, 'Vote button clicked');
    }
  }
} 