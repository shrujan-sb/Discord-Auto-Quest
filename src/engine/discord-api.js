import { randomUUID } from 'crypto';

const API_BASE = 'https://discord.com/api/v10';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.364 Electron/33.0.0 Chrome/130.0.6723.159 Safari/537.36';

const SUPER = Buffer.from(JSON.stringify({
  os: 'Windows', browser: 'Discord Client', release_channel: 'stable',
  client_version: '0.0.364', os_version: '10.0.22631', os_arch: 'x64',
  app_arch: 'x64', system_locale: 'en-US', client_build_number: 300000,
  native_build_number: 50000, client_event_source: null,
})).toString('base64');

let adSessionId = randomUUID();
let heartbeatSessionId = randomUUID();

export class DiscordUserAPI {
  constructor(token) {
    this.token = token.replace(/^Bearer\s+/i, '').trim();
  }

  headers() {
    return {
      Authorization: this.token,
      'Content-Type': 'application/json',
      'User-Agent': DESKTOP_UA,
      'X-Super-Properties': SUPER,
      'X-Discord-Locale': 'en-US',
      'X-Discord-Timezone': 'America/New_York',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  async request(method, path, body = null) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const opts = { method, headers: this.headers() };
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

  questQuery(extra = '') {
    const base = `client_ad_session_id=${adSessionId}&client_heartbeat_session_id=${heartbeatSessionId}`;
    return extra ? `${extra}&${base}` : base;
  }

  async getDiagnostics() {
    try {
      const me = await this.get('/quests/@me');
      return {
        enrolled: me.quests?.length ?? 0,
        excluded: me.excluded_quests?.length ?? 0,
        suspended: me.quest_access_suspended_until || null,
        blocked: me.quest_enrollment_blocked_until || null,
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  /** Fetch quests from every source Discord uses (aamiaa / Orion pattern). */
  async fetchAllQuests() {
    const map = new Map();

    const add = (raw) => {
      if (!raw?.id) return;
      if (!map.has(raw.id)) map.set(raw.id, normalizeRawQuest(raw));
      else {
        const existing = map.get(raw.id);
        if (!existing.user_status && raw.user_status) existing.user_status = raw.user_status;
        if (!existing.userStatus && raw.userStatus) existing.userStatus = raw.userStatus;
      }
    };

    let guildIds = '';
    try {
      const guilds = await this.get('/users/@me/guilds');
      guildIds = guilds.slice(0, 50).map(g => g.id).join(',');
    } catch { /* optional */ }

    try {
      const me = await this.get('/quests/@me');
      for (const q of me.quests || []) add(q);
      for (const q of me.excluded_quests || []) add(q);
    } catch (e) {
      console.warn('quests/@me:', e.message);
    }

    const placements = [3, 11, 12, 47, 50, 59, 62, 2, 1, 4, 5];
    for (const p of placements) {
      try {
        const guildQ = guildIds ? `&visible_guild_ids=${guildIds}` : '';
        const d = await this.get(`/quests/get-decisions?placement=${p}&num_decisions_requested=15${guildQ}&${this.questQuery()}`);
        for (const decision of d.decisions || []) {
          if (decision.quest) add(decision.quest);
          const cc = decision.creative?.creative_content;
          if (cc?.id && cc.messages) add({ id: cc.id, config: cc, user_status: null });
          if (cc?.config) add({ id: cc.id || cc.config?.id, config: cc.config || cc, user_status: null });
        }
      } catch { /* placement unavailable */ }

      try {
        const d = await this.get(`/quests/decision?placement=${p}&${this.questQuery()}`);
        if (d.quest) add(d.quest);
      } catch { /* skip */ }
    }

    return [...map.values()];
  }

  async getQuests() {
    return this.fetchAllQuests();
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
    try {
      const channels = await this.get('/users/@me/channels');
      const dm = channels.find(c => c.type === 1);
      if (dm) return `call:${dm.id}:1`;
    } catch { /* skip */ }

    const me = await this.getCurrentUser();
    const guilds = await this.get('/users/@me/guilds');
    for (const guild of guilds.slice(0, 10)) {
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
    if (!app) return { application_id: String(appId), terminal: false };

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

function normalizeRawQuest(raw) {
  const config = raw.config || raw;
  const userStatus = raw.user_status || raw.userStatus || null;
  return {
    id: String(raw.id),
    config: config.config ? config.config : config,
    user_status: userStatus,
    userStatus,
    traffic_metadata_sealed: raw.traffic_metadata_sealed || raw.trafficMetadataSealed || null,
  };
}
