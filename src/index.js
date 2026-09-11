import { createBot } from './bot.js';
import { config } from './config.js';

const client = createBot();
await client.login(config.botToken);
