import { SlashCommandBuilder } from 'discord.js';
import { buildHelpEmbeds } from '../utils/help-content.js';
import { helpButtons } from '../utils/embeds.js';
import { withBrand } from '../utils/reply.js';

async function sendHelp(interaction) {
  const embeds = buildHelpEmbeds();
  return interaction.reply(withBrand({
    embeds,
    components: [helpButtons()],
  }));
}

export const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all Orbweaver commands and quick-start guide'),

  new SlashCommandBuilder()
    .setName('oracle')
    .setDescription('Orbweaver help & command reference (alias for /help)'),
];

export const handlers = {
  help: sendHelp,
  oracle: sendHelp,
};
