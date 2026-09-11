import { SlashCommandBuilder } from 'discord.js';
import { helpEmbed } from '../utils/embeds.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all commands'),
];

export const handlers = {
  help: async (ix) => ix.reply({ embeds: [helpEmbed()] }),
};
