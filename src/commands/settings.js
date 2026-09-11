import { SlashCommandBuilder } from 'discord.js';
import { getSettings, saveSettings } from '../database/sqlite.js';
import { ok, ui, E } from '../utils/embeds.js';

const on = v => v ? `${E.check()} on` : `${E.cross()} off`;

export const commands = [
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Bot settings')
    .addSubcommand(s => s.setName('view').setDescription('Show settings'))
    .addSubcommand(s => s.setName('turbo').setDescription('Default turbo mode')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable turbo').setRequired(true)))
    .addSubcommand(s => s.setName('claim').setDescription('Auto-claim rewards')
      .addBooleanOption(o => o.setName('enabled').setDescription('Auto-claim on').setRequired(true)))
    .addSubcommand(s => s.setName('enroll').setDescription('Auto-enroll quests')
      .addBooleanOption(o => o.setName('enabled').setDescription('Auto-enroll on').setRequired(true))),
];

export const handlers = {
  settings: async (ix) => {
    const sub = ix.options.getSubcommand();
    const uid = ix.user.id;

    if (sub === 'view') {
      const s = getSettings(uid);
      return ix.reply({
        embeds: [ui('Settings', [
          `${E.rocket()} turbo · **${on(s.turbo_mode)}**`,
          `${E.loot()} auto-claim · **${on(s.auto_claim)}**`,
          `${E.spark()} auto-enroll · **${on(s.auto_enroll)}**`,
        ].join('\n'))],
        ephemeral: true,
      });
    }

    const enabled = ix.options.getBoolean('enabled');
    const key = sub === 'turbo' ? 'turbo_mode' : sub === 'claim' ? 'auto_claim' : 'auto_enroll';
    saveSettings(uid, { [key]: enabled ? 1 : 0 });

    return ix.reply({ embeds: [ok('Updated', `${sub}: **${on(enabled)}**`)], ephemeral: true });
  },
};
