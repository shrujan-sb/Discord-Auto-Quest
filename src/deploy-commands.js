import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';

const rest = new REST({ version: '10' }).setToken(config.botToken);
const body = commands.map(c => c.toJSON());

try {
  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body },
    );
    console.log(`Deployed ${body.length} commands to guild ${config.guildId}`);
  } else {
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body },
    );
    console.log(`Deployed ${body.length} global commands`);
  }
} catch (err) {
  console.error('Deploy failed:', err);
  process.exit(1);
}
