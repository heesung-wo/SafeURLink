// SafeURLink 자동 피드 확인: 매일 15:00 KST에 한 번 확인한다.
// 해당 시각에 브라우저가 꺼져 있었다면 다음 실행 때 누락된 확인을 수행한다.
// 예약 시간은 GitHub Actions의 피드 생성 시각(12:17 KST)보다 여유 있게 잡는다.
export const DAILY_SYNC_HOUR_KST = 15;
export const DAILY_SYNC_MINUTE_KST = 0;
const DAY_MS = 24 * 60 * 60_000;
const KST_MS = 9 * 60 * 60_000;

export function dailySlotAt(timeMs) {
  const date = new Date(timeMs + KST_MS);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    DAILY_SYNC_HOUR_KST - 9, DAILY_SYNC_MINUTE_KST);
}

/**
 * 다음 자동 확인 시각. 완료 기록은 성공적으로 검사한 '시작 시각'을 사용한다.
 * - 오늘의 예약 시각이 남아 있으면 대기
 * - 마지막으로 지나간 예약 시각 이후 확인한 적 없으면 즉시 보충 확인
 * - 오류 이후 재시도 시각이 남아 있으면 그 시각까지 대기
 * - 한 번 성공한 예약 주기는 중복 실행하지 않음
 *
 * @param {number} nowMs 현재 시각(밀리초)
 * @param {number} lastCheckedAt 최근 성공한 피드 확인 시작 시각
 * @param {number} retryAt 마지막 실패 후 다음 재시도 시각
 */
export function nextAutomaticCheckAt(nowMs, lastCheckedAt = 0, retryAt = 0) {
  const todaySlot = dailySlotAt(nowMs);
  const lastElapsedSlot = nowMs >= todaySlot ? todaySlot : todaySlot - DAY_MS;
  if (Number.isFinite(lastCheckedAt) && lastCheckedAt >= lastElapsedSlot) {
    return nowMs >= todaySlot ? todaySlot + DAY_MS : todaySlot;
  }
  if (Number.isFinite(retryAt) && retryAt > nowMs) return retryAt;
  return nowMs;
}

export function lastCheckedTime(feedMeta = {}) {
  // v0.6.7의 기존 피드 기록도 마이그레이션 없이 인식한다.
  return Number(feedMeta.lastCheckedAt || feedMeta.lastSuccess || 0);
}
