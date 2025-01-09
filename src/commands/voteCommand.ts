// Command for creating and managing votes in Discord channels
import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    ButtonInteraction
} from 'discord.js';
import { VoteManager, VoteConfig } from '../modules/voteModule/voteModule';
import pino from 'pino';

const logger = pino({ name: 'voteCommand' });
const voteManager = new VoteManager();

// Command definition
export const data = new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Create a vote with up to 4 options and generated images')
    .addStringOption(option =>
        option.setName('question')
            .setDescription('The question to vote on')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('option1')
            .setDescription('First option')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('option2')
            .setDescription('Second option')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('option3')
            .setDescription('Third option')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('option4')
            .setDescription('Fourth option')
            .setRequired(false));

// Store current image index for each vote message
const messageStates = new Map<string, { currentIndex: number, config: VoteConfig }>();

// Command execution
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    logger.info('Vote command executed');
    await interaction.deferReply();

    // Get vote options from command
    const question = interaction.options.getString('question', true);
    const options: { number: number; text: string }[] = [];
    
    // Collect all provided options
    for (let i = 1; i <= 4; i++) {
        const optionText = interaction.options.getString(`option${i}`);
        if (optionText) {
            options.push({ number: i, text: optionText });
        }
    }

    await interaction.editReply('Generating images for options... This might take a minute!');

    // Generate images for all options
    const optionsWithImages = await voteManager.generateImages(options);

    // Create vote config
    const voteConfig: VoteConfig = {
        question,
        options: optionsWithImages,
        duration: 10000 // 10 seconds
    };

    // Store initial state
    messageStates.set(interaction.id, {
        currentIndex: 0,
        config: voteConfig
    });

    // Create and send initial vote embed with the first image
    const voteEmbed = voteManager.createVoteEmbed(voteConfig, 0);
    const navigationButtons = voteManager.createNavigationButtons(0, optionsWithImages.length);

    const message = await interaction.editReply({
        embeds: [voteEmbed],
        components: [navigationButtons]
    });

    // Add reaction options
    for (let i = 0; i < options.length; i++) {
        await message.react(['1️⃣', '2️⃣', '3️⃣', '4️⃣'][i]);
    }

    // Wait for voting duration
    await new Promise(resolve => setTimeout(resolve, voteConfig.duration));

    // Fetch the message to get updated reactions
    const fetchedMessage = await message.fetch();
    
    // Count votes and determine winner
    const voteCounts = voteManager.countVotes(Array.from(fetchedMessage.reactions.cache.values()));
    const winners = voteManager.determineWinner(voteCounts);

    // Create and send results embed
    const resultsEmbed = voteManager.createResultsEmbed(
        question,
        optionsWithImages,
        voteCounts,
        winners
    );

    // Clear the message state as voting has ended
    messageStates.delete(interaction.id);

    await interaction.followUp({ embeds: [resultsEmbed] });
    logger.info({ winners, voteCounts: Object.fromEntries(voteCounts) }, 'Vote completed');
}

// Button interaction handler
export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const messageState = messageStates.get(interaction.message.interaction?.id || '');
    
    if (!messageState) {
        await interaction.reply({ content: 'This vote has ended.', ephemeral: true });
        return;
    }

    const { currentIndex, config } = messageState;
    let newIndex = currentIndex;

    // Update index based on button pressed
    if (interaction.customId === 'vote_prev' && currentIndex > 0) {
        newIndex = currentIndex - 1;
    } else if (interaction.customId === 'vote_next' && currentIndex < config.options.length - 1) {
        newIndex = currentIndex + 1;
    }

    // Update state with new index
    messageStates.set(interaction.message.interaction?.id || '', {
        currentIndex: newIndex,
        config
    });

    // Update embed and buttons
    const updatedEmbed = voteManager.createVoteEmbed(config, newIndex);
    const updatedButtons = voteManager.createNavigationButtons(newIndex, config.options.length);

    await interaction.update({
        embeds: [updatedEmbed],
        components: [updatedButtons]
    });
}
