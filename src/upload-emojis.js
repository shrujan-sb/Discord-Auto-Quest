import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getManifest, saveEmojiMap } from './utils/emojis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('Set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

const manifest = getManifest();
const map = {};

console.log('🎨 Uploading Orbweaver custom emojis to Discord application…\n');

for (const [key, meta] of Object.entries(manifest.emojis)) {
  const filePath = join(ROOT, 'assets/emojis', meta.file);
  const image = readFileSync(filePath);
  const base64 = `data:image/png;base64,${image.toString('base64')}`;

  try {
    const res = await fetch(`https://discord.com/api/v10/applications/${clientId}/emojis`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: meta.discord_name, image: base64 }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Emoji might already exist — try to find it
      if (data.code === 50035 || data.message?.includes('already')) {
        const list = await fetch(`https://discord.com/api/v10/applications/${clientId}/emojis`, {
          headers: { Authorization: `Bot ${token}` },
        }).then(r => r.json());

        const existing = list.items?.find(em => em.name === meta.discord_name);
        if (existing) {
          map[key] = { id: existing.id, name: existing.name };
          console.log(`  ♻️  ${meta.discord_name} (already exists)`);
          continue;
        }
      }
      console.error(`  ❌ ${meta.discord_name}: ${data.message || res.status}`);
      continue;
    }

    map[key] = { id: data.id, name: data.name };
    console.log(`  ✅ ${data.name} → ${data.id}`);
  } catch (err) {
    console.error(`  ❌ ${meta.discord_name}: ${err.message}`);
  }

  await new Promise(r => setTimeout(r, 500));
}

saveEmojiMap(map);
console.log(`\n🕸️  Done! ${Object.keys(map).length} emojis saved to data/emoji-map.json`);
