import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { encrypt, decrypt } from '../utils/crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'orbweaver.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS user_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'default',
    token_enc TEXT NOT NULL,
    discord_account_id TEXT,
    discord_username TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(discord_user_id, label)
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    discord_user_id TEXT PRIMARY KEY,
    turbo_mode INTEGER DEFAULT 0,
    auto_claim INTEGER DEFAULT 1,
    auto_enroll INTEGER DEFAULT 1,
    default_mode TEXT DEFAULT 'blaze'
  );

  CREATE TABLE IF NOT EXISTS quest_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    quest_name TEXT,
    status TEXT,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const stmts = {
  addToken: db.prepare(`
    INSERT INTO user_tokens (discord_user_id, label, token_enc, discord_account_id, discord_username)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_user_id, label) DO UPDATE SET
      token_enc = excluded.token_enc,
      discord_account_id = excluded.discord_account_id,
      discord_username = excluded.discord_username
  `),
  removeToken: db.prepare('DELETE FROM user_tokens WHERE discord_user_id = ? AND label = ?'),
  getToken: db.prepare('SELECT * FROM user_tokens WHERE discord_user_id = ? AND label = ?'),
  listTokens: db.prepare('SELECT id, label, discord_account_id, discord_username, created_at FROM user_tokens WHERE discord_user_id = ?'),
  getSettings: db.prepare('SELECT * FROM user_settings WHERE discord_user_id = ?'),
  upsertSettings: db.prepare(`
    INSERT INTO user_settings (discord_user_id, turbo_mode, auto_claim, auto_enroll, default_mode)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      turbo_mode = excluded.turbo_mode,
      auto_claim = excluded.auto_claim,
      auto_enroll = excluded.auto_enroll,
      default_mode = excluded.default_mode
  `),
  logQuest: db.prepare('INSERT INTO quest_logs (discord_user_id, quest_id, quest_name, status, message) VALUES (?, ?, ?, ?, ?)'),
};

export function saveToken(discordUserId, label, token, accountInfo = {}) {
  stmts.addToken.run(
    discordUserId,
    label,
    encrypt(token),
    accountInfo.id || null,
    accountInfo.username || null,
  );
}

export function getDecryptedToken(discordUserId, label = 'default') {
  const row = stmts.getToken.get(discordUserId, label);
  if (!row) return null;
  return decrypt(row.token_enc);
}

export function removeToken(discordUserId, label) {
  return stmts.removeToken.run(discordUserId, label).changes > 0;
}

export function listTokens(discordUserId) {
  return stmts.listTokens.all(discordUserId);
}

export function getSettings(discordUserId) {
  const row = stmts.getSettings.get(discordUserId);
  return row || { turbo_mode: 0, auto_claim: 1, auto_enroll: 1, default_mode: 'blaze' };
}

export function saveSettings(discordUserId, settings) {
  const current = getSettings(discordUserId);
  stmts.upsertSettings.run(
    discordUserId,
    settings.turbo_mode ?? current.turbo_mode,
    settings.auto_claim ?? current.auto_claim,
    settings.auto_enroll ?? current.auto_enroll,
    settings.default_mode ?? current.default_mode,
  );
}

export function logQuest(discordUserId, questId, questName, status, message) {
  stmts.logQuest.run(discordUserId, questId, questName, status, message);
}
