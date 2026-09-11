import 'dotenv/config';
import { getDecryptedToken } from '../src/database/sqlite.js';
import { DiscordUserAPI } from '../src/engine/discord-api.js';
import { parseAllQuests } from '../src/engine/quest-parser.js';
import Database from 'better-sqlite3';

const db = new Database('./data/orbweaver.db', { readonly: true });
const row = db.prepare('SELECT discord_user_id, label FROM user_tokens LIMIT 1').get();
db.close();

if (!row) { console.log('no token'); process.exit(0); }

const token = getDecryptedToken(row.discord_user_id, row.label)
  || getDecryptedToken(row.discord_user_id, 'default')
  || getDecryptedToken(row.discord_user_id, 'main');
if (!token) { console.log('decrypt failed'); process.exit(0); }

const api = new DiscordUserAPI(token);
const raw = await api.fetchAllQuests();
const parsed = parseAllQuests(raw);
console.log('raw sources:', raw.length, 'parsed:', parsed.length);
for (const q of parsed) {
  console.log('-', q.name, q.taskInfo.type, q.enrolled ? 'enrolled' : 'new');
}
process.exit(0);
