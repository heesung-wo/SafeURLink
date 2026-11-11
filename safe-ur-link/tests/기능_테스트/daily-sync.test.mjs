import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySlotAt, nextAutomaticCheckAt, lastCheckedTime } from '../../core/daily-sync.js';

const at = value => Date.parse(value);
const yesterday = at('2026-11-08T06:30:00Z'); // 11/8 15:30 KST
const todayBefore = at('2026-11-09T01:00:00Z'); // 11/9 10:00 KST
const todaySlot = at('2026-11-09T06:00:00Z'); // 11/9 15:00 KST
const todayAfter = at('2026-11-09T07:00:00Z'); // 11/9 16:00 KST
const tomorrowSlot = at('2026-11-10T06:00:00Z');

test('KST 오후 3시 예약 시각은 UTC 오전 6시다 (자정 경계 포함)', () => {
  assert.equal(dailySlotAt(todayBefore), todaySlot);
  assert.equal(dailySlotAt(todayAfter), todaySlot);
  assert.equal(dailySlotAt(at('2026-11-08T15:10:00Z')), todaySlot);
});

test('전날 정상 확인했고 오늘 예약 전이면 오늘 15시까지 기다린다', () => {
  assert.equal(nextAutomaticCheckAt(todayBefore, yesterday), todaySlot);
});

test('전날 성공했더라도 오늘 예약 시간이 지나면 바로 확인한다', () => {
  assert.equal(nextAutomaticCheckAt(todayAfter, yesterday), todayAfter);
});

test('브라우저가 며칠 꺼져 있었고 오늘 예약 시각 전이라도 밀린 확인을 한다', () => {
  const old = at('2026-11-07T06:30:00Z');
  assert.equal(nextAutomaticCheckAt(todayBefore, old), todayBefore);
});

test('이미 오늘 예약 시각 이후 확인 성공했으면 내일 15시까지 확인하지 않는다', () => {
  assert.equal(nextAutomaticCheckAt(todayAfter, at('2026-11-09T06:30:00Z')), tomorrowSlot);
});

test('예약 전 수동 확인만 했으면 오늘 정기 갱신을 여전히 수행한다', () => {
  assert.equal(nextAutomaticCheckAt(todayAfter, at('2026-11-09T05:59:00Z')), todayAfter);
});

test('수집에 실패하면 1시간 후 재시도하고, 이전 데이터는 완료로 취급하지 않는다', () => {
  const retryAt = at('2026-11-09T08:00:00Z');
  assert.equal(nextAutomaticCheckAt(todayAfter, yesterday, retryAt), retryAt);
  assert.equal(nextAutomaticCheckAt(retryAt, yesterday, retryAt), retryAt);
});

test('최초 설치에서 성공 기록이 없으면 곧바로 1회 확인한다', () => {
  assert.equal(nextAutomaticCheckAt(todayBefore), todayBefore);
  assert.equal(nextAutomaticCheckAt(todayAfter, 0), todayAfter);
});

test('구버전 feedMeta.lastSuccess 기록도 마지막 확인으로 인정한다', () => {
  assert.equal(lastCheckedTime({lastSuccess:yesterday}), yesterday);
  assert.equal(lastCheckedTime({lastSuccess:yesterday,lastCheckedAt:todaySlot}), todaySlot);
});
