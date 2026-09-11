import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, helpButtons, E } from '../utils/embeds.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('oracle')
    .setDescription('Orbweaver help & command reference'),
];

export const handlers = {
  oracle: async (interaction) => {
    const embed = baseEmbed('The Oracle Speaks', [
      `${E.spider()} **Orbweaver** weaves through Discord quests for you — fast, parallel, and from a single bot.`,
      '',
      '**Token Commands**',
      '`/thread-token add` — Save your Discord token',
      '`/thread-token verify` — Check token health',
      '`/thread-token list` — View saved tokens',
      '`/thread-token remove` — Delete a token',
      '',
      '**Quest Commands**',
      '`/radar` — Scan active quests',
      '`/inspect` — Deep-dive a quest',
      '`/blaze` — Complete ALL quests at once',
      '`/parade` — One quest at a time',
      '`/orb-hunt` — High-orb quests first',
      '`/heavy-lift` — Longest quests first',
      '`/turbo` — 15min → ~1min speedrun',
      '`/pulse` — Live progress',
      '`/abort` — Stop everything',
      '`/claim-loot` — Claim all rewards',
      '',
      '**Settings**',
      '`/loom-config view` — Your preferences',
      '',
      `${E.warn()} **Disclaimer:** Quest automation may violate Discord ToS. Use at your own risk.`,
    ].join('\n'));

    return interaction.reply({ embeds: [embed], components: [helpButtons()] });
  },
};
