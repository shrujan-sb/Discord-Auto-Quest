import * as token from './token.js';
import * as quests from './quests.js';
import * as settings from './settings.js';
import * as help from './help.js';

export const commands = [
  ...token.commands,
  ...quests.commands,
  ...settings.commands,
  ...help.commands,
];

export const handlers = new Map();

for (const mod of [token, quests, settings, help]) {
  for (const [name, handler] of Object.entries(mod.handlers)) {
    handlers.set(name, handler);
  }
}
