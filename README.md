# Orbweaver

Discord quest bot. Simple slash commands, auto-registers on startup.

## Setup

```bash
npm install
cp .env.example .env   # add DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
npm run dev
```

Set `DISCORD_GUILD_ID` for instant slash commands.

## Commands

| Command | What it does |
|---------|-------------|
| `/token add` | Save your Discord token |
| `/token check` | Verify token |
| `/quests list` | Show quests |
| `/quests all` | Complete all at once |
| `/quests turbo` | Fast complete |
| `/quests claim` | Claim rewards |
| `/settings view` | Settings |
| `/help` | Full list |

## Notes

- Accept a quest in Discord first, then run `/quests list`
- Tokens stored encrypted in local SQLite
- Use at your own risk
