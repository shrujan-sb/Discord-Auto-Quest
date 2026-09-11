import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config.js';
import { E, eObj, eUrl, taskIcon } from './emojis.js';

const { brand } = config;

export { E };

export function baseEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(brand.color)
    .setAuthor({
      name: brand.name,
      iconURL: eUrl('spider') || 'attachment://orbweaver-logo.png',
    })
    .setTitle(`${E.spider()} ${title}`)
    .setDescription(description)
    .setFooter({ text: brand.tagline, iconURL: eUrl('weave') })
    .setTimestamp();
}

export function successEmbed(title, description) {
  return baseEmbed(title, description).setColor(brand.success).setThumbnail(eUrl('check'));
}

export function warnEmbed(title, description) {
  return baseEmbed(title, description).setColor(brand.warn).setThumbnail(eUrl('warning'));
}

export function errorEmbed(title, description) {
  return baseEmbed(title, description).setColor(brand.error).setThumbnail(eUrl('skull'));
}

export function questCard(quest, index) {
  const task = quest.taskInfo;
  const progress = quest.progress;
  const pct = task?.target ? Math.min(100, Math.round((progress / task.target) * 100)) : 0;
  const bar = progressBar(pct);
  const orbs = quest.orbReward ? `${E.orb()} **${quest.orbReward}** Orbs` : `${E.gem()} Collectible`;
  const status = quest.completed
    ? `${E.check()} Done`
    : quest.enrolled
      ? `${E.clock()} ${formatDuration(progress)}/${formatDuration(task?.target || 0)}`
      : `${E.spark()} Not enrolled`;

  return `**${index + 1}. ${quest.name}**\n${bar} \`${pct}%\` · ${status}\n${taskIcon(task?.type)} \`${task?.type || 'UNKNOWN'}\` · ${orbs}`;
}

export function progressBar(pct) {
  const filled = Math.round(pct / 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
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
    : 'No active quests right now. Check back when Discord drops new ones!')
    .setThumbnail(eUrl('radar'));

  if (quests.length) {
    const lines = quests.slice(0, 10).map((q, i) => questCard(q, i));
    embed.addFields({ name: `${E.weave()} Active Quests`, value: lines.join('\n\n') });
    if (quests.length > 10) {
      embed.addFields({ name: '…', value: `_and ${quests.length - 10} more_` });
    }
  }

  return embed;
}

export function buildRunStatusEmbed(runState) {
  const embed = baseEmbed('Live Pulse', runState.message || 'Tracking quest completion…')
    .setThumbnail(eUrl('bolt'));

  if (runState.tasks?.length) {
    const lines = runState.tasks.map(t => {
      const icon = t.status === 'COMPLETED' ? E.check()
        : t.status === 'FAILED' ? E.cross()
          : t.status === 'RUNNING' ? E.bolt() : E.clock();
      const pct = t.max ? Math.round((t.cur / t.max) * 100) : 0;
      return `${icon} **${t.name}** — ${progressBar(pct)} ${pct}%`;
    });
    embed.addFields({ name: `${E.rocket()} Progress`, value: lines.join('\n') });
  }

  embed.setColor(runState.done ? brand.success : brand.accent);
  return embed;
}

export function helpButtons() {
  const keyBtn = new ButtonBuilder()
    .setCustomId('help_tokens')
    .setLabel('Token Guide')
    .setStyle(ButtonStyle.Secondary);
  const keyEmoji = eObj('key');
  if (keyEmoji) keyBtn.setEmoji(keyEmoji);

  const modeBtn = new ButtonBuilder()
    .setCustomId('help_modes')
    .setLabel('Run Modes')
    .setStyle(ButtonStyle.Primary);
  const boltEmoji = eObj('bolt');
  if (boltEmoji) modeBtn.setEmoji(boltEmoji);

  const ghBtn = new ButtonBuilder()
    .setLabel('GitHub')
    .setStyle(ButtonStyle.Link)
    .setURL('https://github.com/shrujan-sb/Discord-Auto-Quest');
  const pkgEmoji = eObj('package');
  if (pkgEmoji) ghBtn.setEmoji(pkgEmoji);

  return new ActionRowBuilder().addComponents(keyBtn, modeBtn, ghBtn);
}
