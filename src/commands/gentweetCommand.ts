import { Client, CommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, ButtonInteraction, APIEmbed, AttachmentBuilder, GuildMember } from 'discord.js';
import { submitImageJob } from '../modules/imageGenModule/imageGen';
import { enhancePrompt } from '../modules/imageGenModule/enhancePrompt';
import { handleTwitterPost } from '../modules/chatbotModule/tools/twitterTool';
import { setActiveVote, endVote, getActiveVote, VoteEntry, VoteData, numberEmojis } from '../modules/voteModule/voteManager';
import { logger } from '../utils/logger';
import { PointsManager } from '../modules/pointsModule/pointsManager';
import { randomPrompt } from '../modules/imageGenModule/randomPrompt';
import { generateImageCaption } from '../modules/voteModule/captioner';

// Helper function to create embeds for all images
function createImagesEmbed(entries: VoteEntry[]): EmbedBuilder[] {
  // Sort entries by number for consistent display
  const sortedEntries = [...entries].sort((a, b) => a.number - b.number);
  
  // Create array of embeds
  const embeds = sortedEntries.map((entry) => {
    // Create vote display with emojis
    const voteDisplay = `\n\n${numberEmojis[entry.number - 1]} Votes: ${entry.votes.size}`;
    const votersList = entry.votes.size > 0 
      ? `\nVoters: ${Array.from(entry.votes).length} people have voted for this image!`
      : '\nBe the first to vote for this image!';

    return new EmbedBuilder()
      .setTitle(`Image #${entry.number}`)
      .setDescription(`${entry.caption}${voteDisplay}${votersList}`)
      .setImage(entry.imageUrl)
      .setColor('#FF69B4');
  });

  // Calculate total votes
  const totalVotes = sortedEntries.reduce((sum, entry) => sum + entry.votes.size, 0);

  // Add title embed at the start
  embeds.unshift(
    new EmbedBuilder()
      .setTitle('🎨 Vote for Your Favorite Image!')
      .setDescription(`Vote by clicking the number buttons below!\nTotal images: ${sortedEntries.length}\nTotal votes cast: ${totalVotes}`)
      .setColor('#FF69B4')
  );

  return embeds;
}

// Helper function to create button rows
function createButtonRows(entries: VoteEntry[]): ActionRowBuilder<ButtonBuilder>[] {
  // Vote buttons row
  const voteRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      entries.map((_, index) => 
        new ButtonBuilder()
          .setCustomId(`vote_${index}`)
          .setLabel(`${index + 1}`)
          .setEmoji(numberEmojis[index])
          .setStyle(ButtonStyle.Primary)
      )
    );

  return [voteRow];
}

// Define the command structure
export const data = new SlashCommandBuilder()
  .setName('gentweet')
  .setDescription('Generate images and create a vote for tweeting')
  .addIntegerOption(option =>
    option
      .setName('count')
      .setDescription('Number of images to generate (1-9)')
      .setMinValue(1)
      .setMaxValue(9)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName('duration')
      .setDescription('Duration of voting in minutes')
      .setMinValue(1)
      .setRequired(false)
  )
  .setDefaultMemberPermissions('0')
  .setDMPermission(false);

// Execute function for the command
export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    // Check if user has the required roles
    const allowedRoles = ['1071300991611318332', '1129044100075753572'];
    const member = interaction.member as GuildMember;
    
    if (!member.roles.cache.some(role => allowedRoles.includes(role.id))) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command.', 
        ephemeral: true 
      });
      return;
    }

    // Set default values: 4 images and 24 hours (1440 minutes)
    const imageCount = Math.min(9, Math.max(1, Number(interaction.options.get('count')?.value) || 4));
    const duration = Math.max(1, Number(interaction.options.get('duration')?.value) || 1440);

    logger.info({ imageCount, duration }, 'Starting gentweet command execution');
    await interaction.deferReply();
    
    const entries: VoteEntry[] = [];
    logger.info('Beginning image generation loop');

    for (let i = 0; i < imageCount; i++) {
      try {
        logger.info({ imageNumber: i + 1, totalImages: imageCount }, '=== Starting new image generation ===');
        
        // Generate a random prompt using the randomPrompt module
        const basePrompt = await randomPrompt();
        logger.info(`Generated random prompt: ${basePrompt}`);
        
        // Enhance the prompt using the enhancePrompt module
        const enhancedPrompt = await enhancePrompt(basePrompt);
        logger.info(`Enhanced prompt: ${enhancedPrompt}`);
        
        // Generate the image
        logger.info(`Generating image ${i + 1}`);
        const imageUrl = await submitImageJob(enhancedPrompt);
        logger.info({ imageNumber: i + 1, imageUrl }, 'Generated image');
        
        // Generate AI caption using the new captioner
        logger.info(`Generating AI caption for image ${i + 1}`);
        const finalCaption = await generateImageCaption(imageUrl);
        logger.info({ imageNumber: i + 1, finalCaption }, 'Generated AI caption');
        
        entries.push({
          imageUrl,
          prompt: enhancedPrompt,
          caption: finalCaption,
          votes: new Set<string>(),
          number: i + 1
        });
        
        logger.info({ 
          imageNumber: i + 1,
          totalEntries: entries.length,
          randomBasePrompt: basePrompt,
          enhancedPrompt,
          caption: finalCaption
        }, '=== Completed image generation ===');

      } catch (error) {
        logger.error({ 
          error, 
          imageNumber: i + 1,
          totalAttempted: i + 1,
          successfulEntries: entries.length
        }, 'Error in image generation process');
        continue;
      }
    }

    if (entries.length === 0) {
      logger.error('No images were generated successfully');
      await interaction.editReply('Failed to generate any images. Please try again.');
      return;
    }

    // Create vote buttons and embeds
    const embeds = createImagesEmbed(entries);
    const rows = createButtonRows(entries);
    await interaction.editReply({
      embeds: embeds.map(embed => embed.toJSON()),
      components: rows
    });

    // Get the message ID from the interaction response
    const message = await interaction.fetchReply();

    const voteData: VoteData = {
      entries: entries,
      endTime: Date.now() + (duration * 60 * 1000),
      messageId: message.id,
      currentIndex: 0,
      votedUsers: new Set<string>()
    };

    setActiveVote(message.id, voteData);

    logger.info({ 
      channelId: interaction.channelId,
      messageId: message.id,
      allRandomPrompts: entries.map(e => e.prompt),
      allCaptions: entries.map(e => e.caption)
    }, 'Vote session started');

    // Set timer to end vote
    setTimeout(async () => {
      try {
        const winner = entries.reduce((prev, current) => 
          (current.votes.size > prev.votes.size) ? current : prev
        );

        logger.info({ winner }, 'Vote ended');

        const tweetButton = new ButtonBuilder()
          .setCustomId('tweet_winner')
          .setLabel('Tweet Winner')
          .setEmoji('🐦')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(tweetButton);

        // Create a winning image embed
        const winnerEmbed = new EmbedBuilder()
          .setTitle('🎉 We have a winner!')
          .setDescription(`**${winner.caption}**\n\nVotes: ${winner.votes.size}`)
          .setImage(winner.imageUrl)
          .setColor('#00acee')
          .setFooter({ text: 'Click the Tweet button to share this moment!' });

        await interaction.editReply({
          content: null,
          embeds: [winnerEmbed],
          components: [row]
        });

        endVote(interaction.id);
      } catch (error) {
        logger.error({ error }, 'Error handling vote end');
        await interaction.editReply({
          content: 'An error occurred while processing the vote results.',
          components: []
        });
      }
    }, duration * 60 * 1000);

  } catch (error) {
    logger.error({ error }, 'Error in gentweet command');
    await interaction.editReply('An error occurred while setting up the vote.');
  }
}

// Handle button interactions
export async function handleButtonInteraction(interaction: ButtonInteraction, client: Client): Promise<void> {
  try {
    if (interaction.customId === 'tweet_winner') {
      await interaction.deferReply({ ephemeral: true });
      try {
        // Get the winner's info from the embed
        const embed = interaction.message.embeds[0];
        if (!embed?.image?.url || !embed.description) {
          await interaction.editReply('Could not find the winning image or caption.');
          return;
        }

        // Extract caption from the description (it's in bold between ** **)
        const captionMatch = embed.description.match(/\*\*(.*?)\*\*/);
        if (!captionMatch) {
          await interaction.editReply('Could not find the winning caption.');
          return;
        }

        const caption = captionMatch[1];
        const imageUrl = embed.image.url;

        // Post to Twitter with the fun caption
        try {
          logger.info({
            caption,
            imageUrl,
            channelId: interaction.channelId,
            hasClient: !!client,
            clientType: client?.constructor?.name
          }, 'Attempting to post tweet');
          
          await handleTwitterPost({
            text: caption,
            image_url: imageUrl,
            channelId: interaction.channelId
          }, interaction.client);

          // Update the original message
          await interaction.message.edit({
            embeds: [new EmbedBuilder(embed.data).setFooter({ text: '✅ Winner has been tweeted!' })],
            components: [] // Remove the tweet button
          });

          await interaction.editReply('Successfully tweeted the winning image! 🎉');
        } catch (error) {
          logger.error({ 
            error,
            caption,
            imageUrl,
            channelId: interaction.channelId,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            hasClient: !!client,
            clientType: client?.constructor?.name
          }, 'Detailed error info for tweet posting');
          
          await interaction.editReply('Failed to post the tweet. Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
          return;
        }

      } catch (error) {
        logger.error({ error }, 'Error posting tweet');
        await interaction.editReply('Failed to post the tweet. Please try again.');
        return;
      }
    }

    // For voting buttons, we need an active vote
    const activeVote = getActiveVote(interaction.message.id);
    if (!activeVote) {
      await interaction.reply({ content: 'No active vote found.', ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith('vote_')) {
      const index = parseInt(interaction.customId.split('_')[1]);
      const entry = activeVote.entries[index];
      
      if (!entry) {
        await interaction.reply({ content: 'Invalid vote option.', ephemeral: true });
        return;
      }

      // Check if user is voting for the same image they already voted for
      if (entry.votes.has(interaction.user.id)) {
        entry.votes.delete(interaction.user.id);
        
        // Remove point when vote is removed
        const pointsManager = PointsManager.getInstance();
        await pointsManager.removePoint(interaction.user.id, interaction.user.username);
        
        await interaction.reply({ content: `Removed your vote from Image ${index + 1}! (-1 point)`, ephemeral: true });
      } else {
        // Check if user has voted before
        const hasVotedBefore = activeVote.entries.some(e => e.votes.has(interaction.user.id));
        
        // Remove user's vote from any other image first
        activeVote.entries.forEach(e => {
          if (e.votes.has(interaction.user.id)) {
            e.votes.delete(interaction.user.id);
          }
        });
        
        // Add vote to the selected image
        entry.votes.add(interaction.user.id);
        
        // Award point only if this is their first vote in this poll
        let pointMessage = '';
        if (!hasVotedBefore) {
          const pointsManager = PointsManager.getInstance();
          const result = await pointsManager.addPoint(interaction.user.id, interaction.user.username);
          if (result.success) {
            pointMessage = ' (+1 point)';
          }
        }
        
        // Different message for first vote vs changing vote
        const message = hasVotedBefore 
          ? `Changed your vote to Image ${index + 1}!`
          : `Voted for Image ${index + 1}!${pointMessage}`;
          
        await interaction.reply({ content: message, ephemeral: true });
      }

      // Update the message with new vote counts
      const rows = createButtonRows(activeVote.entries);
      const embeds = createImagesEmbed(activeVote.entries);

      await interaction.message.edit({
        embeds: embeds.map(embed => embed.toJSON()),
        components: rows
      });
    }
  } catch (error) {
    logger.error({ error }, 'Error handling button interaction');
    await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
  }
}