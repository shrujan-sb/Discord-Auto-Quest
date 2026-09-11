import { SlashCommandBuilder } from 'discord.js';
import { getDecryptedToken, getSettings, logQuest } from '../database/sqlite.js';
import { QuestEngine, getRunState, abortRun } from '../engine/quest-engine.js';
import { parseAllQuests, filterRunnableQuests } from '../engine/quest-parser.js';
import { DiscordUserAPI } from '../engine/discord-api.js';
import { ok, warn, err, questListEmbed, statusEmbed, ui, bar, fmtSec, E } from '../utils/embeds.js';
import { taskIcon } from '../utils/emojis.js';

function getToken(uid, label = 'main') {
  return getDecryptedToken(uid, label) || getDecryptedToken(uid, 'default');
}

async function ctx(ix, label = 'main') {
  const token = getToken(ix.user.id, label);
  if (!token) return { error: true };
  return { token, settings: getSettings(ix.user.id), userId: ix.user.id };
}

async function fetchParsed(token) {
  const api = new DiscordUserAPI(token);
  const raw = await api.fetchAllQuests();
  return parseAllQuests(raw);
}

async function runMode(ix, opts = {}) {
  const label = ix.options.getString('label') || 'main';
  const c = await ctx(ix, label);
  if (c.error) return ix.editReply({ embeds: [warn('No Token', `${E.key()} Use \`/token add\` first.`)] });

  if (getRunState(c.userId)) {
    return ix.editReply({ embeds: [warn('Busy', `${E.clock()} Run active — \`/quests stop\``)] });
  }

  const quests = filterRunnableQuests(await fetchParsed(c.token));
  if (!quests.length) {
    return ix.editReply({ embeds: [warn('No Quests', 'Accept a quest in Discord first, then retry.')] });
  }

  const engine = new QuestEngine(c.token, {
    turbo: opts.turbo ?? !!c.settings.turbo_mode,
    autoEnroll: !!c.settings.auto_enroll,
    autoClaim: !!c.settings.auto_claim,
    mode: opts.sequential ? 'sequential' : 'parallel',
    onProgress: async (tasks) => {
      try { await ix.editReply({ embeds: [statusEmbed(tasks, `${E.bolt()} Working…`)] }); } catch { /* */ }
    },
  });

  await ix.editReply({ embeds: [ui('Started', `${E.fire()} Running **${quests.length}** quest(s)…`, 0x5865f2)] });

  const result = await engine.run(quests, c.userId);
  for (const q of result.completed) logQuest(c.userId, q.id, q.name, 'done', '');
  for (const f of result.failed) logQuest(c.userId, f.quest.id, f.quest.name, 'fail', f.reason);

  const lines = [
    result.message,
    result.completed.length ? `\n${E.check()} ${result.completed.map(q => q.name).join(', ')}` : '',
    result.failed.length ? `\n${E.cross()} ${result.failed.length} failed` : '',
  ].join('');

  return ix.editReply({ embeds: [ok('Complete', lines)] });
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
    .addSubcommand(s => s.setName('all').setDescription('Complete all at once')
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('run').setDescription('Complete one by one')
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('turbo').setDescription('Fast complete')
      .addStringOption(o => o.setName('label').setDescription('Token label')))
    .addSubcommand(s => s.setName('stop').setDescription('Stop run'))
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
      if (c.error) return ix.editReply({ embeds: [warn('No Token', `${E.key()} \`/token add\``)] });

      const api = new DiscordUserAPI(c.token);
      const [quests, diag] = await Promise.all([
        fetchParsed(c.token),
        api.getDiagnostics(),
      ]);
      const active = quests.filter(q => !q.completed && !q.isExpired);
      return ix.editReply({ embeds: [questListEmbed(active, diag)] });
    }

    if (sub === 'info') {
      await ix.deferReply({ ephemeral: true });
      const c = await ctx(ix, label);
      if (c.error) return ix.editReply({ embeds: [warn('No Token', `${E.key()} \`/token add\``)] });

      const search = ix.options.getString('name').toLowerCase();
      const q = (await fetchParsed(c.token)).find(x => x.name.toLowerCase().includes(search));
      if (!q) return ix.editReply({ embeds: [warn('Not Found', `"${search}"`)] });

      const pct = q.taskInfo.target ? Math.round((q.progress / q.taskInfo.target) * 100) : 0;
      return ix.editReply({
        embeds: [ui(q.name, [
          `${taskIcon(q.taskInfo.type)} **${q.taskInfo.type}**`,
          `${E.clock()} ${fmtSec(q.progress)} / ${fmtSec(q.taskInfo.target)}`,
          `${bar(pct)} \`${pct}%\``,
          `${E.orb()} ${q.orbReward || 0} orbs`,
          q.enrolled ? `${E.check()} Enrolled` : `${E.spark()} Not enrolled — will auto-enroll on run`,
        ].join('\n'))],
      });
    }

    if (sub === 'all') { await ix.deferReply(); return runMode(ix, {}); }
    if (sub === 'run') { await ix.deferReply(); return runMode(ix, { sequential: true }); }
    if (sub === 'turbo') { await ix.deferReply(); return runMode(ix, { turbo: true }); }

    if (sub === 'stop') {
      const stopped = abortRun(ix.user.id);
      return ix.reply({
        embeds: [stopped ? warn('Stopped', `${E.cross()} Aborted.`) : ui('Idle', 'Nothing running.')],
        ephemeral: true,
      });
    }

    if (sub === 'status') {
      const state = getRunState(ix.user.id);
      if (!state) return ix.reply({ embeds: [ui('Idle', `${E.clock()} No active run.`)], ephemeral: true });
      return ix.reply({ embeds: [statusEmbed(state.engine?.tasks, `${E.bolt()} In progress…`)], ephemeral: true });
    }

    if (sub === 'claim') {
      await ix.deferReply({ ephemeral: true });
      const c = await ctx(ix, label);
      if (c.error) return ix.editReply({ embeds: [warn('No Token', `${E.key()} \`/token add\``)] });

      const api = new DiscordUserAPI(c.token);
      const raw = await api.fetchAllQuests();
      const claimable = raw.filter(q => {
        const s = q.user_status || q.userStatus || {};
        return (s.completed_at || s.completedAt) && !(s.claimed_at || s.claimedAt);
      });

      if (!claimable.length) return ix.editReply({ embeds: [ui('Nothing', 'No rewards to claim.')] });

      let n = 0;
      for (const q of claimable) {
        try { await api.claimReward(q.id); n++; } catch { /* captcha */ }
      }
      return ix.editReply({ embeds: [ok('Claimed', `${E.loot()} **${n}/${claimable.length}** rewards.`)] });
    }
  },
};
