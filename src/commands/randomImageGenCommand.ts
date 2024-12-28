//randomGen.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, AttachmentBuilder, MessageReaction, User } from 'discord.js';
import { randomPrompt } from '../modules/imageGenModule/randomPrompt';
import { submitImageJob, getGeneratedImage } from '../modules/imageGenModule/imageGen';
import { enhancePrompt } from '../modules/imageGenModule/enhancePrompt';
import { saveImageData } from '../utils/supabase/imageGenDB'; // Import the saveImageData function

// Utility function to generate a random hexadecimal color
function getRandomColor(): number {
  return Math.floor(Math.random() * 0xffffff); // Generates a random color
}

// Define the /random command
export const data = new SlashCommandBuilder()
  .setName('random')
  .setDescription("Generate a random image based my imagination.");

// Execute the /random command
export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Inform the user that the image is being generated
  await interaction.reply({
    content: "Generating a random image, I'll post it in the channel when it's done!",
    ephemeral: true,
  });

  try {
    // Get a random prompt from the AI
    const userPrompt = await randomPrompt();

    // Optionally enhance the prompt
    const enhancedPrompt = await enhancePrompt(userPrompt);

    // Submit the image generation job and get the URL directly
    const imageUrl = await submitImageJob(enhancedPrompt);

    // Create the embed with the image and prompt
    const imageEmbed = new EmbedBuilder()
      .setTitle('Random Image')
      .setColor(getRandomColor())
      .setDescription(`Prompt: ${userPrompt}`)
      .setImage(imageUrl)
      .setFooter({
        text: 'Please rate this image 👍 or 👎 to give feedback so I can improve!',
        iconURL: interaction.user.avatarURL() || undefined,
      })
      .setTimestamp();

    // Create the buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('randomGen_regen')
        .setLabel('Regen prompt')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('randomGen_randomGen')
        .setLabel('Random gen')
        .setStyle(ButtonStyle.Secondary)
    );

    // Send the embed message with buttons to the channel, mentioning the user
    const sentMessage = await interaction.channel?.send({
      content: `I finished generating a random image! ${interaction.user}`,
      embeds: [imageEmbed],
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

          // Save the data to Supabase with the image URL
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
          });
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
    console.error('Error generating image:', error);
    await interaction.followUp({
      content: 'There was an error generating the image.',
      ephemeral: true,
    });
  }
}

// Handle button interactions for randomGen
export async function handleButtonInteraction(
  interaction: ButtonInteraction
): Promise<void> {
  const customId = interaction.customId;

  // Defer the reply to provide an ephemeral loading message
  await interaction.deferReply({ ephemeral: true });

  let prompt: string;
  let actionReply: string;
  let content: string; // Message content to send in the channel
  let title: string; // Embed title
  let description: string; // Embed description

  try {
    if (customId === 'randomGen_regen') {
      actionReply =
        "Regenerating the prompt, I'll post it in the channel when it's done!";

      // Extract the prompt from the interaction's message embed
      prompt = getPromptFromInteraction(interaction);

      // Set content, title, and description for "Regen prompt"
      content = `I finished regenerating the image! ${interaction.user}`;
      title = 'Art regenerated';
      description = `Prompt: ${prompt}`;
    } else if (customId === 'randomGen_randomGen') {
      actionReply =
        "Generating a new random image, I'll post it in the channel when it's done!";
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

    // Submit the image generation job and get the URL directly
    const imageUrl = await submitImageJob(enhancedPrompt);

    // Create the embed with the updated title and description
    const imageEmbed = new EmbedBuilder()
      .setTitle(title)
      .setColor(getRandomColor())
      .setDescription(description)
      .setImage(imageUrl)
      .setFooter({
        text: 'Please rate this image 👍 or 👎 to give feedback so I can improve!',
        iconURL: interaction.user.avatarURL() || undefined,
      })
      .setTimestamp();

    // Reuse the buttons for further interactions
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('randomGen_regen')
        .setLabel('Regen prompt')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('randomGen_randomGen')
        .setLabel('Random gen')
        .setStyle(ButtonStyle.Secondary)
    );

    // Send the message in the public channel with the updated content and embed
    const sentMessage = await interaction.channel?.send({
      content: content,
      embeds: [imageEmbed],
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

          // Save the data to Supabase with the image URL
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
          });
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
    console.error('Error generating image:', error);
    // Notify the user of the error
    await interaction.followUp({
      content: 'There was an error generating the image.',
      ephemeral: true,
    });
  }
}

// Helper function to extract the prompt from the interaction
function getPromptFromInteraction(interaction: ButtonInteraction): string {
  const embed = interaction.message.embeds[0];
  if (!embed) {
    throw new Error('No embed found in the message');
  }

  const promptMatch = embed.description?.match(/Prompt: (.*)/);
  if (promptMatch && promptMatch[1]) {
    return promptMatch[1];
  } else {
    throw new Error('Prompt not found in embed description');
  }
}