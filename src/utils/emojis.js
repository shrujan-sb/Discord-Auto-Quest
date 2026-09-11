import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const MANIFEST_PATH = join(ROOT, 'assets/emojis/manifest.json');
const MAP_PATH = join(ROOT, 'data/emoji-map.json');
const CDN_BASE = 'https://raw.githubusercontent.com/shrujan-sb/Discord-Auto-Quest/main/assets/emojis';

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
let emojiMap = {};

export function loadEmojiMap() {
  if (existsSync(MAP_PATH)) {
    try {
      emojiMap = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
      console.log(`🎨 Loaded ${Object.keys(emojiMap).length} custom emojis`);
    } catch {
      emojiMap = {};
    }
  }
  return emojiMap;
}

export function saveEmojiMap(map) {
  const dir = dirname(MAP_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
  emojiMap = map;
}

export function getManifest() {
  return manifest;
}

/** Inline custom emoji string for embeds/messages: <:ow_orb:123> */
export function e(key) {
  const entry = emojiMap[key];
  if (entry?.id && entry?.name) return `<:${entry.name}:${entry.id}>`;
  return `**${manifest.emojis[key]?.label || key}**`;
}

/** Discord emoji object for buttons/selects */
export function eObj(key) {
  const entry = emojiMap[key];
  if (entry?.id) return { id: entry.id };
  return null;
}

/** CDN URL for embed thumbnails when emoji not yet uploaded */
export function eUrl(key) {
  const file = manifest.emojis[key]?.file;
  if (!file) return null;
  const entry = emojiMap[key];
  if (entry?.id) return `https://cdn.discordapp.com/emojis/${entry.id}.png`;
  return `${CDN_BASE}/${file}`;
}

export function ePath(key) {
  const file = manifest.emojis[key]?.file;
  return file ? join(ROOT, 'assets/emojis', file) : null;
}

export const E = {
  orb: () => e('orb'),
  fire: () => e('fire'),
  spark: () => e('sparkles'),
  rocket: () => e('rocket'),
  spider: () => e('spider-web'),
  weave: () => e('spider'),
  gem: () => e('gem'),
  check: () => e('check'),
  warn: () => e('warning'),
  cross: () => e('cross'),
  clock: () => e('clock'),
  bolt: () => e('bolt'),
  crown: () => e('crown'),
  key: () => e('key'),
  package: () => e('package'),
  loot: () => e('loot'),
  radar: () => e('radar'),
  skull: () => e('skull'),
  video: () => e('clapper'),
};

export function taskIcon(type) {
  const map = {
    WATCH_VIDEO: 'clapper',
    WATCH_VIDEO_ON_MOBILE: 'phone',
    PLAY_ON_DESKTOP: 'gamepad',
    PLAY_ON_DESKTOP_V2: 'gamepad',
    STREAM_ON_DESKTOP: 'stream',
    PLAY_ACTIVITY: 'target',
    ACHIEVEMENT_IN_ACTIVITY: 'trophy',
    ACHIEVEMENT_IN_GAME: 'medal',
  };
  return e(map[type] || 'warning');
}
