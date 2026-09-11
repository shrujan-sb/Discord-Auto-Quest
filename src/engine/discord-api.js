const API_BASE = 'https://discord.com/api/v10';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.309 Electron/28.2.10 Chrome/120.0.6099.291 Safari/537.36';

const SUPER = Buffer.from(JSON.stringify({
  os: 'Windows', browser: 'Discord Client', release_channel: 'stable',
  client_version: '0.0.309', os_version: '10.0.22631', os_arch: 'x64',
  app_arch: 'x64', system_locale: 'en-US', client_build_number: 254573,
  native_build_number: 48384, client_event_source: null,
})).toString('base64');

export class DiscordUserAPI {
  constructor(token) {
    this.token = token.replace(/^Bearer\s+/i, '').trim();
  }

  async request(method, path, body = null) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const headers = {
      Authorization: this.token,
      'Content-Type': 'application/json',
      'User-Agent': DESKTOP_UA,
      'X-Super-Properties': SUPER,
    };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const err = new Error(data?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }

  getCurrentUser() { return this.get('/users/@me'); }

  async getQuests() {
    const data = await this.get('/quests/@me');
    return data.quests || [];
  }

  enrollQuest(questId, trafficSealed = null) {
    return this.post(`/quests/${questId}/enroll`, {
      location: 11,
      is_targeted: false,
      metadata_sealed: null,
      traffic_metadata_sealed: trafficSealed,
    });
  }

  sendVideoProgress(questId, timestamp) {
    return this.post(`/quests/${questId}/video-progress`, { timestamp });
  }

  sendHeartbeat(questId, payload) {
    return this.post(`/quests/${questId}/heartbeat`, payload);
  }

  claimReward(questId) {
    return this.post(`/quests/${questId}/claim-reward`, { location: 11, platform: 0 });
  }

  async getApplication(appId) {
    const data = await this.get(`/applications/public?application_ids=${appId}`);
    return data?.[0] || null;
  }

  async getActivityStreamKey() {
    const me = await this.getCurrentUser();
    try {
      const channels = await this.get('/users/@me/channels');
      const dm = channels.find(c => c.type === 1);
      if (dm) return `call:${dm.id}:1`;
    } catch { /* fall through */ }

    const guilds = await this.get('/users/@me/guilds');
    for (const guild of guilds.slice(0, 8)) {
      try {
        const channels = await this.get(`/guilds/${guild.id}/channels`);
        const voice = channels.find(c => c.type === 2);
        if (voice) return `call:${voice.id}:1`;
      } catch { /* skip */ }
    }
    return `call:${me.id}:1`;
  }

  async getGameHeartbeatPayload(appId) {
    const app = await this.getApplication(appId);
    if (!app) return { application_id: String(appId) };

    const exe = app.executables?.find(x => x.os === 'win32')?.name?.replace('>', '')
      || app.name.replace(/[/\\:*?"<>|]/g, '');
    const exePath = `c:/program files/${app.name.toLowerCase()}/${exe}`;

    return {
      application_id: String(appId),
      terminal: false,
      executable_path: exePath,
      executable_fingerprint: exePath,
    };
  }
}
