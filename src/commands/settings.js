import { SlashCommandBuilder } from 'discord.js';
import { getSettings, saveSettings } from '../database/sqlite.js';
import { successEmbed, E } from '../utils/embeds.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('loom-config')
    .setDescription('Configure your Orbweaver preferences')
    .addSubcommand(sc => sc
      .setName('view')
      .setDescription('See current settings'))
    .addSubcommand(sc => sc
      .setName('turbo')
      .setDescription('Toggle default turbo mode')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable turbo by default').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('auto-claim')
      .setDescription('Toggle auto-claiming rewards')
      .addBooleanOption(o => o.setName('enabled').setDescription('Auto-claim on completion').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('auto-enroll')
      .setDescription('Toggle auto-enrolling in quests')
      .addBooleanOption(o => o.setName('enabled').setDescription('Auto-enroll before weaving').setRequired(true))),
];

export const handlers = {
  'loom-config': async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'view') {
      const s = getSettings(userId);
      return interaction.reply({
        embeds: [successEmbed('Loom Config', [
          `${E.rocket()} **Turbo Mode:** ${s.turbo_mode ? 'ON' : 'OFF'}`,
          `${E.gem()} **Auto-Claim:** ${s.auto_claim ? 'ON' : 'OFF'}`,
          `${E.spark()} **Auto-Enroll:** ${s.auto_enroll ? 'ON' : 'OFF'}`,
          `${E.bolt()} **Default Mode:** \`${s.default_mode}\``,
        ].join('\n'))],
        ephemeral: true,
      });
    }

    const enabled = interaction.options.getBoolean('enabled');
    const key = sub === 'turbo' ? 'turbo_mode'
      : sub === 'auto-claim' ? 'auto_claim'
        : 'auto_enroll';

    saveSettings(userId, { [key]: enabled ? 1 : 0 });

    return interaction.reply({
      embeds: [successEmbed('Updated', `${E.check()} **${sub}** is now **${enabled ? 'ON' : 'OFF'}**.`)],
      ephemeral: true,
    });
  },
};
