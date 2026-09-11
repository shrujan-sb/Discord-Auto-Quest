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

  /**
   * Accept every quest the account has been offered but not yet joined.
   * Enrollments fire together, then a single refetch picks up enrolled_at.
   */
  async enrollAll(quests) {
    const pending = filterRunnableQuests(quests).filter(q => !q.enrolled);
    if (!pending.length) return { accepted: [], failed: [], quests };

    const settled = await Promise.allSettled(
      pending.map(q => this.api.enrollQuest(q.id, q.trafficSealed)),
    );

    const accepted = [];
    const failed = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') accepted.push(pending[i]);
      else failed.push({ quest: pending[i], reason: r.reason?.message || 'enroll failed' });
    });

    let refreshed = quests;
    if (accepted.length) {
      await sleep(1200);
      const fresh = await this.fetchQuests();
      refreshed = quests.map(q => fresh.find(f => f.id === q.id) || q);
    }

    return { accepted, failed, quests: refreshed };
  }

  async run(quests, userId) {
    this.userId = userId;
    const run = { aborted: false };
    activeRuns.set(userId, run);

    const results = { completed: [], failed: [], skipped: [], accepted: [], needsClaim: [] };

    try {
      let pool = filterRunnableQuests(quests);

      if (this.options.autoEnroll && pool.some(q => !q.enrolled)) {
        const enrollment = await this.enrollAll(pool);
        results.accepted = enrollment.accepted;
        results.failed.push(...enrollment.failed);
        pool = filterRunnableQuests(enrollment.quests);
      }

      const active = sortQuests(pool, this.options.sort);

      if (!active.length) {
        return { ...results, message: 'No quests to run.', tasks: [] };
      }

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

    if (!quest.automatable) {
      results.skipped.push({ quest, reason: quest.manualReason || 'not automatable' });
      this.updateProgress({ id: quest.id, name: quest.name, status: 'SKIPPED' });
      return;
    }

    this.updateProgress({
      id: quest.id, name: quest.name,
      cur: quest.progress, max: quest.taskInfo.target, status: 'RUNNING',
    });

    try {
      if (!quest.enrolled && this.options.autoEnroll) {
        // run() accepts quests in bulk first; this is the single-quest path.
        try { await this.api.enrollQuest(quest.id, quest.trafficSealed); } catch { /* may already be enrolled */ }
        await sleep(rnd(800, 1500));
        const updated = (await this.fetchQuests()).find(q => q.id === quest.id);
        if (updated) Object.assign(quest, updated);
      }

      const type = quest.taskInfo.normalized;
      let ok = false;

      if (type === 'VIDEO') ok = await this.completeVideo(quest);
      else if (type === 'ACTIVITY') ok = await this.completeActivity(quest);
      else if (type === 'GAME' || type === 'STREAM') ok = await this.completeGameOrStream(quest, type);
      else {
        results.skipped.push({ quest, reason: 'unsupported' });
        return;
      }

      if (ok) {
        results.completed.push(quest);
        this.updateProgress({ id: quest.id, name: quest.name, cur: quest.taskInfo.target, max: quest.taskInfo.target, status: 'DONE' });
        if (this.options.autoClaim && !quest.claimed) {
          try {
            await sleep(1500);
            await this.api.claimReward(quest.id);
            quest.claimed = true;
          } catch (e) {
            // Discord puts claim-reward behind hCaptcha, which cannot be
            // solved from the API. The quest still counts as completed.
            quest.claimError = e.body?.captcha_service ? 'captcha' : (e.message || 'failed');
            results.needsClaim.push(quest);
          }
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

  /**
   * Discord accepts a video timestamp up to roughly 25s beyond the real time
   * elapsed since enrollment, and rejects anything further with a 400. Turbo
   * rides just under that ceiling so a clip finishes ~25s before its runtime;
   * normal mode keeps a wider margin. The window cannot be opened further, so
   * the remainder of the target is always real waiting time.
   */
  async completeVideo(quest) {
    const target = quest.taskInfo.target;
    const key = quest.taskKey;
    let done = quest.progress;
    const enrolledAt = new Date(quest.enrolledAt || Date.now()).getTime();

    let lookahead = this.options.turbo ? 20 : 8;
    const step = this.options.turbo ? 10 : 7;

    while (done < target && !this.aborted && !activeRuns.get(this.userId)?.aborted) {
      const elapsed = (Date.now() - enrolledAt) / 1000;
      const allowed = Math.floor(elapsed) + lookahead;
      const next = Math.min(target, done + step);

      if (next > allowed) {
        await sleep(Math.min(5000, Math.max(500, (next - allowed) * 1000)));
        continue;
      }

      try {
        // Discord floors the timestamp, and only credits completion when the
        // final value lands exactly on the target — never target + jitter.
        const payload = next >= target ? target : Number((next + Math.random()).toFixed(2));
        const res = await this.api.sendVideoProgress(quest.id, payload);
        const sv = res?.progress?.[key]?.value ?? res?.progress?.WATCH_VIDEO?.value;
        // Trust the server's number so a rejected jump can't look like success.
        done = typeof sv === 'number'
          ? Math.min(target, sv)
          : Math.max(done, Math.min(target, Math.floor(payload)));
        if (res?.completed_at || res?.completedAt) return true;
      } catch (e) {
        if (e.status === 400) {
          // Overshot the window: tighten it and let real time catch up.
          lookahead = Math.max(0, lookahead - 5);
          await sleep(2000);
          continue;
        }
        if (e.status === 401 || e.status === 403 || e.status === 404) return false;
        await sleep(2000);
      }

      this.updateProgress({ id: quest.id, name: quest.name, cur: done, max: target, status: 'RUNNING' });
    }

    if (done < target) return false;

    try {
      const res = await this.api.sendVideoProgress(quest.id, target);
      if (res?.completed_at || res?.completedAt) return true;
      const sv = res?.progress?.[key]?.value ?? res?.progress?.WATCH_VIDEO?.value;
      return typeof sv === 'number' ? sv >= target : true;
    } catch {
      return false;
    }
  }

  async completeGameOrStream(quest, type) {
    const target = quest.taskInfo.target;
    let cur = quest.progress;
    // Heartbeats credit real elapsed time (capped at 2 minutes per beat), so a
    // shorter interval buys nothing beyond keeping the progress bar fresh.
    const interval = this.options.turbo ? 20000 : rnd(28000, 32000);
    let beat = await this.api.getGameHeartbeatPayload(quest.taskInfo.appId);
    if (type === 'STREAM') beat = { ...beat, stream_key: await this.api.getActivityStreamKey() };

    let fails = 0;
    while (cur < target && !this.aborted) {
      try {
        const res = await this.api.sendHeartbeat(quest.id, { ...beat, terminal: false });
        const reported = res?.progress?.[quest.taskKey]?.value ?? res?.progress?.[quest.taskInfo.type]?.value;
        if (typeof reported === 'number') cur = reported;
        else cur = Math.min(target, cur + interval / 1000);
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
    const interval = this.options.turbo ? 15000 : 20000;

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

}

function E_done(r) {
  const parts = [`${r.completed.length} completed`, `${r.failed.length} failed`];
  if (r.skipped.length) parts.push(`${r.skipped.length} skipped`);
  if (r.needsClaim.length) parts.push(`${r.needsClaim.length} awaiting claim`);
  return parts.join(' · ');
}
