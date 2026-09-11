import 'dotenv/config';

const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error('Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

export const config = {
  botToken: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID || null,
  encryptionKey: process.env.ENCRYPTION_KEY || null,
  turboMultiplier: Math.max(1, parseInt(process.env.TURBO_MULTIPLIER || '15', 10)),
  brand: {
    name: 'Orbweaver',
    tagline: 'Weave through quests at lightspeed',
    color: 0x5865f2,
    accent: 0x00d4aa,
    warn: 0xfaa61a,
    error: 0xed4245,
    success: 0x3ba55c,
  },
};
