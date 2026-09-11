import { SlashCommandBuilder } from 'discord.js';
import { embed } from '../utils/embeds.js';

const HELP = `**Token**
\`/token add\` · save token
\`/token check\` · verify token
\`/token list\` · list tokens
\`/token remove\` · delete token

**Quests**
\`/quests list\` · show quests
\`/quests all\` · complete all at once
\`/quests run\` · complete one by one
\`/quests turbo\` · fast mode (~1min)
\`/quests stop\` · abort run
\`/quests status\` · check progress
\`/quests claim\` · claim rewards
\`/quests info\` · quest details

**Settings**
\`/settings view\` · show settings
\`/settings turbo\` · toggle turbo
\`/settings claim\` · toggle auto-claim
\`/settings enroll\` · toggle auto-enroll`;

export const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all commands'),
];

export const handlers = {
  help: async (ix) => ix.reply({ embeds: [embed('Commands', HELP)] }),
};
