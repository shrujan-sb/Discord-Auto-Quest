import { SlashCommandBuilder } from 'discord.js';
import { DiscordUserAPI } from '../engine/discord-api.js';
import { saveToken, getDecryptedToken, removeToken, listTokens } from '../database/sqlite.js';
import { ok, warn, err } from '../utils/embeds.js';
import { maskToken } from '../utils/crypto.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('token')
    .setDescription('Manage your account token')
    .addSubcommand(s => s.setName('add').setDescription('Save token')
      .addStringOption(o => o.setName('token').setDescription('Discord token').setRequired(true))
      .addStringOption(o => o.setName('label').setDescription('Label (default: main)')))
    .addSubcommand(s => s.setName('remove').setDescription('Remove token')
      .addStringOption(o => o.setName('label').setDescription('Label').setRequired(true)))
    .addSubcommand(s => s.setName('check').setDescription('Verify token')
      .addStringOption(o => o.setName('label').setDescription('Label')))
    .addSubcommand(s => s.setName('list').setDescription('List saved tokens')),
];

export const handlers = {
  token: async (ix) => {
    const sub = ix.options.getSubcommand();
    const uid = ix.user.id;

    if (sub === 'add') {
      await ix.deferReply({ ephemeral: true });
      const token = ix.options.getString('token');
      const label = ix.options.getString('label') || 'main';
      try {
        const api = new DiscordUserAPI(token);
        const user = await api.getCurrentUser();
        saveToken(uid, label, token, { id: user.id, username: user.global_name || user.username });
        return ix.editReply({ embeds: [ok('Saved', `**${user.global_name || user.username}** → \`${label}\``)] });
      } catch {
        return ix.editReply({ embeds: [err('Invalid', 'Token failed auth check.')] });
      }
    }

    if (sub === 'remove') {
      const label = ix.options.getString('label');
      const removed = removeToken(uid, label);
      return ix.reply({
        embeds: [removed ? ok('Removed', `\`${label}\``) : warn('Not found', `\`${label}\``)],
        ephemeral: true,
      });
    }

    if (sub === 'check') {
      await ix.deferReply({ ephemeral: true });
      const label = ix.options.getString('label') || 'main';
      const token = getDecryptedToken(uid, label) || getDecryptedToken(uid, 'default');
      if (!token) return ix.editReply({ embeds: [warn('Missing', 'No token saved. Use `/token add`.')] });

      try {
        const api = new DiscordUserAPI(token);
        const user = await api.getCurrentUser();
        const quests = await api.getQuests();
        const active = quests.filter(q => !(q.user_status?.completed_at || q.userStatus?.completedAt)).length;
        return ix.editReply({
          embeds: [ok('Valid', `**${user.global_name || user.username}** · ${active} quests · \`${maskToken(token)}\``)],
        });
      } catch {
        return ix.editReply({ embeds: [err('Dead', 'Token expired or revoked.')] });
      }
    }

    if (sub === 'list') {
      const tokens = listTokens(uid);
      if (!tokens.length) return ix.reply({ embeds: [warn('Empty', 'No tokens. `/token add`')], ephemeral: true });
      const lines = tokens.map((t, i) => `\`${i + 1}.\` **${t.label}** — ${t.discord_username || '?'}`);
      return ix.reply({ embeds: [ok('Tokens', lines.join('\n'))], ephemeral: true });
    }
  },
};
