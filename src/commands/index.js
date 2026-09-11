import * as token from './token.js';
import * as quest from './quest.js';
import * as settings from './settings.js';
import * as help from './help.js';

export const commands = [
  ...token.commands,
  ...quest.commands,
  ...settings.commands,
  ...help.commands,
];

export const handlers = new Map();

for (const cmd of [token, quest, settings, help]) {
  for (const [name, handler] of Object.entries(cmd.handlers)) {
    handlers.set(name, handler);
  }
}
