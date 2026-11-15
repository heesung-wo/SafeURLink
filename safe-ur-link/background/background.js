import { normalizeUrl, hostOf, heuristics, externalScore, verdictOf } from '../core/common.js';
import * as db from '../core/db.js';
import { SIGNATURE_FEED_URL } from '../core/config.js';
import { nextAutomaticCheckAt, lastCheckedTime } from '../core/daily-sync.js';
import { downloadFeed } from '../core/remote-feed.js';
import { buildProtectionRules, hostMatches, sessionAllowCondition, REALTIME_FRESH_MS } from '../core/dnr.js';
import { registerContextMenu, targetFromContext, resultPageUrl } from '../core/context-menu.js';

const DEFAULTS = { realtime: true, allow: [], block: [] };
const RETRY_MS = 60 * 60_000, MANUAL_COOLDOWN_MS = 60_000;
const SYNC_ALARM_NAME = 'sync';
// 다운로드된 악성 시그니처는 block, 사용자 차단 도메인만 redirect (Chrome 121+ 총 30,000개 한도).
const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) });
const WARNING_PAGE = 'pages/warning/warning.html';
let registeringMenu;
function ensureContextMenu() {
  if (!registeringMenu) {
    registeringMenu = registerContextMenu(chrome).finally(() => { registeringMenu = undefined; });
  }
  return registeringMenu;
}

// ── URL 검사: 정규화 → 사용자 목록 → 로컬 DB → 외부 평가 → 휴리스틱 → 판정
export async function check(raw) {
  const url = normalizeUrl(raw);
  if (!url) return { error: 'http/https URL만 검사할 수 있습니다.' };
  const host = hostOf(url), s = await getSettings();
  const base = { url, host };
  if (s.allow.some(entry => hostMatches(host, entry))) return { ...base, verdict: 'No Threat Detected', score: 0, userList: 'allow', sources: [], reasons: [{ points: 0, text: '사용자 허용 목록에 등록된 도메인입니다' }] };
  if (s.block.some(entry => hostMatches(host, entry))) return { ...base, verdict: 'Malicious', score: 100, userList: 'block', sources: [], reasons: [{ points: 0, text: '사용자 차단 목록에 등록된 도메인입니다' }] };

  // DB에 없는 시연용 URL을 임의로 악성 판정하지 않는다.
  const records = await db.lookup(url);
  const historyOnly = records.length > 0 && records.every(r => {
    if (r.meta?.active === false) return true;
    const seen = Date.parse(r.meta?.lastObservedAt);
    return Number.isFinite(seen) && Date.now() - seen > REALTIME_FRESH_MS;
  });
  const ext = externalScore(records), heur = heuristics(raw);
  const score = Math.min(ext.score + heur.score, 100);
  return {
    ...base, verdict: historyOnly ? 'Suspicious' : verdictOf(records.length > 0, score), score, historyOnly,
    externalScore: ext.score, heuristicScore: heur.score,
    lastObservedAt: records.map(r => Date.parse(r.meta?.lastObservedAt) || 0).reduce((a,b) => Math.max(a,b), 0) || null,
    sources: [...new Set(records.map(r => r.source))],
    reasons: [...(historyOnly ? [{ points: 0, text: '과거 악성 등록 이력이 있지만 최신 피드에 없거나 7일 이상 재확인되지 않았습니다. 현재 악성 여부는 미확정입니다.', kind: 'history' }] : []),
      ...ext.reasons.map(r => ({ ...r, kind: 'external' })), ...heur.reasons.map(r => ({ ...r, kind: 'heuristic' }))]
  };
}

// ── 시그니처 동기화: 개발자가 GitHub Pages에 공개한 signatures.json 하나만 내려받는다.
// 외부 위협 정보 API와 비밀 키는 GitHub Actions에서만 사용되며, 확장 프로그램에는 키가 없다.
// 실패하거나 형식이 잘못되면 기존 IndexedDB 데이터는 그대로 유지한다.
// chrome.storage.local에는 작은 갱신 상태(feedMeta)만 기록한다.
let runningSync;
async function performSync(force) {
  const { feedMeta = {} } = await chrome.storage.local.get('feedMeta');
  const now = Date.now();
  // 기존 6시간 간격 nextAt 값이 남아 있어도 새 일일 일정으로 판단한다.
  const dueAt = nextAutomaticCheckAt(now, lastCheckedTime(feedMeta), feedMeta.nextRetryAt);
  if (!force && now < dueAt) return { ok: !feedMeta.lastError, skipped: true, nextAt: dueAt };
  if (force && feedMeta.lastAttempt && now - feedMeta.lastAttempt < MANUAL_COOLDOWN_MS) return { ok: !feedMeta.lastError, skipped: true, cooldown: true };
  try {
    const feed = await downloadFeed(SIGNATURE_FEED_URL);
    const sourceCounts = await db.countBySource();
    const hasData = Object.values(sourceCounts).some(n => n > 0);
    let changed = false;
    if (feed.generatedAt !== feedMeta.generatedAt || !hasData) {
      // 기존 DB 레코드를 삭제하지 않고 변경된 시그니처를 추가/갱신한다.
      // 서버의 소스별 실패 시 해당 소스의 마지막 데이터는 그대로 남는다.
      const realCount = Object.entries(sourceCounts).filter(([key]) => key !== 'Demo')
        .reduce((sum, [, count]) => sum + count, 0);
      if (!(feed.demoOnly && realCount)) {
        await db.mergeRecords(feed.records);
        await db.deactivateMissing(feed.records, feed.sourceStatus, feedMeta.generatedAt);
      }
      if (!feed.demoOnly && feed.records.length) await db.clearDemo();
      changed = true;
    }
    const completedAt = Date.now();
    await chrome.storage.local.set({ feedMeta: {
      generatedAt: feed.generatedAt, lastAttempt: now, lastSuccess: completedAt,
      lastCheckedAt: now, lastAppliedAt: changed ? completedAt : feedMeta.lastAppliedAt,
      nextAt: nextAutomaticCheckAt(completedAt, now),
      count: feed.records.length, demoOnly: feed.demoOnly, sourceStatus: feed.sourceStatus
    } });
    let ruleError;
    if (changed || feedMeta.ruleError) {
      try { await rebuildRules(); } catch (e) { ruleError = String(e.message || e); }
    }
    await chrome.storage.local.set({ feedMeta: { ...(await chrome.storage.local.get('feedMeta')).feedMeta, ruleError } });
    return { ok: !ruleError, changed, count: feed.records.length, error: ruleError };
  } catch (e) {
    const error = String(e.message || e);
    const nextRetryAt = Date.now() + RETRY_MS;
    await chrome.storage.local.set({ feedMeta: { ...feedMeta, lastAttempt: now, nextRetryAt,
      nextAt: nextAutomaticCheckAt(Date.now(), lastCheckedTime(feedMeta), nextRetryAt), lastError: error } });
    return { ok: false, error };
  }
}
export function sync(force = false) {
  if (!runningSync) runningSync = performSync(force).finally(() => {
    runningSync = undefined;
    // 수동 갱신 또는 오류 재시도 이후에도 일일 예약을 다시 계산한다.
    ensureDailyAlarm().catch(console.error);
  });
  return runningSync;
}

// ── DNR 규칙 생성 및 적용. 업데이트가 겹치면 직렬화하여 오래된 데이터가 덮어쓰지 않게 한다.
let rulesQueue = Promise.resolve();
export function rebuildRules() {
  const task = rulesQueue.then(async () => {
    const s = await getSettings();
    // 보호 기능이 꺼져 있으면 DB 수십만 건을 읽을 필요가 없다.
    const records = s.realtime === false ? [] : await db.all();
    const { rules, stats } = buildProtectionRules(
      s, records, chrome.runtime.getURL(WARNING_PAGE)
    );
    const old = (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id);
    // DNR 변경은 원자적으로 적용된다. 실패하면 기존 정상 규칙이 그대로 남는다.
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old, addRules: rules });
    await chrome.storage.local.set({ ruleCount: rules.length, ruleStats: stats, appliedSettings: s });
    return stats;
  });
  rulesQueue = task.catch(() => {});
  return task;
}

// 브라우저 시작 시 DNR 규칙이 유지되어 있다면 불필요한 전체 DB 재조회/정렬을 피한다.
// 동적 규칙은 MV3에서 세션 간 지속된다. 카운트 또는 적용 설정이 달라졌을 때만 복구한다.
export async function ensureRulesInstalled() {
  const s = await getSettings();
  const { ruleCount, appliedSettings } = await chrome.storage.local.get(['ruleCount', 'appliedSettings']);
  if (!Number.isInteger(ruleCount) || JSON.stringify(appliedSettings) !== JSON.stringify(s)) {
    return rebuildRules();
  }
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    if (existing.length === ruleCount) return { reused: true, count: ruleCount };
  } catch (error) {
    console.warn('DNR 규칙 상태 점검 실패, 재구성합니다:', error);
  }
  return rebuildRules();
}

// 이번 브라우저 세션에서 '해당 탭 + 정확한 URL'만 예외 허용.
// 사용자 차단 도메인의 모든 경로를 풀어주는 방식이 아니다.
async function allowOnce(raw, tabId) {
  const condition = sessionAllowCondition(raw, tabId);
  const dnr = chrome.declarativeNetRequest;
  const existing = await dnr.getSessionRules();
  const same = existing.find(rule => rule.action.type === 'allow' &&
    JSON.stringify(rule.condition) === JSON.stringify(condition));
  if (same) return { ok: true, reused: true };
  if (existing.length >= (dnr.MAX_NUMBER_OF_SESSION_RULES || 5000)) {
    throw new Error('세션 허용 규칙 한도를 초과했습니다. 브라우저를 다시 시작해 주세요.');
  }
  const id = Math.max(0, ...existing.map(r => r.id)) + 1;
  await dnr.updateSessionRules({
    addRules: [{ id, priority: 100, action: { type: 'allow' }, condition }]
  });
  return { ok: true, reused: false };
}

// ── 자동 동기화 일정
// 반복 알람 대신 한국 시간 매일 15:00의 단발성 알람을 사용한다.
// 브라우저 종료·절전으로 예약 시각을 놓쳤다면 다음 시작 시 즉시 보충 확인한다.
let schedulingAlarm;
export function ensureDailyAlarm() {
  if (typeof chrome.alarms?.get !== 'function' || typeof chrome.alarms?.create !== 'function') {
    return Promise.resolve();
  }
  if (!schedulingAlarm) {
    schedulingAlarm = (async () => {
      const { feedMeta = {} } = await chrome.storage.local.get('feedMeta');
      const now = Date.now();
      const desired = nextAutomaticCheckAt(now, lastCheckedTime(feedMeta), feedMeta.nextRetryAt);
      // 이미 기한이 지났으면 시작 루틴이 즉시 확인한다. 알람도 백업으로 예약한다.
      const when = Math.max(desired, now + 60_000);
      const current = await chrome.alarms.get(SYNC_ALARM_NAME);
      if (!current || current.periodInMinutes != null ||
          !Number.isFinite(current.scheduledTime) || Math.abs(current.scheduledTime - when) > 60_000) {
        await chrome.alarms.create(SYNC_ALARM_NAME, { when });
      }
      return when;
    })().finally(() => { schedulingAlarm = undefined; });
  }
  return schedulingAlarm;
}

let startingAutoSync;
export function runAutomaticSync() {
  if (!startingAutoSync) {
    startingAutoSync = (async () => {
      const { feedMeta = {} } = await chrome.storage.local.get('feedMeta');
      const now = Date.now();
      if (nextAutomaticCheckAt(now, lastCheckedTime(feedMeta), feedMeta.nextRetryAt) <= now) {
        return sync(); // 진행 중인 갱신 작업이 있으면 중복 실행하지 않는다.
      }
      await ensureDailyAlarm();
      return { ok: true, skipped: true };
    })().finally(() => { startingAutoSync = undefined; });
  }
  return startingAutoSync;
}

// ── 이벤트
chrome.runtime.onInstalled.addListener(() => {
  // 외부 API 키를 브라우저에 저장하지 않도록 남아 있는 키 및 상태를 정리한다.
  chrome.storage.local.remove(['authKey', 'phishKey', 'feedState', 'syncStatus']);
  ensureContextMenu().catch(console.error);
  rebuildRules().catch(console.error);
  runAutomaticSync().catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu().catch(console.error);
  ensureRulesInstalled().catch(console.error);
  runAutomaticSync().catch(console.error);
});
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === SYNC_ALARM_NAME) runAutomaticSync().catch(console.error);
});

// 서비스 워커가 알람이나 사용자 요청으로 깨어날 때도 예약 누락을 복구한다.
// 일부 Chromium 환경에서는 브라우저 재시작 시 알람이 사라질 수 있다.
if (typeof chrome.alarms?.get === 'function' && typeof chrome.alarms?.create === 'function') {
  runAutomaticSync().catch(console.error);
}

chrome.contextMenus.onClicked.addListener((info) => {
  const target = targetFromContext(info);
  if (!target) return;
  // 사용자가 드래그한 선택 텍스트만 사용하며 링크 목적지로 대체하지 않는다.
  // 결과 페이지만 열고 위험 URL로 직접 이동하지 않는다.
  chrome.tabs.create({ url: resultPageUrl(chrome.runtime, target) })
    .catch(e => console.error('SafeURLink 우클릭 검사 결과 탭 열기 실패:', e));
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const run = {
    check: () => check(msg.url),
    sync: () => sync(msg.force === true),
    rebuild: () => rebuildRules(),
    allowOnce: () => allowOnce(msg.url, sender.tab?.id),
    goSafe: () => chrome.tabs.update(sender.tab.id, { url: 'chrome://newtab/' }),
    status: async () => {
      const data = await chrome.storage.local.get(['feedMeta', 'ruleCount', 'ruleStats']);
      const meta = data.feedMeta || {};
      return { ...data, feedMeta: { ...meta, nextAt: nextAutomaticCheckAt(
        Date.now(), lastCheckedTime(meta), meta.nextRetryAt) }, counts: await db.countBySource() };
    }
  }[msg.type];
  if (!run) return false;
  run().then(reply, e => reply({ error: String(e.message || e) }));
  return true;
});
