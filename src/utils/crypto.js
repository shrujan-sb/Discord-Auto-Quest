import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';

function deriveKey() {
  const seed = config.encryptionKey || 'orbweaver-default-key-change-me-in-production';
  return scryptSync(seed, 'orbweaver-salt', 32);
}

export function encrypt(text) {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(payload) {
  const key = deriveKey();
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskToken(token) {
  if (!token || token.length < 12) return '••••••••';
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}
