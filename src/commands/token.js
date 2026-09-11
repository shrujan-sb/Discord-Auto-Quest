import { SlashCommandBuilder } from 'discord.js';
import { DiscordUserAPI } from '../engine/discord-api.js';
import {
  saveToken, getDecryptedToken, removeToken, listTokens,
} from '../database/sqlite.js';
import { successEmbed, errorEmbed, warnEmbed, E } from '../utils/embeds.js';
import { maskToken } from '../utils/crypto.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('thread-token')
    .setDescription('Manage your Discord account tokens for quest weaving')
    .addSubcommand(sc => sc
      .setName('add')
      .setDescription('Thread a new account token into the loom')
      .addStringOption(o => o.setName('token').setDescription('Your Discord user token').setRequired(true))
      .addStringOption(o => o.setName('label').setDescription('Nickname for this token (default: default)')))
    .addSubcommand(sc => sc
      .setName('remove')
      .setDescription('Cut a token from the web')
      .addStringOption(o => o.setName('label').setDescription('Token label to remove').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('verify')
      .setDescription('Check if a token is still alive')
      .addStringOption(o => o.setName('label').setDescription('Token label to verify')))
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('See all tokens woven to your profile')),
];

export const handlers = {
  'thread-token': async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
      await interaction.deferReply({ ephemeral: true });
      const token = interaction.options.getString('token');
      const label = interaction.options.getString('label') || 'default';

      try {
        const api = new DiscordUserAPI(token);
        const user = await api.getCurrentUser();
        saveToken(userId, label, token, { id: user.id, username: user.global_name || user.username });

        return interaction.editReply({
          embeds: [successEmbed(
            'Token Threaded',
            `${E.check()} Account **${user.global_name || user.username}** is now woven in as \`${label}\`.\n\n${E.warn()} Your token is encrypted locally in SQLite — never shared, never logged.`,
          )],
        });
      } catch {
        return interaction.editReply({
          embeds: [errorEmbed('Thread Failed', 'That token didn\'t authenticate. Double-check you copied the full token.')],
        });
      }
    }

    if (sub === 'remove') {
      const label = interaction.options.getString('label');
      const removed = removeToken(userId, label);
      const embed = removed
        ? successEmbed('Token Cut', `${E.check()} \`${label}\` has been removed from the web.`)
        : warnEmbed('Not Found', `No token labeled \`${label}\` exists.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'verify') {
      await interaction.deferReply({ ephemeral: true });
      const label = interaction.options.getString('label') || 'default';
      const token = getDecryptedToken(userId, label);

      if (!token) {
        return interaction.editReply({
          embeds: [warnEmbed('No Token', `Nothing labeled \`${label}\`. Use \`/thread-token add\` first.`)],
        });
      }

      try {
        const api = new DiscordUserAPI(token);
        const user = await api.getCurrentUser();
        const quests = await api.getQuests();
        const active = quests.filter(q => !q.user_status?.completed_at).length;

        return interaction.editReply({
          embeds: [successEmbed(
            'Token Alive',
            `${E.check()} **${user.global_name || user.username}** is responsive.\n${E.orb()} ${active} incomplete quest${active === 1 ? '' : 's'} detected.\n\`${maskToken(token)}\``,
          )],
        });
      } catch {
        return interaction.editReply({
          embeds: [errorEmbed('Token Dead', 'This token is invalid or expired. Re-thread a fresh one.')],
        });
      }
    }

    if (sub === 'list') {
      const tokens = listTokens(userId);
      if (!tokens.length) {
        return interaction.reply({
          embeds: [warnEmbed('Empty Web', 'No tokens saved yet. Run `/thread-token add` to get started.')],
          ephemeral: true,
        });
      }

      const lines = tokens.map((t, i) =>
        `**${i + 1}.** \`${t.label}\` — ${t.discord_username || 'unknown'} · _added ${t.created_at}_`,
      );

      return interaction.reply({
        embeds: [successEmbed('Your Threaded Tokens', lines.join('\n'))],
        ephemeral: true,
      });
    }
  },
};
