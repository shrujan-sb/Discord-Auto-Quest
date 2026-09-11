import { DiscordUserAPI } from './discord-api.js';
import { parseAllQuests, sortQuests, filterRunnableQuests } from './quest-parser.js';
import { config } from '../config.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const activeRuns = new Map();

export function getRunState(userId) { return activeRuns.get(userId) || null; }

export function abortRun(userId) {
  const run = activeRuns.get(userId);
  if (run) { run.aborted = true; return true; }
  return false;
}

export class QuestEngine {
  constructor(token, options = {}) {
    this.api = new DiscordUserAPI(token);
    this.options = {
      turbo: false, autoEnroll: true, autoClaim: true,
      mode: 'parallel', sort: 'default', onProgress: null,
      ...options,
    };
    this.aborted = false;
    this.tasks = [];
    this.userId = null;
  }

  updateProgress(task) {
    const t = this.tasks.find(x => x.id === task.id);
    if (t) Object.assign(t, task);
    else this.tasks.push(task);
    this.options.onProgress?.(this.tasks);
  }

  async fetchQuests() {
    const raw = await this.api.fetchAllQuests();
    return parseAllQuests(raw);
  }

  async run(quests, userId) {
    this.userId = userId;
    const run = { aborted: false };
    activeRuns.set(userId, run);

    const active = filterRunnableQuests(sortQuests(quests, this.options.sort));
    const results = { completed: [], failed: [], skipped: [] };

    if (!active.length) {
      activeRuns.delete(userId);
      return { ...results, message: 'No quests to run.', tasks: [] };
    }

    try {
      if (this.options.mode === 'sequential') {
        for (const q of active) {
          if (run.aborted) break;
          await this.runQuest(q, results);
        }
      } else {
        await Promise.allSettled(active.map(q => this.runQuest(q, results)));
      }
    } finally {
      activeRuns.delete(userId);
    }

    return {
      ...results,
      message: `${E_done(results)}`,
      tasks: this.tasks,
    };
  }

  async runQuest(quest, results) {
    if (this.aborted || activeRuns.get(this.userId)?.aborted) return;

    this.updateProgress({
      id: quest.id, name: quest.name,
      cur: quest.progress, max: quest.taskInfo.target, status: 'RUNNING',
    });

    try {
      if (!quest.enrolled && this.options.autoEnroll) {
        await this.api.enrollQuest(quest.id, quest.trafficSealed);
        await sleep(rnd(800, 1500));
        const fresh = parseAllQuests(await this.api.fetchAllQuests());
        const updated = fresh.find(q => q.id === quest.id);
        if (updated) Object.assign(quest, updated);
      }

      const type = quest.taskInfo.normalized;
      let ok = false;

      if (type === 'VIDEO') ok = await this.completeVideo(quest);
      else if (type === 'ACTIVITY') ok = await this.completeActivity(quest);
      else if (type === 'ACHIEVEMENT') ok = await this.completeAchievement(quest);
      else if (type === 'GAME' || type === 'STREAM') ok = await this.completeGameOrStream(quest, type);
      else {
        results.skipped.push({ quest, reason: 'unsupported' });
        return;
      }

      if (ok) {
        results.completed.push(quest);
        this.updateProgress({ id: quest.id, name: quest.name, cur: quest.taskInfo.target, max: quest.taskInfo.target, status: 'DONE' });
        if (this.options.autoClaim) {
          try { await sleep(2000); await this.api.claimReward(quest.id); } catch { /* captcha */ }
        }
      } else {
        results.failed.push({ quest, reason: 'failed' });
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
    let done = quest.progress;
    const enrolledAt = new Date(quest.enrolledAt || Date.now()).getTime();
    const speed = this.options.turbo ? Math.max(7, Math.ceil(target / 60)) : 7;

    while (done < target && !this.aborted) {
      const wait = this.options.turbo ? 200 : Math.min(speed, target - done) * 1000;
      await sleep(wait);

      const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + (this.options.turbo ? 30 : 10);
      const timestamp = Math.min(target, done + speed);

      if (maxAllowed >= done || this.options.turbo) {
        try {
          const res = await this.api.sendVideoProgress(quest.id, Number((timestamp + Math.random()).toFixed(6)));
          done = Math.min(target, timestamp);
          const sv = res?.progress?.[key]?.value ?? res?.progress?.WATCH_VIDEO?.value;
          if (sv > done) done = Math.min(target, sv);
          if (res?.completed_at || res?.completedAt) return true;
        } catch (e) {
          if (e.status >= 400 && e.status < 500) return false;
        }
      }

      this.updateProgress({ id: quest.id, name: quest.name, cur: done, max: target, status: 'RUNNING' });
    }

    try { await this.api.sendVideoProgress(quest.id, target); return true; }
    catch { return done >= target; }
  }

  async completeGameOrStream(quest, type) {
    const target = quest.taskInfo.target;
    let cur = quest.progress;
    const interval = this.options.turbo ? 3000 : rnd(28000, 32000);
    let beat = await this.api.getGameHeartbeatPayload(quest.taskInfo.appId);
    if (type === 'STREAM') beat = { ...beat, stream_key: await this.api.getActivityStreamKey() };

    let fails = 0;
    while (cur < target && !this.aborted) {
      try {
        const res = await this.api.sendHeartbeat(quest.id, { ...beat, terminal: false });
        const reported = res?.progress?.[quest.taskKey]?.value ?? res?.progress?.[quest.taskInfo.type]?.value;
        if (typeof reported === 'number') cur = reported;
        else if (this.options.turbo) cur = Math.min(target, cur + 30);
        this.updateProgress({ id: quest.id, name: quest.name, cur, max: target, status: 'RUNNING' });
        fails = 0;
        if (cur >= target) {
          await this.api.sendHeartbeat(quest.id, { ...beat, terminal: true }).catch(() => {});
          return true;
        }
      } catch (e) {
        fails++;
        if (e.status === 401 || fails >= 5) return false;
      }
      await sleep(interval);
    }
    return cur >= target;
  }

  async completeActivity(quest) {
    const target = quest.taskInfo.target;
    const streamKey = await this.api.getActivityStreamKey();
    let cur = quest.progress;
    const interval = this.options.turbo ? 2000 : 20000;

    while (cur < target && !this.aborted) {
      try {
        const res = await this.api.sendHeartbeat(quest.id, { stream_key: streamKey, terminal: false });
        cur = res?.progress?.PLAY_ACTIVITY?.value ?? res?.progress?.[quest.taskKey]?.value ?? cur;
        this.updateProgress({ id: quest.id, name: quest.name, cur, max: target, status: 'RUNNING' });
        if (cur >= target) {
          await this.api.sendHeartbeat(quest.id, { stream_key: streamKey, terminal: true }).catch(() => {});
          return true;
        }
      } catch { return false; }
      await sleep(interval);
    }
    return false;
  }

  async completeAchievement(quest) {
    const target = quest.taskInfo.target || 1;
    const streamKey = await this.api.getActivityStreamKey();
    const beat = { stream_key: streamKey, application_id: String(quest.taskInfo.appId || ''), terminal: false };
    let cur = 0;

    for (let i = 0; i < 10 && cur < target && !this.aborted; i++) {
      try {
        const res = await this.api.sendHeartbeat(quest.id, beat);
        cur = res?.progress?.ACHIEVEMENT_IN_ACTIVITY?.value ?? res?.progress?.[quest.taskKey]?.value ?? cur + 1;
        if (cur >= target) {
          await this.api.sendHeartbeat(quest.id, { ...beat, terminal: true }).catch(() => {});
          return true;
        }
      } catch { /* retry */ }
      await sleep(this.options.turbo ? 1000 : 20000);
    }
    return false;
  }
}

function E_done(r) {
  return `${r.completed.length} completed · ${r.failed.length} failed · ${r.skipped.length} skipped`;
}
