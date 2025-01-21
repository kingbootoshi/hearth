import { ButtonInteraction, Client } from 'discord.js';
import { handleTwitterPost } from '../chatbotModule/tools/twitterTool';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const ALLOWED_ROLES = ['Admin', 'Moderator']; // Configure with your role names

export async function handleTweetButton(interaction: ButtonInteraction, client: Client): Promise<void> {
  try {
    // Check if user has required role
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const hasPermission = member?.roles.cache.some(role => 
      ALLOWED_ROLES.includes(role.name)
    );

    if (!hasPermission) {
      await interaction.reply({
        content: 'You do not have permission to tweet the winner.',
        ephemeral: true
      });
      return;
    }

    // Get winner data from the message content
    const messageContent = interaction.message.content;
    const prompt = messageContent.match(/Prompt: (.*)/)?.[1];
    const imageUrl = interaction.message.attachments.first()?.url;

    if (!prompt || !imageUrl) {
      await interaction.reply({
        content: 'Could not find winner data.',
        ephemeral: true
      });
      return;
    }

    // Post to Twitter
    await handleTwitterPost({
      text: prompt,
      image_url: imageUrl,
      channelId: interaction.channelId
    }, client);

    // Update message and remove button
    await interaction.message.edit({
      content: `${interaction.message.content}\n\n✅ Winner has been tweeted!`,
      components: [] // Remove the Tweet button
    });

    await interaction.reply({
      content: 'Successfully tweeted the winning image!',
      ephemeral: true
    });

  } catch (error) {
    logger.error({ error }, 'Error handling tweet button');
    await interaction.reply({
      content: 'Failed to tweet the winning image.',
      ephemeral: true
    });
  }
} 