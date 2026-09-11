import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dirname, '../../data/emoji-map.json');

const UNICODE = {
  orb: '🪙', fire: '🔥', sparkles: '✨', rocket: '🚀',
  'spider-web': '🕸️', spider: '🕷️', gem: '💎', check: '✅',
  warning: '⚠️', cross: '❌', clock: '⏱️', bolt: '⚡',
  crown: '👑', key: '🔑', package: '📦', gamepad: '🎮',
  phone: '📱', stream: '📡', target: '🎯', trophy: '🏆',
  medal: '🎖️', clapper: '🎬', radar: '📡', weave: '🧵',
  loot: '💰', skull: '💀',
};

let emojiMap = {};

export function loadEmojiMap() {
  if (existsSync(MAP_PATH)) {
    try { emojiMap = JSON.parse(readFileSync(MAP_PATH, 'utf8')); } catch { emojiMap = {}; }
  }
  return emojiMap;
}

export function e(key) {
  const entry = emojiMap[key];
  if (entry?.id && entry?.name) return `<:${entry.name}:${entry.id}>`;
  return UNICODE[key] || '•';
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
  key: () => e('key'),
  loot: () => e('loot'),
  radar: () => e('radar'),
  skull: () => e('skull'),
};

export function taskIcon(type) {
  const m = {
    WATCH_VIDEO: 'clapper', WATCH_VIDEO_ON_MOBILE: 'phone',
    PLAY_ON_DESKTOP: 'gamepad', PLAY_ON_DESKTOP_V2: 'gamepad',
    STREAM_ON_DESKTOP: 'stream', PLAY_ACTIVITY: 'target',
    ACHIEVEMENT_IN_ACTIVITY: 'trophy', ACHIEVEMENT_IN_GAME: 'medal',
  };
  return e(m[type] || 'warning');
}
