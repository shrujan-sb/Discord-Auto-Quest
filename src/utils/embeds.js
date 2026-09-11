import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';

const { brand } = config;

export function embed(title, desc, color = brand.color) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: brand.name })
    .setTimestamp();
}

export function ok(title, desc) { return embed(title, desc, brand.success); }
export function warn(title, desc) { return embed(title, desc, brand.warn); }
export function err(title, desc) { return embed(title, desc, brand.error); }

export function bar(pct) {
  const n = Math.round(pct / 10);
  return '█'.repeat(n) + '░'.repeat(10 - n);
}

export function fmtSec(s) {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

export function questLine(q, i) {
  const pct = q.taskInfo?.target ? Math.min(100, Math.round((q.progress / q.taskInfo.target) * 100)) : 0;
  const st = q.completed ? 'done' : q.enrolled ? `${pct}%` : 'new';
  const orbs = q.orbReward ? ` · ${q.orbReward} orbs` : '';
  return `\`${i + 1}.\` **${q.name}** — ${st} · \`${q.taskInfo.type}\`${orbs}`;
}

export function questListEmbed(quests) {
  if (!quests.length) return embed('Quests', 'No quests found. Check the Quests tab in Discord and accept one first.');

  const lines = quests.slice(0, 15).map((q, i) => questLine(q, i));
  const extra = quests.length > 15 ? `\n_+${quests.length - 15} more_` : '';

  return embed('Quests', `${quests.length} found\n\n${lines.join('\n')}${extra}`);
}

export function statusEmbed(tasks, msg) {
  const e = embed('Status', msg || '');
  if (tasks?.length) {
    const lines = tasks.map(t => {
      const pct = t.max ? Math.round((t.cur / t.max) * 100) : 0;
      return `**${t.name}** ${bar(pct)} ${t.status}`;
    });
    e.addFields({ name: 'Tasks', value: lines.join('\n') });
  }
  return e;
}
