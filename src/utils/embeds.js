import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { E, taskIcon } from './emojis.js';

export { E, taskIcon };

const { brand } = config;

export function ui(title, desc, color = brand.color) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `Orbweaver` })
    .setTitle(`${E.spider()} ${title}`)
    .setDescription(desc)
    .setFooter({ text: brand.tagline })
    .setTimestamp();
}

export const ok = (t, d) => ui(t, d, brand.success);
export const warn = (t, d) => ui(t, d, brand.warn);
export const err = (t, d) => ui(t, d, brand.error);

export function bar(pct) {
  const n = Math.min(10, Math.max(0, Math.round(pct / 10)));
  return `${'▰'.repeat(n)}${'▱'.repeat(10 - n)}`;
}

export function fmtSec(s) {
  const sec = Math.floor(s || 0);
  const m = Math.floor(sec / 60);
  return m ? `${m}m ${sec % 60}s` : `${sec}s`;
}

function statusTag(q) {
  if (q.completed) return `${E.check()} Done`;
  if (!q.automatable) return `${E.warn()} Manual`;
  if (q.enrolled) return `${E.bolt()} Active`;
  return `${E.spark()} New`;
}

export function questLine(q, i) {
  const pct = q.taskInfo?.target
    ? Math.min(100, Math.round((q.progress / q.taskInfo.target) * 100)) : 0;
  const prog = q.enrolled ? ` ${bar(pct)} \`${pct}%\`` : '';
  const orbs = q.orbReward ? ` ${E.orb()}${q.orbReward}` : '';
  return `${taskIcon(q.taskInfo.type)} **${q.name}**${orbs}\n└ ${statusTag(q)} · \`${q.taskInfo.type}\`${prog}`;
}

export function questListEmbed(quests, diag = null) {
  if (!quests.length) {
    const lines = [
      `${E.warn()} No active quests on this account right now.`,
      '',
      `${E.key()} Make sure \`/token add\` used your **user** token — a bot token always sees zero quests.`,
      `${E.radar()} You don't need to accept anything first; \`/quests all\` joins them for you.`,
    ];
    if (diag) {
      lines.push('', '**API scan:**', `\`@me\` → ${diag.enrolled ?? '?'} · excluded → ${diag.excluded ?? '?'}`);
      if (diag.suspended) lines.push(`${E.skull()} Quest access suspended`);
      if (diag.blocked) lines.push(`${E.clock()} Enrollment blocked until ${diag.blocked}`);
      if (diag.error) lines.push(`${E.cross()} ${diag.error}`);
    }
    return warn('No Quests', lines.join('\n'));
  }

  const active = quests.filter(q => !q.completed && !q.isExpired);
  const e = ui('Quest Radar', `${E.radar()} **${active.length}** quest${active.length === 1 ? '' : 's'} ready`);

  const lines = active.slice(0, 12).map((q, i) => questLine(q, i));
  e.addFields({
    name: `${E.weave()} Your Quests`,
    value: lines.join('\n\n') || '_none_',
  });

  if (active.length > 12) e.addFields({ name: '…', value: `_+${active.length - 12} more_` });

  return e;
}

export function statusEmbed(tasks, msg) {
  const e = ui('Live Status', msg || `${E.bolt()} Running…`, brand.accent);
  if (tasks?.length) {
    const lines = tasks.map(t => {
      const pct = t.max ? Math.round((t.cur / t.max) * 100) : 0;
      const icon = t.status === 'DONE' ? E.check()
        : t.status === 'FAILED' ? E.cross()
          : t.status === 'SKIPPED' ? E.warn() : E.bolt();
      return `${icon} **${t.name}**\n${bar(pct)} \`${pct}%\``;
    });
    e.addFields({ name: `${E.rocket()} Progress`, value: lines.join('\n\n') });
  }
  return e;
}

export function helpEmbed() {
  return ui('Commands', [
    `${E.key()} **Token**`,
    '`/token add` · `/token check` · `/token list` · `/token remove`',
    '',
    `${E.radar()} **Quests**`,
    '`/quests list` · `/quests accept` · `/quests all` · `/quests run`',
    '`/quests turbo` · `/quests stop` · `/quests status` · `/quests claim` · `/quests info`',
    '',
    `${E.gem()} **Settings**`,
    '`/settings view` · `/settings turbo` · `/settings claim` · `/settings enroll`',
  ].join('\n'));
}

// re-export for commands that use old names
export { ui as embed, ok as successEmbed, warn as warnEmbed, err as errorEmbed };
