export const SUPPORTED_TASKS = [
  'WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE',
  'PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2',
  'STREAM_ON_DESKTOP', 'PLAY_ACTIVITY',
  'ACHIEVEMENT_IN_ACTIVITY',
];

const CONSOLE = new Set(['PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION']);

function pick(obj, ...keys) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return null;
}

function taskKeys(tasks) {
  if (!tasks) return [];
  if (tasks instanceof Map) return [...tasks.keys()];
  return Object.keys(tasks);
}

function selectTaskConfig(config) {
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
  if (type?.includes('VIDEO')) return 'VIDEO';
  if (type?.includes('PLAY_ON_DESKTOP')) return 'GAME';
  if (type === 'STREAM_ON_DESKTOP') return 'STREAM';
  if (type === 'PLAY_ACTIVITY') return 'ACTIVITY';
  if (type?.includes('ACHIEVEMENT')) return 'ACHIEVEMENT';
  return 'UNKNOWN';
}

export function parseQuest(raw) {
  if (!raw?.config) return null;

  const config = raw.config;
  const taskConfig = selectTaskConfig(config);
  const tasks = taskConfig?.tasks;
  if (!tasks) return null;

  const keys = taskKeys(tasks);
  const taskName = SUPPORTED_TASKS.find(t => keys.includes(t) && !CONSOLE.has(t));
  if (!taskName) return null;

  const taskData = tasks instanceof Map ? tasks.get(taskName) : tasks[taskName];
  if (!taskData?.target) return null;

  const userStatus = getUserStatus(raw);
  const progress = userStatus.progress?.[taskName]?.value ?? 0;
  const enrolledAt = pick(userStatus, 'enrolled_at', 'enrolledAt');
  const completedAt = pick(userStatus, 'completed_at', 'completedAt');
  const claimedAt = pick(userStatus, 'claimed_at', 'claimedAt');

  const appId = config.application?.id ?? taskData.applications?.[0]?.id;
  const rewards = config.rewards_config?.rewards || config.rewardsConfig?.rewards || [];
  const orbReward = rewards.find(r => r.type === 4)?.orb_quantity
    || rewards.find(r => r.orb_quantity)?.orb_quantity || 0;

  const expiresAt = config.expires_at || config.expiresAt;
  const isExpired = expiresAt && new Date(expiresAt) < Date.now();

  return {
    id: raw.id,
    name: config.messages?.quest_name || config.messages?.questName || config.application?.name || 'Quest',
    gameTitle: config.messages?.game_title || config.messages?.gameTitle || config.application?.name,
    taskKey: taskName,
    taskInfo: {
      type: taskName,
      normalized: normalizeType(taskName),
      target: taskData.target,
      appId,
    },
    progress,
    completed: !!completedAt,
    enrolled: !!enrolledAt,
    claimed: !!claimedAt,
    enrolledAt,
    orbReward,
    isExpired,
    configVersion: config.config_version || config.configVersion || 2,
    trafficSealed: raw.traffic_metadata_sealed || raw.trafficMetadataSealed || null,
    raw: { ...raw, user_status: userStatus, config },
  };
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
