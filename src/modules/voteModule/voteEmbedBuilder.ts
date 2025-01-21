// Utility functions for creating vote embeds and buttons
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { VoteEntry } from './voteManager';

// Emoji numbers for voting
export const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

// Create embeds for all images
export function createImagesEmbed(entries: VoteEntry[]): EmbedBuilder[] {
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

// Create button rows for voting
export function createButtonRows(entries: VoteEntry[]): ActionRowBuilder<ButtonBuilder>[] {
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