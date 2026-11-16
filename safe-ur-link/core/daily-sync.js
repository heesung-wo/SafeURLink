// SafeURLink 자동 피드 확인: 매일 15:00 KST에 한 번 확인
// 해당 시각에 브라우저가 꺼져 있었다면 다음 실행 때 누락된 확인을 수행
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
 * 다음 자동 확인 시각. 완료 기록은 성공적으로 검사한 '시작 시각'을 사용
 * - 마지막으로 지나간 예약 시각 이후 확인한 적 없으면 즉시 보충 확인
 * - 한 번 성공한 예약 주기는 중복 실행하지 않음
**/
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
  // 저장된 마지막 확인 시각이 다른 필드명에 있어도 호환되도록 인식
  return Number(feedMeta.lastCheckedAt || feedMeta.lastSuccess || 0);
}
