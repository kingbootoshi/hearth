import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  MessageReaction,
  User,
} from 'discord.js';
import { submitImageJob, getGeneratedImage } from '../modules/imageGenModule/imageGen';
import { enhancePrompt } from '../modules/imageGenModule/enhancePrompt';
import { randomPrompt } from '../modules/imageGenModule/randomPrompt';
import { saveImageData } from '../modules/imageGenModule/database/imageGenDB'; // Import the saveImageData function

// Utility function to generate a random hexadecimal color
function getRandomColor(): number {
  return Math.floor(Math.random() * 0xffffff); // Generates a random color
}

export const data = new SlashCommandBuilder()
  .setName('imagine')
  .setDescription('Generate an image from a prompt')
  .addStringOption((option) =>
    option
      .setName('prompt')
      .setDescription('The prompt for the image generation')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const userPrompt = interaction.options.getString('prompt', true);

    await interaction.editReply(
      "Imagining your prompt, I'll post it in the channel when it's done!"
    );

    const enhancedPrompt = await enhancePrompt(userPrompt);

    const imageUrl = await submitImageJob(enhancedPrompt);
    
    // Create the embed with the image URL
    const embed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle('Art imagined!')
      .setDescription(`/imagine ${userPrompt}`)
      .setImage(imageUrl)
      .setFooter({
        text: 'Please rate this image 👍 or 👎 to give feedback so I can improve!',
        iconURL: interaction.user.avatarURL() || undefined,
      })
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`imageGen_regen_${interaction.id}`)
        .setLabel('Regen prompt')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`imageGen_random_gen_${interaction.id}`)
        .setLabel('Random gen')
        .setStyle(ButtonStyle.Secondary)
    );

    // Send the message with the generated image
    const sentMessage = await interaction.channel?.send({
      content: `Finished imagining your prompt! ${interaction.user}`,
      embeds: [embed],
      components: [buttons],
    });

    // Check if the message was sent successfully
    if (sentMessage) {
      // React to the message with thumbs up and thumbs down emojis
      await sentMessage.react('👍');
      await sentMessage.react('👎');

      // Create a reaction collector to handle feedback
      const filter = (reaction: MessageReaction, user: User) => {
        return (
          ['👍', '👎'].includes(reaction.emoji.name || '') &&
          !user.bot &&
          reaction.message.id === sentMessage.id
        );
      };

      const collector = sentMessage.createReactionCollector({
        filter,
        max: 1,
        time: 86400000, // Collect one reaction within 24 hours
      });

      collector.on('collect', async (reaction, user) => {
        console.log(`Reaction collected: ${reaction.emoji.name} from ${user.tag}`);
        try {
          // Determine feedback based on the emoji
          const feedback = reaction.emoji.name === '👍' ? 'good' : 'bad';

          console.log(`Feedback is ${feedback}`);

          // Save the data to Supabase
          await saveImageData(userPrompt, enhancedPrompt, imageUrl, feedback);

          // Remove reactions from the message
          await sentMessage.reactions.removeAll();

          // Append feedback message to the original content
          const feedbackMessage =
            feedback === 'good'
              ? 'Yay! This was given good feedback!'
              : 'Aww, this was given bad feedback!';

          await sentMessage.edit({
            content: `${sentMessage.content}\n${feedbackMessage}`,
          }); // Edited the original message to include feedback
        } catch (error) {
          console.error('Error in reaction collector:', error);
        }
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          // If no reactions were collected, remove the reactions after 24 hours
          await sentMessage.reactions.removeAll();
          console.log('No reactions collected, removed reactions from the message.');
        }
      });
    } else {
      console.error('Failed to send the message with the generated image.');
    }
  } catch (error) {
    console.error('Error in image generation command:', error);
    await interaction.editReply('Sorry, there was an error generating your image.');
  }
}

export async function handleButtonInteraction(
  interaction: ButtonInteraction
): Promise<void> {
  // Defer the reply to acknowledge the interaction and allow time for processing
  await interaction.deferReply({ ephemeral: true });

  const customId = interaction.customId;

  if (!customId.startsWith('imageGen_')) return;

  // Extract the embed from the message
  const messageEmbed = interaction.message.embeds[0];
  if (!messageEmbed) {
    await interaction.followUp({
      content: 'No embed found in the message.',
      ephemeral: true,
    });
    return;
  }

  let prompt: string;
  let actionReply: string;
  let content: string; // Message content to send in the channel
  let title: string; // Embed title
  let description: string; // Embed description

  try {
    if (customId.startsWith('imageGen_regen_')) {
      // For "Regen prompt" button, extract the prompt after "/imagine "
      actionReply =
        "Regenerating the prompt, I'll post it in the channel when it's done!";
      const promptMatch = messageEmbed.description?.match(/\/imagine (.*)/);
      if (promptMatch && promptMatch[1]) {
        prompt = promptMatch[1];
      } else {
        throw new Error('Prompt not found in embed description.');
      }

      // Set content, title, and description for "Regen prompt"
      content = `I finished regenerating the image! ${interaction.user}`;
      title = 'Art regenerated';
      description = `/imagine ${prompt}`;
    } else if (customId.startsWith('imageGen_random_gen_')) {
      // For "Random gen" button, generate a new random prompt
      actionReply =
        "Generating a random image, I'll post it in the channel when it's done!";
      prompt = await randomPrompt();

      // Set content, title, and description for "Random gen"
      content = `I finished generating a random image! ${interaction.user}`;
      title = 'Random art imagined!';
      description = `Prompt: ${prompt}`;
    } else {
      // Handle unknown actions
      await interaction.followUp({
        content: 'Unknown action.',
        ephemeral: true,
      });
      return;
    }

    // Edit the initial reply with the action message
    await interaction.editReply({ content: actionReply });

    // Enhance the prompt using AI assistant
    const enhancedPrompt = await enhancePrompt(prompt);

    // Submit the image generation job
    const imageUrl = await submitImageJob(enhancedPrompt);

    // Create the embed with the updated title and description
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(getRandomColor()) // Set a random color for the embed
      .setDescription(description)
      .setImage(imageUrl)
      .setFooter({
        text: interaction.user.username,
        iconURL: interaction.user.avatarURL() || undefined,
      })
      .setTimestamp();

    // Reuse the buttons for further interactions
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`imageGen_regen_${interaction.id}`)
        .setLabel('Regen prompt')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`imageGen_random_gen_${interaction.id}`)
        .setLabel('Random gen')
        .setStyle(ButtonStyle.Secondary)
    );

    // Send the message in the public channel with the updated content and embed
    const sentMessage = await interaction.channel?.send({
      content: content,
      embeds: [embed],
      components: [buttons],
    });

    // Check if the message was sent successfully
    if (sentMessage) {
      // React to the message with thumbs up and thumbs down emojis
      await sentMessage.react('👍');
      await sentMessage.react('👎');

      // Create a reaction collector to handle feedback
      const filter = (reaction: MessageReaction, user: User) => {
        return (
          ['👍', '👎'].includes(reaction.emoji.name || '') &&
          !user.bot &&
          reaction.message.id === sentMessage.id
        );
      };

      const collector = sentMessage.createReactionCollector({
        filter,
        max: 1,
        time: 86400000, // Collect one reaction within 24 hours
      });

      collector.on('collect', async (reaction, user) => {
        console.log(`Reaction collected: ${reaction.emoji.name} from ${user.tag}`);
        try {
          // Determine feedback based on the emoji
          const feedback = reaction.emoji.name === '👍' ? 'good' : 'bad';

          console.log(`Feedback is ${feedback}`);

          // Save the data to Supabase
          await saveImageData(prompt, enhancedPrompt, imageUrl, feedback);

          // Remove reactions from the message
          await sentMessage.reactions.removeAll();

          // Append feedback message to the original content
          const feedbackMessage =
            feedback === 'good'
              ? 'Yay! This was given good feedback!'
              : 'Aww, this was given bad feedback!';

          await sentMessage.edit({
            content: `${sentMessage.content}\n${feedbackMessage}`,
          }); // Edited the original message to include feedback
        } catch (error) {
          console.error('Error in reaction collector:', error);
        }
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          // If no reactions were collected, remove the reactions after 24 hours
          await sentMessage.reactions.removeAll();
          console.log('No reactions collected, removed reactions from the message.');
        }
      });
    } else {
      console.error('Failed to send the message with the generated image.');
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    // Send an error message as a follow-up since we've deferred the reply
    await interaction.followUp({
      content: 'An error occurred while processing your request.',
      ephemeral: true,
    });
  }
}
