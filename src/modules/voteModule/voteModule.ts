// Module for handling voting operations in Discord channels
import { Message, EmbedBuilder, MessageReaction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { submitImageJob } from '../imageGenModule/imageGen';
import { enhancePrompt } from '../imageGenModule/enhancePrompt';
import pino from 'pino';

const logger = pino({ name: 'voteModule' });

// Emoji numbers for voting options
const VOTE_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

interface VoteOption {
    number: number;
    text: string;
    imageUrl?: string;
}

export interface VoteConfig {
    question: string;
    options: VoteOption[];
    duration: number;
}

export class VoteManager {
    // Generate images for all options
    public async generateImages(options: VoteOption[]): Promise<VoteOption[]> {
        logger.info('Generating images for vote options');
        
        const optionsWithImages = await Promise.all(
            options.map(async (opt) => {
                const enhancedPrompt = await enhancePrompt(opt.text);
                const imageUrl = await submitImageJob(enhancedPrompt);
                return { ...opt, imageUrl };
            })
        );

        return optionsWithImages;
    }

    // Create a vote embed with the given options and current image index
    public createVoteEmbed(config: VoteConfig, currentImageIndex: number): EmbedBuilder {
        logger.info({ config, currentImageIndex }, 'Creating vote embed');
        
        const currentOption = config.options[currentImageIndex];
        const optionsText = config.options
            .map((opt) => `${VOTE_EMOJIS[opt.number - 1]} ${opt.text}`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('📊 ' + config.question)
            .setDescription(optionsText)
            .setFooter({ text: `Vote ends in ${config.duration / 1000} seconds | Viewing option ${currentImageIndex + 1}/${config.options.length}` });

        // Add the current option's image if available
        if (currentOption.imageUrl) {
            embed.setImage(currentOption.imageUrl);
        }

        return embed;
    }

    // Create navigation buttons
    public createNavigationButtons(currentIndex: number, totalOptions: number): ActionRowBuilder<ButtonBuilder> {
        const row = new ActionRowBuilder<ButtonBuilder>();

        // Previous button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('vote_prev')
                .setLabel('◀️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentIndex === 0)
        );

        // Next button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('vote_next')
                .setLabel('Next ▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentIndex === totalOptions - 1)
        );

        return row;
    }

    // Count votes from reactions
    public countVotes(reactions: MessageReaction[]): Map<number, number> {
        logger.debug('Counting votes from reactions');
        const voteCounts = new Map<number, number>();

        VOTE_EMOJIS.forEach((_, index) => {
            const reaction = reactions.find(r => r.emoji.name === VOTE_EMOJIS[index]);
            // Subtract 1 from count to exclude bot's reaction
            voteCounts.set(index + 1, (reaction?.count || 1) - 1);
        });

        return voteCounts;
    }

    // Determine the winning option(s)
    public determineWinner(voteCounts: Map<number, number>): number[] {
        logger.debug({ voteCounts: Object.fromEntries(voteCounts) }, 'Determining winner');
        
        const maxVotes = Math.max(...voteCounts.values());
        const winners = Array.from(voteCounts.entries())
            .filter(([_, count]) => count === maxVotes)
            .map(([option]) => option);

        return winners;
    }

    // Create results embed
    public createResultsEmbed(
        question: string,
        options: VoteOption[],
        voteCounts: Map<number, number>,
        winners: number[]
    ): EmbedBuilder {
        logger.info({ question, voteCounts: Object.fromEntries(voteCounts), winners }, 'Creating results embed');

        const resultsText = options
            .map((opt) => {
                const count = voteCounts.get(opt.number) || 0;
                const isWinner = winners.includes(opt.number);
                return `${VOTE_EMOJIS[opt.number - 1]} ${opt.text}: ${count} votes ${isWinner ? '👑' : ''}`;
            })
            .join('\n');

        // Show the winning option's image if there's exactly one winner
        const winningImage = winners.length === 1 ? options[winners[0] - 1].imageUrl : undefined;

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('📊 Voting Results: ' + question)
            .setDescription(resultsText)
            .setFooter({ text: 'Voting has ended' });

        if (winningImage) {
            embed.setImage(winningImage);
        }

        return embed;
    }
}
