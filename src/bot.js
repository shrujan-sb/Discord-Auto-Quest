import { Client, GatewayIntentBits, Events, ActivityType, REST } from 'discord.js';
import { config } from './config.js';
import { commands, handlers } from './commands/index.js';
import { syncSingleGuild } from './register-commands.js';
import { baseEmbed, E, helpButtons } from './utils/embeds.js';
import { buildHelpEmbeds } from './utils/help-content.js';
import { withBrand } from './utils/reply.js';

export function createBot(rest = null) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`🕸️  Orbweaver online as ${c.user.tag}`);
    c.user.setActivity('weaving quests', { type: ActivityType.Custom });
  });

  client.on(Events.GuildCreate, async (guild) => {
    if (config.guildId) return;
    try {
      await syncSingleGuild(guild.id, guild.name, rest);
      console.log(`✅ Commands synced to new server: ${guild.name}`);
    } catch (err) {
      console.warn(`⚠️  Failed to sync commands to ${guild.name}:`, err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const handler = handlers.get(interaction.commandName);
      if (!handler) return;

      try {
        await handler(interaction);
      } catch (err) {
        console.error(`Command error [${interaction.commandName}]:`, err);
        const payload = withBrand({
          embeds: [baseEmbed('Something Snapped', `${E.cross()} ${err.message || 'An unexpected error occurred.'}`)],
          ephemeral: true,
        });
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
        help_tokens: {
          title: 'Token Guide',
          embeds: [baseEmbed('How to Get Your Token', [
            '**Step-by-step:**',
            '① Open [Discord](https://discord.com/app) in your browser',
            '② Press `F12` → **Network** tab',
            '③ Refresh the page (`Ctrl+R`)',
            '④ Click any request to `discord.com`',
            '⑤ Copy the `Authorization` header value',
            '⑥ Run `/thread-token add` and paste it',
            '',
            `${E.warn()} **Never share your token.** It's encrypted locally in SQLite.`,
          ].join('\n'))],
        },
        help_modes: {
          title: 'Run Modes',
          embeds: buildHelpEmbeds().slice(2, 3),
        },
        help_all: {
          title: 'All Commands',
          embeds: buildHelpEmbeds(),
          components: [helpButtons()],
        },
      };

      const guide = guides[interaction.customId];
      if (guide) {
        await interaction.reply(withBrand({
          embeds: guide.embeds,
          components: guide.components ?? [],
          ephemeral: true,
        }));
      }
    }
  });

  return client;
}

export { commands };
