const VIDEO_TYPES = new Set(['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE']);
const GAME_TYPES = new Set(['PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2']);
const STREAM_TYPES = new Set(['STREAM_ON_DESKTOP']);
const ACTIVITY_TYPES = new Set(['PLAY_ACTIVITY']);
const ACHIEVEMENT_TYPES = new Set(['ACHIEVEMENT_IN_ACTIVITY', 'ACHIEVEMENT_IN_GAME']);
const CONSOLE_TYPES = new Set(['PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION']);

const TASK_PRIORITY = {
  WATCH_VIDEO: 1,
  WATCH_VIDEO_ON_MOBILE: 1,
  PLAY_ACTIVITY: 2,
  ACHIEVEMENT_IN_ACTIVITY: 3,
  PLAY_ON_DESKTOP: 4,
  PLAY_ON_DESKTOP_V2: 4,
  STREAM_ON_DESKTOP: 5,
  ACHIEVEMENT_IN_GAME: 99,
};

function selectTaskConfig(config) {
  const v2 = config?.task_config_v2;
  const legacy = config?.task_config;
  const v2Tasks = v2?.tasks ? Object.keys(v2.tasks) : [];
  const legacyTasks = legacy?.tasks ? Object.keys(legacy.tasks) : [];
  if (v2Tasks.length) return v2;
  if (legacyTasks.length) return legacy;
  return v2 || legacy;
}

function normalizeType(type) {
  if (VIDEO_TYPES.has(type)) return 'VIDEO';
  if (GAME_TYPES.has(type)) return 'GAME';
  if (STREAM_TYPES.has(type)) return 'STREAM';
  if (ACTIVITY_TYPES.has(type)) return 'ACTIVITY';
  if (ACHIEVEMENT_TYPES.has(type)) return 'ACHIEVEMENT';
  return 'UNKNOWN';
}

export function parseQuest(raw) {
  const config = raw.config || {};
  const taskConfig = selectTaskConfig(config);
  const tasks = taskConfig?.tasks || {};
  const keys = Object.keys(tasks);

  let bestKey = null;
  let bestTask = null;
  let bestPriority = 999;

  for (const key of keys) {
    if (CONSOLE_TYPES.has(key)) continue;
    const task = tasks[key];
    const prio = TASK_PRIORITY[key] ?? 50;
    if (prio < bestPriority) {
      bestPriority = prio;
      bestKey = key;
      bestTask = task;
    }
  }

  if (!bestTask) return null;

  const appId = bestTask.applications?.[0]?.id || config.application?.id;
  const progress = raw.user_status?.progress?.[bestKey]?.value ?? 0;
  const completed = !!raw.user_status?.completed_at;
  const enrolled = !!raw.user_status?.enrolled_at;
  const claimed = !!raw.user_status?.claimed_at;

  const rewards = config.rewards_config?.rewards || [];
  const orbReward = rewards.find(r => r.type === 4)?.orb_quantity
    || rewards.find(r => r.orb_quantity)?.orb_quantity
    || 0;

  const expiresAt = config.expires_at;
  const isExpired = expiresAt && new Date(expiresAt) < new Date();

  return {
    id: raw.id,
    name: config.messages?.quest_name || config.application?.name || 'Unknown Quest',
    gameTitle: config.messages?.game_title || config.application?.name,
    taskKey: bestKey,
    taskInfo: {
      type: bestKey,
      normalized: normalizeType(bestKey),
      target: bestTask.target || 0,
      appId,
    },
    progress,
    completed,
    enrolled,
    claimed,
    orbReward,
    isExpired,
    automatable: !CONSOLE_TYPES.has(bestKey) && bestKey !== 'ACHIEVEMENT_IN_GAME',
    trafficSealed: raw.traffic_metadata_sealed || null,
    colors: config.colors,
    raw,
  };
}

export function sortQuests(quests, mode = 'default') {
  const copy = [...quests];
  switch (mode) {
    case 'orbs':
      return copy.sort((a, b) => (b.orbReward || 0) - (a.orbReward || 0));
    case 'heavy':
      return copy.sort((a, b) => (b.taskInfo?.target || 0) - (a.taskInfo?.target || 0));
    case 'light':
      return copy.sort((a, b) => (a.taskInfo?.target || 0) - (b.taskInfo?.target || 0));
    case 'video-first':
      return copy.sort((a, b) => {
        const aV = a.taskInfo?.normalized === 'VIDEO' ? 0 : 1;
        const bV = b.taskInfo?.normalized === 'VIDEO' ? 0 : 1;
        return aV - bV;
      });
    default:
      return copy;
  }
}

export function filterActiveQuests(quests) {
  return quests.filter(q =>
    q && !q.isExpired && !q.completed && q.automatable && q.taskInfo?.target > 0,
  );
}
