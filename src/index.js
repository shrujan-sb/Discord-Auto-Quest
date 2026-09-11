import { createBot } from './bot.js';
import { config } from './config.js';
import { loadEmojiMap } from './utils/emojis.js';

loadEmojiMap();

const client = createBot();
await client.login(config.botToken);
