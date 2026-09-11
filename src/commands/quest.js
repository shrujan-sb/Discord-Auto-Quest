import { SlashCommandBuilder } from 'discord.js';
import { withBrand } from '../utils/reply.js';
import { getDecryptedToken, getSettings, logQuest } from '../database/sqlite.js';
import { QuestEngine, getRunState, abortRun } from '../engine/quest-engine.js';
import { parseQuest, filterActiveQuests } from '../engine/quest-parser.js';
import { DiscordUserAPI } from '../engine/discord-api.js';
import {
  baseEmbed, successEmbed, warnEmbed,
  buildQuestListEmbed, buildRunStatusEmbed, E, formatDuration, progressBar,
} from '../utils/embeds.js';

async function getTokenAndSettings(interaction, label = 'default') {
  const userId = interaction.user.id;
  const token = getDecryptedToken(userId, label);
  if (!token) return { error: 'no_token' };
  const settings = getSettings(userId);
  return { token, settings, userId };
}

async function runQuestMode(interaction, mode, options = {}) {
  const label = interaction.options.getString('label') || 'default';
  const ctx = await getTokenAndSettings(interaction, label);

  if (ctx.error) {
    return interaction.editReply(withBrand({
      embeds: [warnEmbed('No Token', 'Thread a token first with `/thread-token add`.')],
    }));
  }

  if (getRunState(ctx.userId)) {
    return interaction.editReply(withBrand({
      embeds: [warnEmbed('Already Weaving', 'A run is in progress. Use `/pulse` to watch or `/abort` to stop.')],
    }));
  }

  const api = new DiscordUserAPI(ctx.token);
  const raw = await api.getQuests();
  const quests = filterActiveQuests(raw.map(parseQuest).filter(Boolean));

  if (!quests.length) {
    return interaction.editReply(withBrand({
      embeds: [baseEmbed('Clear Skies', `${E.spark()} No incomplete quests to weave right now.`)],
    }));
  }

  const turbo = options.turbo ?? !!ctx.settings.turbo_mode;
  const engine = new QuestEngine(ctx.token, {
    turbo,
    autoEnroll: !!ctx.settings.auto_enroll,
    autoClaim: !!ctx.settings.auto_claim,
    mode: options.parallel ? 'parallel' : 'sequential',
    sort: options.sort || 'default',
    onProgress: async (tasks) => {
      try {
        await interaction.editReply(withBrand({
          embeds: [buildRunStatusEmbed({ tasks, message: `${E.bolt()} Weaving in ${mode} mode…`, done: false })],
        }));
      } catch { /* interaction may have expired */ }
    },
  });

  const modeLabels = {
    blaze: `${E.fire()} Blaze — all quests at once`,
    parade: `${E.clock()} Parade — one by one`,
    'orb-hunt': `${E.orb()} Orb Hunt — richest rewards first`,
    'heavy-lift': `${E.gem()} Heavy Lift — longest quests first`,
    turbo: `${E.rocket()} Turbo — lightspeed completion`,
  };

  await interaction.editReply(withBrand({
    embeds: [baseEmbed('Weaving Started', `${modeLabels[mode] || mode}\n\n${E.spider()} Processing **${quests.length}** quest${quests.length === 1 ? '' : 's'}…`)],
  }));

  const result = await engine.run(quests, ctx.userId);

  for (const q of result.completed) {
    logQuest(ctx.userId, q.id, q.name, 'completed', mode);
  }
  for (const f of result.failed) {
    logQuest(ctx.userId, f.quest.id, f.quest.name, 'failed', f.reason);
  }

  const lines = [];
  if (result.completed.length) lines.push(`${E.check()} **${result.completed.length}** completed`);
  if (result.failed.length) lines.push(`${E.cross()} **${result.failed.length}** failed`);
  if (result.skipped.length) lines.push(`${E.warn()} **${result.skipped.length}** skipped`);

  const embed = successEmbed('Weave Complete', [
    result.message,
    '',
    lines.join(' · ') || 'Nothing changed.',
    '',
    result.completed.length
      ? result.completed.map(q => `${E.orb()} ${q.name}`).join('\n')
      : '',
  ].filter(Boolean).join('\n'));

  return interaction.editReply(withBrand({ embeds: [embed] }));
}

export const commands = [
  new SlashCommandBuilder()
    .setName('radar')
    .setDescription('Scan your account for active quests')
    .addStringOption(o => o.setName('label').setDescription('Token label')),

  new SlashCommandBuilder()
    .setName('inspect')
    .setDescription('Deep-dive into a specific quest')
    .addStringOption(o => o.setName('name').setDescription('Quest name (partial match)').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Token label')),

  new SlashCommandBuilder()
    .setName('blaze')
    .setDescription('Complete ALL quests simultaneously')
    .addStringOption(o => o.setName('label').setDescription('Token label')),

  new SlashCommandBuilder()
    .setName('parade')
    .setDescription('Complete quests one after another')
    .addStringOption(o => o.setName('label').setDescription('Token label')),

  new SlashCommandBuilder()
    .setName('orb-hunt')
    .setDescription('Prioritize high-orb reward quests first')
    .addStringOption(o => o.setName('label').setDescription('Token label')),

  new SlashCommandBuilder()
    .setName('heavy-lift')
    .setDescription('Tackle the longest quests first')
    .addStringOption(o => o.setName('label').setDescription('Token label')),

  new SlashCommandBuilder()
    .setName('turbo')
    .setDescription('Lightspeed mode — 15min quests done in ~1min')
    .addStringOption(o => o.setName('label').setDescription('Token label')),

  new SlashCommandBuilder()
    .setName('pulse')
    .setDescription('Live status of your current weave'),

  new SlashCommandBuilder()
    .setName('abort')
    .setDescription('Stop all running quest completions'),

  new SlashCommandBuilder()
    .setName('claim-loot')
    .setDescription('Claim rewards for all completed quests')
    .addStringOption(o => o.setName('label').setDescription('Token label')),
];

export const handlers = {
  radar: async (interaction) => {
    await interaction.deferReply();
    const label = interaction.options.getString('label') || 'default';
    const ctx = await getTokenAndSettings(interaction, label);
    if (ctx.error) {
      return interaction.editReply(withBrand({
        embeds: [warnEmbed('No Token', 'Add one with `/thread-token add`.')],
      }));
    }

    const api = new DiscordUserAPI(ctx.token);
    const raw = await api.getQuests();
    const quests = raw.map(parseQuest).filter(Boolean).filter(q => !q.completed);

    return interaction.editReply(withBrand({
      embeds: [buildQuestListEmbed(quests, 'Quest Radar')],
    }));
  },

  inspect: async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    const label = interaction.options.getString('label') || 'default';
    const search = interaction.options.getString('name').toLowerCase();
    const ctx = await getTokenAndSettings(interaction, label);
    if (ctx.error) {
      return interaction.editReply(withBrand({
        embeds: [warnEmbed('No Token', 'Add one first.')],
      }));
    }

    const api = new DiscordUserAPI(ctx.token);
    const raw = await api.getQuests();
    const quest = raw.map(parseQuest).find(q => q?.name?.toLowerCase().includes(search));

    if (!quest) {
      return interaction.editReply(withBrand({
        embeds: [warnEmbed('Not Found', `No quest matching "${search}".`)],
      }));
    }

    const pct = quest.taskInfo?.target
      ? Math.min(100, Math.round((quest.progress / quest.taskInfo.target) * 100))
      : 0;

    const embed = baseEmbed(`Inspect: ${quest.name}`, [
      `**Game** · ${quest.gameTitle || 'N/A'}`,
      `**Type** · \`${quest.taskInfo.type}\``,
      `**Duration** · ${formatDuration(quest.taskInfo.target)}`,
      `**Progress** · ${progressBar(pct)} \`${pct}%\``,
      `**Orbs** · ${quest.orbReward || 'N/A'}`,
      `**Status** · ${quest.completed ? 'Completed' : quest.enrolled ? 'In Progress' : 'Not Enrolled'}`,
      `**Automatable** · ${quest.automatable ? 'Yes' : 'No'}`,
    ].join('\n'));

    if (quest.colors?.primary) embed.setColor(parseInt(quest.colors.primary.replace('#', ''), 16));

    return interaction.editReply(withBrand({ embeds: [embed] }));
  },

  blaze: async (interaction) => {
    await interaction.deferReply();
    return runQuestMode(interaction, 'blaze', { parallel: true });
  },

  parade: async (interaction) => {
    await interaction.deferReply();
    return runQuestMode(interaction, 'parade', { parallel: false });
  },

  'orb-hunt': async (interaction) => {
    await interaction.deferReply();
    return runQuestMode(interaction, 'orb-hunt', { parallel: true, sort: 'orbs' });
  },

  'heavy-lift': async (interaction) => {
    await interaction.deferReply();
    return runQuestMode(interaction, 'heavy-lift', { parallel: false, sort: 'heavy' });
  },

  turbo: async (interaction) => {
    await interaction.deferReply();
    return runQuestMode(interaction, 'turbo', { parallel: true, turbo: true });
  },

  pulse: async (interaction) => {
    const state = getRunState(interaction.user.id);
    if (!state) {
      return interaction.reply(withBrand({
        embeds: [baseEmbed('Idle', `${E.clock()} No active weave. Start one with \`/blaze\` or \`/turbo\`.`)],
        ephemeral: true,
      }));
    }

    const tasks = state.engine?.tasks || [];
    return interaction.reply(withBrand({
      embeds: [buildRunStatusEmbed({ tasks, message: `${E.bolt()} Weave in progress…`, done: false })],
      ephemeral: true,
    }));
  },

  abort: async (interaction) => {
    const stopped = abortRun(interaction.user.id);
    const embed = stopped
      ? warnEmbed('Aborted', `${E.cross()} Weave stopped. Partial progress may remain.`)
      : baseEmbed('Nothing Running', 'No active weave to abort.');
    return interaction.reply(withBrand({ embeds: [embed], ephemeral: true }));
  },

  'claim-loot': async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    const label = interaction.options.getString('label') || 'default';
    const ctx = await getTokenAndSettings(interaction, label);
    if (ctx.error) {
      return interaction.editReply(withBrand({
        embeds: [warnEmbed('No Token', 'Add one first.')],
      }));
    }

    const api = new DiscordUserAPI(ctx.token);
    const raw = await api.getQuests();
    const claimable = raw.filter(q =>
      q.user_status?.completed_at && !q.user_status?.claimed_at,
    );

    if (!claimable.length) {
      return interaction.editReply(withBrand({
        embeds: [baseEmbed('No Loot', 'Nothing to claim right now.')],
      }));
    }

    let claimed = 0;
    for (const q of claimable) {
      try {
        await api.claimReward(q.id);
        claimed++;
      } catch { /* captcha or error */ }
    }

    return interaction.editReply(withBrand({
      embeds: [successEmbed('Loot Claimed', `${E.loot()} Claimed **${claimed}** of **${claimable.length}** rewards.`)],
    }));
  },
};
