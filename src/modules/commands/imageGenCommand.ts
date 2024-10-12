import { ChatInputCommandInteraction, SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from 'discord.js'
import { submitImageJob, getGeneratedImage } from '../imageGen'
import { enhancePrompt } from '../../utils/enhancePrompt'
import { suggestPrompt } from '../../utils/suggestPrompt'  // Import the suggestPrompt function

export const data = new SlashCommandBuilder()
  .setName('imagine')
  .setDescription('Generate an image from a prompt')
  .addStringOption(option =>
    option.setName('prompt')
      .setDescription('The prompt for the image generation')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    // Defer the reply as ephemeral (only visible to the user who called the command)
    await interaction.deferReply({ ephemeral: true })
    const userPrompt = interaction.options.getString('prompt', true)

    // Send initial waiting message (only visible to the user)
    await interaction.editReply('Imagining your prompt, I\'ll post it in the channel when it\'s done!')

    // Enhance the prompt using the AI assistant information (if any)
    const aiAssistantInfo = '' // Provide if needed
    const enhancedPrompt = await enhancePrompt(userPrompt, aiAssistantInfo)

    // Submit the image generation job
    const jobId = await submitImageJob(enhancedPrompt)

    // Poll for job completion and retrieve the image
    const base64Image = await getGeneratedImage(jobId)

    // Convert the base64 string to a buffer
    const imageBuffer = Buffer.from(base64Image, 'base64')

    // Create an attachment for the image
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'image.png' })

    // Update the ephemeral reply to inform the user that the image has been posted
    await interaction.editReply('Your image has been generated and posted in the channel!')

    // Call suggestPrompt to get Quest Boo's message
    const questBooMessage = await suggestPrompt(userPrompt)

    // Create an embedded message
    const embed = new EmbedBuilder()
      .setColor('#FFD700') // Gold color
      .setTitle('Boo art imagined!')
      .setDescription(questBooMessage) // Use Quest Boo's message instead of the user prompt
      .setImage('attachment://image.png')
      .setFooter({
        text: `/imagine ${userPrompt}`,
      })

    // Send the embedded message with the image to the channel (visible to everyone)
    await interaction.channel?.send({
      content: `${interaction.user}`,
      embeds: [embed],
      files: [attachment]
    })
  } catch (error) {
    console.error('Error in image generation command:', error)
    await interaction.editReply('Sorry, there was an error generating your image.')
  }
}
