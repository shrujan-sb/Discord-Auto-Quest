import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { E, eUrl } from './emojis.js';

const { brand } = config;

function cmdLine(icon, name, desc) {
  return `${icon} \`${name}\`\n> ${desc}`;
}

export function buildHelpEmbeds() {
  const icon = eUrl('spider') || 'attachment://orbweaver-logo.png';

  const welcome = new EmbedBuilder()
    .setColor(brand.color)
    .setAuthor({ name: `${brand.name} · Command Center`, iconURL: icon })
    .setTitle(`${E.spider()} Welcome to the Loom`)
    .setDescription([
      `*${brand.tagline}*`,
      '',
      'Orbweaver automates Discord quests — parallel, sequential, or turbo-fast.',
      '',
      '**Quick Start**',
      `${E.key()} \`/thread-token add\` — save your token`,
      `${E.radar()} \`/radar\` — scan active quests`,
      `${E.fire()} \`/blaze\` — complete everything at once`,
    ].join('\n'))
    .setThumbnail(eUrl('orb') || icon);

  const banner = eUrl('spider-web');
  if (banner) welcome.setImage(banner);

  const tokens = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`${E.key()} Token Management`)
    .addFields(
      {
        name: 'Commands',
        value: [
          cmdLine(E.key(), '/thread-token add', 'Save your Discord account token (encrypted)'),
          cmdLine(E.check(), '/thread-token verify', 'Check if your token is still valid'),
          cmdLine(E.weave(), '/thread-token list', 'View all saved tokens'),
          cmdLine(E.cross(), '/thread-token remove', 'Delete a saved token'),
        ].join('\n\n'),
      },
    );

  const quests = new EmbedBuilder()
    .setColor(brand.accent)
    .setTitle(`${E.radar()} Quest Weaving`)
    .addFields(
      {
        name: 'Scan & Inspect',
        value: [
          cmdLine(E.radar(), '/radar', 'Scan your account for active quests'),
          cmdLine(E.gem(), '/inspect', 'Deep-dive into a specific quest'),
        ].join('\n\n'),
        inline: false,
      },
      {
        name: 'Completion Modes',
        value: [
          cmdLine(E.fire(), '/blaze', 'Complete ALL quests simultaneously'),
          cmdLine(E.clock(), '/parade', 'Complete quests one after another'),
          cmdLine(E.orb(), '/orb-hunt', 'Prioritize high-orb rewards first'),
          cmdLine(E.gem(), '/heavy-lift', 'Tackle longest quests first'),
          cmdLine(E.rocket(), '/turbo', 'Lightspeed — 15min quests in ~1min'),
        ].join('\n\n'),
        inline: false,
      },
      {
        name: 'Control',
        value: [
          cmdLine(E.bolt(), '/pulse', 'Live progress of active weave'),
          cmdLine(E.cross(), '/abort', 'Stop all running completions'),
          cmdLine(E.loot(), '/claim-loot', 'Claim rewards for completed quests'),
        ].join('\n\n'),
        inline: false,
      },
    );

  const settings = new EmbedBuilder()
    .setColor(brand.warn)
    .setTitle(`${E.weave()} Settings & Help`)
    .addFields(
      {
        name: 'Configuration',
        value: [
          cmdLine(E.rocket(), '/loom-config view', 'View your preferences'),
          cmdLine(E.bolt(), '/loom-config turbo', 'Toggle default turbo mode'),
          cmdLine(E.loot(), '/loom-config auto-claim', 'Toggle auto-claim rewards'),
          cmdLine(E.spark(), '/loom-config auto-enroll', 'Toggle auto-enroll quests'),
        ].join('\n\n'),
      },
      {
        name: 'Disclaimer',
        value: `${E.warn()} Quest automation may violate Discord ToS. Use at your own risk on alt accounts.`,
      },
    )
    .setFooter({ text: `${brand.name} · /help`, iconURL: eUrl('weave') })
    .setTimestamp();

  return [welcome, tokens, quests, settings].filter(Boolean);
}
