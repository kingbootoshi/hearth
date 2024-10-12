import { Client, Message, TextChannel, EmbedBuilder } from 'discord.js';

export class RuneAlertModule {
  private runeAlertChannelId = '1257252566140719205';
  private runeBlasterChannelId = '1253628968972845079';
  private runePingRoleId = '1257252169325875210';

  constructor(private client: Client) {}

  public async handleMessage(message: Message): Promise<void> {
    if (message.channel.id === this.runeAlertChannelId && message.embeds.length > 0) {
      try {
        const embed = message.embeds[0];
        if (embed.title?.includes('NEW RUNE')) {
          const newEmbed = new EmbedBuilder()
            .setTitle("NEW RUNE ALERT!")
            .setColor('#800080');
  
          let runeName = '';
          const descriptionLines = embed.description?.split('\n') || [];
          
          descriptionLines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.includes('RUNE NAME:')) {
              runeName = trimmedLine.split('RUNE NAME:')[1].trim().replace(/^\*\*|\*\*$/g, '');
              newEmbed.addFields({ name: 'RUNE NAME', value: runeName });
            } else if (line.match(/^[💰⛏️📌📊🔄]/)) {
              const [key, value] = line.split(':').map(part => part.trim());
              if (!key.includes('Mint Link Adobit')) {
                const cleanKey = key.replace(/\*\*/g, '').replace(/[^\w\s]/g, '').trim();
                newEmbed.addFields({ name: cleanKey, value: value.replace(/^\*\*/, '') });
              }
            }
          });
  
          if (runeName) {
            const mintLink = `https://runeblaster.io/${encodeURIComponent(runeName).replace(/^%20/, '')}`;
            newEmbed.addFields({ name: 'Mint Link:', value: mintLink });
  
            const infoLink = `https://geniidata.com/ordinals/runes/${encodeURIComponent(runeName).replace(/^%20/, '')}`;
            newEmbed.addFields({ name: 'Info:', value: infoLink });
  
            const twitterDDLink = `https://x.com/search?q=${encodeURIComponent(runeName).replace(/^%20/, '')}`;
            newEmbed.addFields({ name: 'Twitter DD:', value: twitterDDLink });
  
            const runeBlasterChannel = this.client.channels.cache.get(this.runeBlasterChannelId) as TextChannel;
            if (runeBlasterChannel) {
              // Send the ping in the message content, and the embed separately
              await runeBlasterChannel.send({
                content: `<@&${this.runePingRoleId}>`,
                embeds: [newEmbed]
              });
            }
          }
        }
      } catch (error) {
        console.error('Error processing rune alert:', error);
      }
    }
  }
}