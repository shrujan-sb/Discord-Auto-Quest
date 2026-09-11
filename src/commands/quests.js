import { SlashCommandBuilder } from 'discord.js';
import { getDecryptedToken, getSettings, logQuest } from '../database/sqlite.js';
import { QuestEngine, getRunState, abortRun } from '../engine/quest-engine.js';
import { parseQuest, filterRunnableQuests } from '../engine/quest-parser.js';
import { DiscordUserAPI } from '../engine/discord-api.js';
import { embed, ok, warn, err, questListEmbed, statusEmbed, fmtSec, bar } from '../utils/embeds.js';

async function ctx(ix, label = 'main') {
  const token = getDecryptedToken(ix.user.id, label)
    || (label === 'main' ? getDecryptedToken(ix.user.id, 'default') : null);
  if (!token) return { error: true };
  return { token, settings: getSettings(ix.user.id), userId: ix.user.id };
}

async function runMode(ix, opts = {}) {
  const label = ix.options.getString('label') || 'main';
  const c = await ctx(ix, label);
  if (c.error) return ix.editReply({ embeds: [warn('No token', '/token add first')] });

  if (getRunState(c.userId)) {
    return ix.editReply({ embeds: [warn('Busy', 'Run in progress. /quests stop')] });
  }

  const api = new DiscordUserAPI(c.token);
  const raw = await api.getQuests();
  const quests = filterRunnableQuests(raw.map(parseQuest).filter(Boolean));

  if (!quests.length) {
    return ix.editReply({ embeds: [embed('Nothing', 'No quests. Accept one in Discord first, then /quests list')] });
  }

  const engine = new QuestEngine(c.token, {
    turbo: opts.turbo ?? !!c.settings.turbo_mode,
    autoEnroll: !!c.settings.auto_enroll,
    autoClaim: !!c.settings.auto_claim,
    mode: opts.sequential ? 'sequential' : 'parallel',
    sort: opts.sort || 'default',
    onProgress: async (tasks) => {
      try {
        await ix.editReply({ embeds: [statusEmbed(tasks, 'Running…')] });
      } catch { /* expired */ }
    },
  });

  await ix.editReply({ embeds: [embed('Started', `Running **${quests.length}** quest(s)…`)] });

  const result = await engine.run(quests, c.userId);
  for (const q of result.completed) logQuest(c.userId, q.id, q.name, 'done', '');
  for (const f of result.failed) logQuest(c.userId, f.quest.id, f.quest.name, 'fail', f.reason);

  const summary = [
    result.message,
    result.completed.length ? `\n✓ ${result.completed.map(q => q.name).join(', ')}` : '',
    result.failed.length ? `\n✗ ${result.failed.length} failed` : '',
  ].join('');

  return ix.editReply({ embeds: [ok('Finished', summary)] });
}

export const commands = [
  new SlashCommandBuilder()
    .setName('quests')
    .setDescription('Quest automation')
    .addSubcommand(s => s.setName('list').setDescription('Show quests')
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('info').setDescription('Quest details')
      .addStringOption(o => o.setName('name').setDescription('Quest name').setRequired(true))
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('all').setDescription('Complete all quests at once')
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('run').setDescription('Complete one by one')
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('turbo').setDescription('Fast complete (~1min)')
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('stop').setDescription('Stop current run'))
    .addSubcommand(s => s.setName('status').setDescription('Check progress'))
    .addSubcommand(s => s.setName('claim').setDescription('Claim rewards')
      .addStringOption(o => o.setName('label').setDescription('Token label'))),
];

export const handlers = {
  quests: async (ix) => {
    const sub = ix.options.getSubcommand();
    const label = ix.options.getString('label') || 'main';

    if (sub === 'list') {
      await ix.deferReply();
      const c = await ctx(ix, label);
      if (c.error) return ix.editReply({ embeds: [warn('No token', '/token add first')] });

      const raw = await new DiscordUserAPI(c.token).getQuests();
      const quests = raw.map(parseQuest).filter(Boolean).filter(q => !q.completed && !q.isExpired);
      return ix.editReply({ embeds: [questListEmbed(quests)] });
    }

    if (sub === 'info') {
      await ix.deferReply({ ephemeral: true });
      const c = await ctx(ix, label);
      if (c.error) return ix.editReply({ embeds: [warn('No token', '/token add first')] });

      const search = ix.options.getString('name').toLowerCase();
      const raw = await new DiscordUserAPI(c.token).getQuests();
      const q = raw.map(parseQuest).find(x => x?.name?.toLowerCase().includes(search));
      if (!q) return ix.editReply({ embeds: [warn('Not found', `"${search}"`)] });

      const pct = q.taskInfo.target ? Math.round((q.progress / q.taskInfo.target) * 100) : 0;
      return ix.editReply({
        embeds: [embed(q.name, [
          `**Type** ${q.taskInfo.type}`,
          `**Time** ${fmtSec(q.progress)} / ${fmtSec(q.taskInfo.target)}`,
          `**Progress** ${bar(pct)} ${pct}%`,
          `**Orbs** ${q.orbReward || 0}`,
          `**Status** ${q.completed ? 'done' : q.enrolled ? 'active' : 'not enrolled'}`,
        ].join('\n'))],
      });
    }

    if (sub === 'all') {
      await ix.deferReply();
      return runMode(ix, { sequential: false });
    }

    if (sub === 'run') {
      await ix.deferReply();
      return runMode(ix, { sequential: true });
    }

    if (sub === 'turbo') {
      await ix.deferReply();
      return runMode(ix, { turbo: true, sequential: false });
    }

    if (sub === 'stop') {
      const stopped = abortRun(ix.user.id);
      return ix.reply({
        embeds: [stopped ? warn('Stopped', 'Run aborted.') : embed('Idle', 'Nothing running.')],
        ephemeral: true,
      });
    }

    if (sub === 'status') {
      const state = getRunState(ix.user.id);
      if (!state) return ix.reply({ embeds: [embed('Idle', 'No active run.')], ephemeral: true });
      const tasks = state.engine?.tasks || [];
      return ix.reply({ embeds: [statusEmbed(tasks, 'In progress…')], ephemeral: true });
    }

    if (sub === 'claim') {
      await ix.deferReply({ ephemeral: true });
      const c = await ctx(ix, label);
      if (c.error) return ix.editReply({ embeds: [warn('No token', '/token add first')] });

      const api = new DiscordUserAPI(c.token);
      const raw = await api.getQuests();
      const claimable = raw.filter(q => {
        const s = q.user_status || q.userStatus || {};
        return (s.completed_at || s.completedAt) && !(s.claimed_at || s.claimedAt);
      });

      if (!claimable.length) return ix.editReply({ embeds: [embed('Nothing', 'No rewards to claim.')] });

      let n = 0;
      for (const q of claimable) {
        try { await api.claimReward(q.id); n++; } catch { /* captcha */ }
      }
      return ix.editReply({ embeds: [ok('Claimed', `${n}/${claimable.length} rewards.`)] });
    }
  },
};
