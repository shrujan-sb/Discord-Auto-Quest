import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config.js';

const { brand } = config;

const E = {
  orb: '🪙',
  fire: '🔥',
  spark: '✨',
  rocket: '🚀',
  spider: '🕸️',
  gem: '💎',
  check: '✅',
  warn: '⚠️',
  cross: '❌',
  clock: '⏱️',
  weave: '🕷️',
  bolt: '⚡',
  crown: '👑',
};

export { E };

export function baseEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(brand.color)
    .setAuthor({ name: brand.name, iconURL: 'attachment://orbweaver-logo.png' })
    .setTitle(`${E.spider} ${title}`)
    .setDescription(description)
    .setFooter({ text: brand.tagline })
    .setTimestamp();
}

export function successEmbed(title, description) {
  return baseEmbed(title, description).setColor(brand.success);
}

export function warnEmbed(title, description) {
  return baseEmbed(title, description).setColor(brand.warn);
}

export function errorEmbed(title, description) {
  return baseEmbed(title, description).setColor(brand.error);
}

export function questCard(quest, index) {
  const task = quest.taskInfo;
  const progress = quest.progress;
  const pct = task?.target ? Math.min(100, Math.round((progress / task.target) * 100)) : 0;
  const bar = progressBar(pct);
  const orbs = quest.orbReward ? `${E.orb} **${quest.orbReward}** Orbs` : `${E.gem} Collectible`;
  const status = quest.completed
    ? `${E.check} Done`
    : quest.enrolled
      ? `${E.clock} ${formatDuration(progress)}/${formatDuration(task?.target || 0)}`
      : `${E.spark} Not enrolled`;

  return `**${index + 1}. ${quest.name}**\n${bar} \`${pct}%\` · ${status}\n${getTaskIcon(task?.type)} \`${task?.type || 'UNKNOWN'}\` · ${orbs}`;
}

export function progressBar(pct) {
  const filled = Math.round(pct / 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

export function getTaskIcon(type) {
  const icons = {
    WATCH_VIDEO: '🎬',
    WATCH_VIDEO_ON_MOBILE: '📱',
    PLAY_ON_DESKTOP: '🎮',
    PLAY_ON_DESKTOP_V2: '🎮',
    STREAM_ON_DESKTOP: '📡',
    PLAY_ACTIVITY: '🎯',
    ACHIEVEMENT_IN_ACTIVITY: '🏆',
    ACHIEVEMENT_IN_GAME: '🎖️',
  };
  return icons[type] || '❓';
}

export function formatDuration(seconds) {
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function buildQuestListEmbed(quests, title = 'Quest Radar') {
  const embed = baseEmbed(title, quests.length
    ? `Found **${quests.length}** active quest${quests.length === 1 ? '' : 's'} on your account.`
    : 'No active quests right now. Check back when Discord drops new ones!');

  if (quests.length) {
    const lines = quests.slice(0, 10).map((q, i) => questCard(q, i));
    embed.addFields({ name: `${E.weave} Active Quests`, value: lines.join('\n\n') });
    if (quests.length > 10) {
      embed.addFields({ name: '…', value: `_and ${quests.length - 10} more_` });
    }
  }

  return embed;
}

export function buildRunStatusEmbed(runState) {
  const embed = baseEmbed('Live Pulse', runState.message || 'Tracking quest completion…');

  if (runState.tasks?.length) {
    const lines = runState.tasks.map(t => {
      const icon = t.status === 'COMPLETED' ? E.check
        : t.status === 'FAILED' ? E.cross
          : t.status === 'RUNNING' ? E.bolt : E.clock;
      const pct = t.max ? Math.round((t.cur / t.max) * 100) : 0;
      return `${icon} **${t.name}** — ${progressBar(pct)} ${pct}%`;
    });
    embed.addFields({ name: `${E.rocket} Progress`, value: lines.join('\n') });
  }

  embed.setColor(runState.done ? brand.success : brand.accent);
  return embed;
}

export function helpButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_tokens')
      .setLabel('Token Guide')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('help_modes')
      .setLabel('Run Modes')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel('GitHub')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Link)
      .setURL('https://github.com/shrujan-sb/Discord-Auto-Quest'),
  );
}
