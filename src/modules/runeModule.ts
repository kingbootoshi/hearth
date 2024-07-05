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
        if (embed.title === 'NEW RUNE 💥') {
          const newEmbed = new EmbedBuilder()
            .setTitle("NEW RUNE ALERT!")
            .setColor('#800080');

          let runeName = '';
          embed.fields?.forEach(field => {
            if (field.name === 'RUNE NAME:') {
              runeName = field.value;
            }
            if (field.name !== 'Mint Link Adobit:' && !field.name.includes('Telegram bot')) {
              newEmbed.addFields({ name: field.name, value: field.value });
            }
          });

          if (runeName) {
            const mintLink = `https://runeblaster.io/${encodeURIComponent(runeName)}`;
            newEmbed.addFields({ name: 'Mint Link:', value: mintLink });

            const runeBlasterChannel = this.client.channels.cache.get(this.runeBlasterChannelId) as TextChannel;
            if (runeBlasterChannel) {
              await runeBlasterChannel.send({
                content: `<@&${this.runePingRoleId}>`,
                embeds: [newEmbed]
              });
            }
          } else {
            console.error('Rune name not found in the embed');
          }
        }
      } catch (error) {
        console.error('Error processing rune alert:', error);
      }
    }
  }
}