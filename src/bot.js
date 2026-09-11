import { Client, GatewayIntentBits, Events, ActivityType } from 'discord.js';
import { config } from './config.js';
import { commands, handlers } from './commands/index.js';
import { baseEmbed, E } from './utils/embeds.js';

export function createBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`🕸️  Orbweaver online as ${c.user.tag}`);
    c.user.setActivity('weaving quests', { type: ActivityType.Custom });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const handler = handlers.get(interaction.commandName);
      if (!handler) return;

      try {
        await handler(interaction);
      } catch (err) {
        console.error(`Command error [${interaction.commandName}]:`, err);
        const payload = {
          embeds: [baseEmbed('Something Snapped', `${E.cross()} ${err.message || 'An unexpected error occurred.'}`)],
          ephemeral: true,
        };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isButton()) {
      const guides = {
        help_tokens: [
          '**How to get your token:**',
          '1. Open Discord in your browser',
          '2. Press `F12` → Network tab',
          '3. Refresh, click any request to `discord.com`',
          '4. Copy the `Authorization` header value',
          '',
          `${E.warn()} Never share your token. It's stored encrypted locally.`,
        ].join('\n'),
        help_modes: [
          '**Run Modes:**',
          `${E.fire()} **Blaze** — All quests run in parallel`,
          `${E.clock()} **Parade** — Sequential, one at a time`,
          `${E.orb()} **Orb Hunt** — Richest orb rewards first`,
          `${E.gem()} **Heavy Lift** — Longest quests first`,
          `${E.rocket()} **Turbo** — 15min quests in ~1min`,
        ].join('\n'),
      };

      const text = guides[interaction.customId];
      if (text) {
        await interaction.reply({
          embeds: [baseEmbed('Guide', text)],
          ephemeral: true,
        });
      }
    }
  });

  return client;
}

export { commands };
