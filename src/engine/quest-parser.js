export const SUPPORTED_TASKS = [
  'WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE',
  'PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2',
  'STREAM_ON_DESKTOP', 'PLAY_ACTIVITY',
  'ACHIEVEMENT_IN_ACTIVITY', 'ACHIEVEMENT_IN_GAME',
];

const CONSOLE = new Set(['PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION']);

// Achievement tasks are only credited by an event from the activity's own
// backend, which the quest API rejects with a 403, so they need a real play.
const MANUAL = new Set(['ACHIEVEMENT_IN_ACTIVITY', 'ACHIEVEMENT_IN_GAME']);

function pick(obj, ...keys) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return null;
}

function taskKeys(tasks) {
  if (!tasks) return [];
  if (tasks instanceof Map) return [...tasks.keys()];
  if (Array.isArray(tasks)) return tasks.map(t => t.type || t.event_name).filter(Boolean);
  return Object.keys(tasks);
}

function getTaskData(tasks, key) {
  if (!tasks) return null;
  if (tasks instanceof Map) return tasks.get(key);
  if (Array.isArray(tasks)) return tasks.find(t => (t.type || t.event_name) === key);
  return tasks[key];
}

function selectTaskConfig(config) {
  if (!config) return null;
  const v2 = pick(config, 'task_config_v2', 'taskConfigV2');
  const legacy = pick(config, 'task_config', 'taskConfig');
  if (taskKeys(v2?.tasks).length) return v2;
  if (taskKeys(legacy?.tasks).length) return legacy;
  return v2 || legacy;
}

function getUserStatus(raw) {
  return raw.user_status || raw.userStatus || {};
}

function normalizeType(type) {
  if (!type) return 'UNKNOWN';
  if (type.includes('VIDEO')) return 'VIDEO';
  if (type.includes('PLAY_ON_DESKTOP')) return 'GAME';
  if (type === 'STREAM_ON_DESKTOP') return 'STREAM';
  if (type === 'PLAY_ACTIVITY') return 'ACTIVITY';
  if (type.includes('ACHIEVEMENT')) return 'ACHIEVEMENT';
  return 'UNKNOWN';
}

function findTask(tasks) {
  const keys = taskKeys(tasks);
  for (const name of SUPPORTED_TASKS) {
    if (keys.includes(name) && !CONSOLE.has(name)) {
      const data = getTaskData(tasks, name);
      if (data) return { name, data };
    }
  }
  for (const key of keys) {
    if (CONSOLE.has(key)) continue;
    const data = getTaskData(tasks, key);
    if (data && normalizeType(key) !== 'UNKNOWN') return { name: key, data };
  }
  return null;
}

export function parseQuest(raw) {
  if (!raw?.id) return null;

  const config = raw.config || raw;
  if (!config?.messages && !config?.application && !config?.task_config_v2 && !config?.taskConfigV2) return null;

  const taskConfig = selectTaskConfig(config);
  const tasks = taskConfig?.tasks;
  if (!tasks) return null;

  const found = findTask(tasks);
  if (!found) return null;

  const { name: taskName, data: taskData } = found;
  const target = taskData.target ?? taskData.duration ?? 1;
  if (target <= 0 && taskName !== 'ACHIEVEMENT_IN_ACTIVITY') return null;

  const userStatus = getUserStatus(raw);
  const progress = userStatus.progress?.[taskName]?.value ?? 0;
  const enrolledAt = pick(userStatus, 'enrolled_at', 'enrolledAt');
  const completedAt = pick(userStatus, 'completed_at', 'completedAt');
  const claimedAt = pick(userStatus, 'claimed_at', 'claimedAt');

  const appId = config.application?.id ?? taskData.applications?.[0]?.id;
  const rewards = config.rewards_config?.rewards || config.rewardsConfig?.rewards || [];
  let orbReward = 0;
  for (const r of rewards) {
    if (r.orb_quantity) orbReward = Math.max(orbReward, r.orb_quantity);
    if (r.type === 4 && r.orb_quantity) orbReward = r.orb_quantity;
  }

  const expiresAt = config.expires_at || config.expiresAt;
  const isExpired = expiresAt ? new Date(expiresAt) < Date.now() : false;

  return {
    id: String(raw.id),
    name: config.messages?.quest_name || config.messages?.questName
      || config.application?.name || `Quest ${raw.id}`,
    gameTitle: config.messages?.game_title || config.messages?.gameTitle || config.application?.name,
    taskKey: taskName,
    taskInfo: {
      type: taskName,
      normalized: normalizeType(taskName),
      target,
      appId,
    },
    progress,
    completed: !!completedAt,
    enrolled: !!enrolledAt,
    claimed: !!claimedAt,
    enrolledAt,
    orbReward,
    isExpired,
    automatable: !CONSOLE.has(taskName) && !MANUAL.has(taskName),
    manualReason: CONSOLE.has(taskName) ? 'console only'
      : MANUAL.has(taskName) ? 'needs an in-game achievement' : null,
    configVersion: config.config_version || config.configVersion || 2,
    trafficSealed: raw.traffic_metadata_sealed || raw.trafficMetadataSealed || null,
    raw,
  };
}

export function parseAllQuests(rawList) {
  const out = [];
  const seen = new Set();
  for (const raw of rawList) {
    const q = parseQuest(raw);
    if (q && !seen.has(q.id)) { seen.add(q.id); out.push(q); }
  }
  return out;
}

export function sortQuests(quests, mode = 'default') {
  const copy = [...quests];
  if (mode === 'orbs') return copy.sort((a, b) => (b.orbReward || 0) - (a.orbReward || 0));
  if (mode === 'heavy') return copy.sort((a, b) => (b.taskInfo?.target || 0) - (a.taskInfo?.target || 0));
  return copy;
}

export function filterRunnableQuests(quests) {
  return quests.filter(q => q && !q.isExpired && !q.completed);
}

export function filterEnrolledQuests(quests) {
  return filterRunnableQuests(quests).filter(q => q.enrolled);
}
