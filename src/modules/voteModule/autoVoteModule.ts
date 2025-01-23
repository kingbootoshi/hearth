import { Client, ButtonInteraction } from 'discord.js';
import { AutoVoteManager } from './autoVoteManager';
import { logger } from '../../utils/logger';
import { voteConfig } from '../../config/voteConfig';

export class AutoVoteModule {
  private voteManager: AutoVoteManager | null = null;

  async init(client: Client): Promise<void> {
    logger.info('Initializing AutoVoteModule');
    if (!voteConfig.enabled) {
      logger.info('autoVoteModule is disabled in config, will not start.');
      this.voteManager = null;
      return;
    }
    this.voteManager = AutoVoteManager.getInstance(client);
  }

  async start(client: Client): Promise<void> {
    logger.info('Starting AutoVoteModule');
    if (!voteConfig.enabled) {
      logger.info('autoVoteModule is disabled, skip start.');
      return;
    }
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
    if (!voteConfig.enabled) {
      // No-op if module is disabled
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('vote_')) {
      logger.debug({
        userId: interaction.user.id,
        buttonId: interaction.customId
      }, 'Vote button clicked');
    }
  }
}