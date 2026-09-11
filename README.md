# Orbweaver

A Discord slash-command bot that finds quests on your account, joins them for you,
and runs them in parallel. Built for people who want to automate the grind without
a complicated setup.

## What it does

- **Finds every quest** on your account via Discord's quest API (no need to accept
  them manually first)
- **Auto-accepts** all available quests before a run, or on demand with
  `/quests accept`
- **Runs quests simultaneously** — video, play-on-desktop, stream, and activity
  quests all progress at the same time
- **Stores tokens safely** — user tokens are AES-256-GCM encrypted in a local
  SQLite database
- **Custom emoji UI** — colorful application emojis in embeds (optional upload
  step below)

## Setup

**Requirements:** Node.js 18 or newer.

```bash
git clone https://github.com/shrujan-sb/Discord-Auto-Quest.git
cd Discord-Auto-Quest
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
|----------|------------|
| `DISCORD_BOT_TOKEN` | Your bot token from the [Discord Developer Portal](https://discord.com/developers/applications) |
| `DISCORD_CLIENT_ID` | The same application's Client ID |
| `DISCORD_GUILD_ID` | Your server ID — **recommended** so slash commands appear instantly |
| `ENCRYPTION_KEY` | 32-byte hex key for token encryption. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Start the bot:

```bash
npm run dev
```

Slash commands register automatically on startup. Invite the bot to your server
with the `applications.commands` scope.

### Optional: upload custom emojis

Emoji PNGs live in `assets/emojis/`. To upload them to your bot application so
embeds use custom icons instead of Unicode fallbacks:

```bash
npm run upload-emojis
```

This writes `data/emoji-map.json` (gitignored) with the Discord emoji IDs.

## Two different tokens

Orbweaver uses **two** tokens — don't mix them up:

| Token | Where it goes | Purpose |
|-------|---------------|---------|
| **Bot token** | `.env` → `DISCORD_BOT_TOKEN` | Powers the slash-command bot |
| **User token** | `/token add` in Discord | Reads and completes quests on your account |

Quest APIs only work with a **user** token. If `/quests list` is empty but your
token is valid, you probably saved the bot token by mistake.

> **How to get your user token:** This is sensitive — never share it. Use your
> browser's developer tools on Discord (Network tab → any API request →
> `Authorization` header). Orbweaver encrypts it locally and never logs it.

## Commands

### Token

| Command | Description |
|---------|-------------|
| `/token add` | Save your Discord user token (optional `label`, default `main`) |
| `/token check` | Verify a token and show how many quests were found |
| `/token list` | List saved token labels |
| `/token remove` | Remove a saved token |

### Quests

| Command | Description |
|---------|-------------|
| `/quests list` | Show all active quests on the account |
| `/quests info` | Details for a specific quest (name search) |
| `/quests accept` | Join every available quest without running them |
| `/quests all` | Accept and complete all quests **at the same time** |
| `/quests run` | Accept and complete quests **one after another** |
| `/quests turbo` | Same as `/quests all`, with tighter progress polling |
| `/quests status` | Live progress of the current run |
| `/quests stop` | Abort the current run |
| `/quests claim` | Attempt to claim finished rewards |

### Settings

| Command | Description |
|---------|-------------|
| `/settings view` | Show your preferences |
| `/settings turbo` | Default turbo mode on/off for `/quests all` |
| `/settings claim` | Auto-attempt claiming after completion (on by default) |
| `/settings enroll` | Auto-accept quests before a run (on by default) |

### Help

| Command | Description |
|---------|-------------|
| `/help` | Full command list |

## Quest types and what actually happens

Discord validates progress on its servers. Orbweaver cannot bypass that — it sends
the same API calls the desktop client does.

| Quest type | What the bot does | How long it takes |
|------------|-------------------|-------------------|
| **Watch video** | Sends `video-progress` timestamps | Roughly the video length minus ~25 seconds. Discord rejects timestamps more than ~25s ahead of real elapsed time. |
| **Play on desktop** | Sends periodic `heartbeat` calls | **Real time.** A 15-minute quest takes 15 minutes. Heartbeats only credit time that has actually passed. |
| **Stream / activity** | Sends stream heartbeats | Real time, same as play-on-desktop |
| **Achievement in activity** | Skipped | Requires an in-game event from the activity's backend. The API returns 403 — not automatable. |
| **Console (Xbox / PlayStation)** | Skipped | Platform-locked, not automatable |

### Parallel vs sequential vs turbo

- **`/quests all`** — every runnable quest starts at once. Total wall time equals
  the **longest** quest, not the sum. Seven ~60-second video quests finish in
  ~43 seconds instead of ~325 seconds back-to-back.
- **`/quests run`** — same quests, but one finishes before the next starts.
- **`/quests turbo`** — runs in parallel like `/quests all`, but polls progress
  more aggressively within Discord's allowed window. It does **not** make a
  15-minute play quest finish in 1 minute. That limit is enforced server-side.

## Claiming rewards

Discord requires an **hCaptcha** to call `claim-reward`, so the bot cannot
collect orbs through the API. After a quest completes, open **Discover → Quests**
in the Discord app and tap **Claim** yourself. `/quests claim` will tell you if
captcha blocked it.

## Troubleshooting

**`/quests list` shows nothing**

1. Confirm `/token add` used your **user** token, not the bot token.
2. Run the diagnostic script:

   ```bash
   node scripts/debug-quests.js
   ```

   It prints the client build number, Discord's quest diagnostics, and every
   quest it can see. Orbweaver scrapes Discord's live `client_build_number` at
   startup — a stale number is the most common reason for an empty list.

**Slash commands don't appear**

- Set `DISCORD_GUILD_ID` in `.env` and restart.
- Make sure the bot was invited with `applications.commands` scope.
- Commands also sync when the bot joins a new server.

**Bot crashes on Node 24**

- Orbweaver uses `better-sqlite3` v12+, which supports Node 24. Run
  `npm install` after pulling.

## Project structure

```
src/
  index.js              Bot entry — registers commands, starts client
  bot.js                Discord client + interaction routing
  commands/             Slash command definitions and handlers
  engine/
    discord-api.js      User-token REST client (quest endpoints)
    quest-parser.js     Quest config → runnable task objects
    quest-engine.js     Parallel/sequential runner + completion logic
  database/sqlite.js    Encrypted token storage + settings
  utils/                Embeds, emojis, crypto helpers
assets/emojis/          Custom 3D emoji PNGs (Fluent UI, MIT)
scripts/debug-quests.js Diagnostic — quest count + API health
data/                   Local SQLite DB + emoji map (gitignored)
```

## Disclaimer

Automating Discord quests violates Discord's Terms of Service and can result in
account action. This project is for educational purposes. Use at your own risk.

## License

MIT — see [LICENSE](LICENSE).
