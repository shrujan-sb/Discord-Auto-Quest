import 'dotenv/config';
import { registerCommands } from './register-commands.js';

await registerCommands();
console.log('Done. Start the bot with: npm run dev');
