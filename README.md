# Orbweaver

A Discord quest automator with simple slash commands. Finds every quest on your
account, joins them all, and runs them at the same time.

## Setup

```bash
npm install
cp .env.example .env   # add DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
npm run dev
```

Slash commands register themselves on startup. Set `DISCORD_GUILD_ID` so they
show up instantly instead of waiting on Discord's global cache.

## Commands

| Command | What it does |
|---------|-------------|
| `/token add` | Save your Discord user token (encrypted locally) |
| `/token check` | Verify a saved token and count its quests |
| `/quests list` | Show every quest found on the account |
| `/quests accept` | Join every available quest |
| `/quests all` | Join and complete everything at once |
| `/quests run` | Complete one quest after another |
| `/quests turbo` | Complete everything as fast as Discord allows |
| `/quests status` | Live progress of the current run |
| `/quests stop` | Abort the current run |
| `/quests claim` | Claim finished rewards |
| `/settings view` | Show and change defaults |
| `/help` | Full command list |

Quests need a **user** token, not the bot token — the bot token goes in `.env`,
and your user token goes in `/token add`. A bot token sees zero quests.

## How fast it actually is

Discord validates quest progress on its own servers, so there are real limits
worth knowing before you expect a 15-minute quest to finish in 60 seconds:

- **Video quests** accept a timestamp up to ~25 seconds ahead of real elapsed
  time and reject anything further. Turbo rides just under that ceiling, so a
  clip finishes about 25 seconds early — a 59-second video takes ~35 seconds.
- **Play-on-desktop quests** are driven by heartbeats that only credit time that
  has genuinely passed, capped at 2 minutes per beat. A 15-minute quest takes
  15 minutes and cannot be shortened.
- **Achievement quests** are credited by an event from the game's own backend,
  which the quest API rejects outright. These are skipped and reported as manual.

The real speedup is parallelism: every quest runs simultaneously, so a batch
finishes in the time of the longest one instead of their sum. In testing, seven
video quests that would take 325 seconds back-to-back finished in 43 seconds.

## Claiming rewards

Discord puts `claim-reward` behind an hCaptcha, so the bot cannot collect orbs
for you. Quests are completed and then left ready to claim — open
**Discover → Quests** in Discord and tap **Claim**.

## Troubleshooting

If `/quests list` is empty, run `node scripts/debug-quests.js`. It prints the
client build number, Discord's quest diagnostics, and every quest it can see.
A stale build number is the usual cause of an empty list; Orbweaver scrapes the
live one at startup, but a blocked outbound request will fall back to a pinned
value.

## Notes

- Tokens are stored AES-256-GCM encrypted in a local SQLite database.
- Automating quests violates Discord's Terms of Service. Use at your own risk.
