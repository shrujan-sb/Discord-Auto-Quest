import 'dotenv/config';
import Database from 'better-sqlite3';
import { getDecryptedToken } from '../src/database/sqlite.js';
import { DiscordUserAPI, resolveBuildNumber } from '../src/engine/discord-api.js';
import { parseAllQuests, filterRunnableQuests } from '../src/engine/quest-parser.js';

const db = new Database('./data/orbweaver.db', { readonly: true });
const row = db.prepare('SELECT discord_user_id, label FROM user_tokens LIMIT 1').get();
db.close();

if (!row) { console.log('No token saved. Run /token add first.'); process.exit(0); }

const token = getDecryptedToken(row.discord_user_id, row.label)
  || getDecryptedToken(row.discord_user_id, 'default')
  || getDecryptedToken(row.discord_user_id, 'main');
if (!token) { console.log('Could not decrypt the stored token.'); process.exit(0); }

console.log('client build number:', await resolveBuildNumber());

const api = new DiscordUserAPI(token);
console.log('diagnostics:', JSON.stringify(await api.getDiagnostics()));

const all = parseAllQuests(await api.fetchAllQuests());
const runnable = filterRunnableQuests(all);
console.log(`\n${all.length} quests visible, ${runnable.length} still runnable:\n`);

for (const q of runnable) {
  console.log(
    `  ${q.enrolled ? '[joined]' : '[  new ]'} ${q.name.slice(0, 36).padEnd(36)}`
    + ` ${q.taskInfo.type.padEnd(23)} ${String(q.progress).padStart(4)}/${q.taskInfo.target}s`
    + ` ${q.orbReward} orbs${q.automatable ? '' : `  (manual: ${q.manualReason})`}`,
  );
}

process.exit(0);
