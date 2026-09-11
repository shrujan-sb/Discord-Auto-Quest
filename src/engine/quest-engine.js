import { DiscordUserAPI } from './discord-api.js';
import { parseQuest, sortQuests, filterActiveQuests } from './quest-parser.js';
import { config } from '../config.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const activeRuns = new Map();

export function getRunState(userId) {
  return activeRuns.get(userId) || null;
}

export function abortRun(userId) {
  const run = activeRuns.get(userId);
  if (run) {
    run.aborted = true;
    return true;
  }
  return false;
}

function buildStreamKey(guildId, channelId, userId) {
  return `call:${guildId}:${channelId}:${userId}`;
}

export class QuestEngine {
  constructor(token, options = {}) {
    this.api = new DiscordUserAPI(token);
    this.options = {
      turbo: false,
      autoEnroll: true,
      autoClaim: true,
      mode: 'parallel',
      sort: 'default',
      onProgress: null,
      ...options,
    };
    this.aborted = false;
    this.tasks = [];
    this.userId = null;
  }

  updateProgress(task) {
    const existing = this.tasks.find(t => t.id === task.id);
    if (existing) Object.assign(existing, task);
    else this.tasks.push(task);
    this.options.onProgress?.(this.tasks, this.message);
  }

  async fetchQuests() {
    const raw = await this.api.getQuests();
    return raw.map(parseQuest).filter(Boolean);
  }

  async run(quests, userId) {
    this.userId = userId;
    const run = { aborted: false, engine: this };
    activeRuns.set(userId, run);

    const active = filterActiveQuests(sortQuests(quests, this.options.sort));
    this.message = `Weaving ${active.length} quest${active.length === 1 ? '' : 's'}…`;

    if (!active.length) {
      activeRuns.delete(userId);
      return { completed: [], failed: [], skipped: [], message: 'Nothing to weave — all quests are done or unsupported.' };
    }

    const results = { completed: [], failed: [], skipped: [] };

    try {
      if (this.options.mode === 'sequential') {
        for (const quest of active) {
          if (run.aborted) break;
          await this.runQuest(quest, results);
        }
      } else {
        await Promise.allSettled(active.map(q => this.runQuest(q, results)));
      }
    } finally {
      activeRuns.delete(userId);
    }

    return {
      ...results,
      message: `Finished: ${results.completed.length} done, ${results.failed.length} failed, ${results.skipped.length} skipped.`,
      tasks: this.tasks,
    };
  }

  async runQuest(quest, results) {
    if (this.aborted || activeRuns.get(this.userId)?.aborted) return;

    this.updateProgress({
      id: quest.id,
      name: quest.name,
      cur: quest.progress,
      max: quest.taskInfo.target,
      status: 'RUNNING',
    });

    try {
      if (!quest.enrolled && this.options.autoEnroll) {
        await this.api.enrollQuest(quest.id, quest.trafficSealed);
        await sleep(rnd(500, 1200));
      }

      const type = quest.taskInfo.normalized;
      let ok = false;

      switch (type) {
        case 'VIDEO':
          ok = await this.completeVideo(quest);
          break;
        case 'ACTIVITY':
          ok = await this.completeActivity(quest);
          break;
        case 'ACHIEVEMENT':
          ok = await this.completeAchievement(quest);
          break;
        case 'GAME':
        case 'STREAM':
          ok = await this.completeHeartbeat(quest, type);
          break;
        default:
          results.skipped.push({ quest, reason: 'Unsupported quest type' });
          this.updateProgress({ id: quest.id, name: quest.name, status: 'SKIPPED' });
          return;
      }

      if (ok) {
        results.completed.push(quest);
        this.updateProgress({
          id: quest.id,
          name: quest.name,
          cur: quest.taskInfo.target,
          max: quest.taskInfo.target,
          status: 'COMPLETED',
        });

        if (this.options.autoClaim) {
          try {
            await sleep(rnd(1500, 3000));
            await this.api.claimReward(quest.id);
            this.updateProgress({ id: quest.id, name: quest.name, status: 'CLAIMED' });
          } catch { /* captcha or already claimed */ }
        }
      } else {
        results.failed.push({ quest, reason: 'Completion failed' });
        this.updateProgress({ id: quest.id, name: quest.name, status: 'FAILED' });
      }
    } catch (err) {
      results.failed.push({ quest, reason: err.message });
      this.updateProgress({ id: quest.id, name: quest.name, status: 'FAILED' });
    }
  }

  async completeVideo(quest) {
    const target = quest.taskInfo.target;
    const key = quest.taskKey;
    let cur = quest.progress;
    const enrolledAt = new Date(quest.raw.user_status?.enrolledAt || Date.now()).getTime();
    const turbo = this.options.turbo;
    const multiplier = turbo ? config.turboMultiplier : 1;
    const maxFuture = turbo ? 30 : 10;
    const speed = turbo ? Math.max(target / 60, 7) : 7;
    const interval = turbo ? 200 : 1000;
    let failCount = 0;

    while (cur < target && !this.aborted) {
      const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
      const diff = maxAllowed - cur;
      const timestamp = cur + speed * multiplier;

      if (diff >= speed || turbo) {
        try {
          const res = await this.api.sendVideoProgress(
            quest.id,
            Number(Math.min(target, timestamp + Math.random()).toFixed(6)),
          );
          cur = Math.min(target, timestamp);
          const serverVal = res?.progress?.[key]?.value ?? res?.progress?.WATCH_VIDEO?.value;
          if (serverVal > cur) cur = Math.min(target, serverVal);
          if (res?.completed_at) return true;
          failCount = 0;
        } catch (err) {
          failCount++;
          if (err.status === 400 || err.status === 403 || err.status === 404) return false;
          if (failCount >= 5) return false;
        }
      }

      this.updateProgress({ id: quest.id, name: quest.name, cur, max: target, status: 'RUNNING' });
      if (cur >= target) break;
      await sleep(turbo ? interval : rnd(7000, 9500));
    }

    if (cur < target) {
      try {
        await this.api.sendVideoProgress(quest.id, target);
      } catch { return false; }
    }
    return true;
  }

  async completeHeartbeat(quest, type) {
    const target = quest.taskInfo.target;
    const appId = quest.taskInfo.appId;
    let cur = quest.progress;
    const turbo = this.options.turbo;
    const beatInterval = turbo ? 2000 : rnd(28000, 32000);
    let failCount = 0;
    let stalled = 0;

    let streamKey = null;
    if (type === 'STREAM' || type === 'ACTIVITY') {
      const me = await this.api.getCurrentUser();
      const voice = await this.api.getVoiceChannels();
      if (voice) {
        streamKey = buildStreamKey(voice.guildId, voice.channelId, me.id);
      } else if (type === 'ACTIVITY') {
        return false;
      }
    }

    const beat = {
      application_id: String(appId || ''),
      terminal: false,
      ...(streamKey ? { stream_key: streamKey } : {}),
    };

    while (cur < target && !this.aborted) {
      try {
        const res = await this.api.sendHeartbeat(quest.id, beat);
        const reported = res?.progress?.[quest.taskKey]?.value
          ?? res?.progress?.[quest.taskInfo.type]?.value;
        if (typeof reported === 'number') {
          cur = reported;
          stalled = 0;
        } else {
          stalled++;
          if (turbo) cur += Math.min(120, target - cur);
          if (stalled >= 5 && !turbo) return false;
        }

        this.updateProgress({ id: quest.id, name: quest.name, cur, max: target, status: 'RUNNING' });
        failCount = 0;

        if (cur >= target) {
          try {
            await this.api.sendHeartbeat(quest.id, { ...beat, terminal: true });
          } catch { /* non-fatal */ }
          return true;
        }
      } catch (err) {
        failCount++;
        if (err.status === 401 || err.status === 403) return false;
        if (failCount >= 5) return false;
      }
      await sleep(beatInterval);
    }
    return cur >= target;
  }

  async completeActivity(quest) {
    return this.completeHeartbeat(quest, 'ACTIVITY');
  }

  async completeAchievement(quest) {
    const target = quest.taskInfo.target || 1;
    const appId = quest.taskInfo.appId;
    let cur = 0;
    let failCount = 0;

    const me = await this.api.getCurrentUser();
    const voice = await this.api.getVoiceChannels();
    const streamKey = voice
      ? buildStreamKey(voice.guildId, voice.channelId, me.id)
      : `activity:${appId}`;

    const beat = {
      stream_key: streamKey,
      application_id: String(appId || ''),
      terminal: false,
    };

    while (cur < target && !this.aborted) {
      try {
        const res = await this.api.sendHeartbeat(quest.id, beat);
        cur = res?.progress?.[quest.taskKey]?.value
          ?? res?.progress?.ACHIEVEMENT_IN_ACTIVITY?.value
          ?? cur + 1;
        failCount = 0;
        if (cur >= target) {
          try {
            await this.api.sendHeartbeat(quest.id, { ...beat, terminal: true });
          } catch { /* non-fatal */ }
          return true;
        }
      } catch {
        failCount++;
        if (failCount >= 3) return false;
      }
      await sleep(this.options.turbo ? 1000 : rnd(19000, 22000));
    }
    return false;
  }
}
