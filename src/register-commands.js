import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';

let commandBody = null;

export function getCommandBody() {
  if (!commandBody) commandBody = commands.map(c => c.toJSON());
  return commandBody;
}

export async function registerCommands(rest = null) {
  const api = rest ?? new REST({ version: '10' }).setToken(config.botToken);
  const body = getCommandBody();

  if (config.guildId) {
    await api.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body },
    );
    console.log(`✅ Registered ${body.length} slash commands → guild ${config.guildId}`);
    return { scope: 'guild', count: body.length };
  }

  await api.put(Routes.applicationCommands(config.clientId), { body });
  console.log(`✅ Registered ${body.length} global slash commands`);
  return { scope: 'global', count: body.length };
}

export async function syncGuildCommands(client, rest = null) {
  if (config.guildId) return;

  const api = rest ?? new REST({ version: '10' }).setToken(config.botToken);
  const body = getCommandBody();
  const guilds = [...client.guilds.cache.values()];

  if (!guilds.length) {
    console.log('ℹ️  Bot is not in any servers yet — invite it, then restart.');
    return;
  }

  console.log(`🔄 Syncing commands to ${guilds.length} server(s) for instant availability…`);

  for (const guild of guilds) {
    try {
      await api.put(
        Routes.applicationGuildCommands(config.clientId, guild.id),
        { body },
      );
      console.log(`   ↳ ${guild.name}`);
    } catch (err) {
      console.warn(`   ↳ ${guild.name}: ${err.message}`);
    }
  }
}

export async function syncSingleGuild(guildId, guildName = guildId, rest = null) {
  const api = rest ?? new REST({ version: '10' }).setToken(config.botToken);
  const body = getCommandBody();
  await api.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
  console.log(`   ↳ ${guildName}`);
}
