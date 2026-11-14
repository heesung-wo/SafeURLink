import test from 'node:test';
import assert from 'node:assert/strict';

const realNow = Date.now;
let now = Date.parse('2026-11-09T05:00:00Z'); // 11/9 14:00 KST
Date.now = () => now;
const yesterday = Date.parse('2026-11-08T06:30:00Z');
const todaySlot = Date.parse('2026-11-09T06:00:00Z');
const events = {};
const event = name => ({ addListener(fn) { events[name] = fn; } });
const values = {
  feedMeta: { lastSuccess: yesterday, generatedAt: '2026-11-08T04:00:00.000Z', nextAt: yesterday + 6*3600_000 },
  realtime: false, allow: [], block: [], ruleCount: 0, appliedSettings: {realtime:false,allow:[],block:[]}
};
let alarm;
const scheduled = [];
let requests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { requests++; throw new Error('test offline'); };

globalThis.chrome = {
  runtime: {
    onInstalled:event('installed'), onStartup:event('startup'), onMessage:event('message'),
    getURL: path => `chrome-extension://safe/${path}`, lastError: undefined
  },
  alarms: {
    onAlarm:event('alarm'),
    async get() { return alarm; },
    async create(name, spec) { alarm={name,scheduledTime:spec.when}; scheduled.push({...alarm}); }
  },
  storage: {local: {
    async get(keys) {
      if (typeof keys === 'string') keys = [keys];
      return Object.fromEntries((keys || []).filter(k => k in values).map(k => [k,structuredClone(values[k])]));
    },
    async set(data) { Object.assign(values, structuredClone(data)); },
    async remove(keys) { for(const k of keys) delete values[k]; }
  }},
  contextMenus: {
    onClicked:event('click'),
    removeAll(callback) { callback(); },
    create(_config, callback) { callback(); }
  },
  declarativeNetRequest: {
    async getDynamicRules() { return []; },
    async updateDynamicRules() {}
  }
};

const {runAutomaticSync, ensureDailyAlarm} = await import('../../background/background.js');
const settled = () => new Promise(resolve => setImmediate(resolve));
await runAutomaticSync();
await settled();

test('이전 주기의 nextAt가 저장되어 있어도 매일 15시 KST로 예약한다', async () => {
  assert.equal(requests,0);
  assert.equal(alarm.scheduledTime,todaySlot);
  assert.equal(alarm.periodInMinutes,undefined);
});


test('브라우저 재시작 등으로 알람이 사라지면 다시 복구한다', async () => {
  const expected = alarm.scheduledTime;
  alarm = undefined;
  await ensureDailyAlarm();
  assert.equal(alarm.scheduledTime, expected);
});

test('15시 전에 브라우저를 다시 열면 같은 날 알람이 유지되고 다운로드하지 않는다', async () => {
  now = Date.parse('2026-11-09T05:30:00Z');
  await runAutomaticSync();
  assert.equal(requests,0);
  assert.equal(alarm.scheduledTime,todaySlot);
});

test('15시를 놓친 상태에서 브라우저 첫 실행 시 확인하고 실패하면 1시간 후 재시도 예약', async () => {
  now = Date.parse('2026-11-09T07:00:00Z'); // 16:00 KST
  await runAutomaticSync();
  // 동기화의 finally에서 일일 알람을 다시 예약한다.
  await ensureDailyAlarm();
  assert.equal(requests,1);
  assert.match(values.feedMeta.lastError,/test offline/);
  assert.equal(values.feedMeta.generatedAt, '2026-11-08T04:00:00.000Z');
  assert.equal(alarm.scheduledTime, now+3600_000);
});

test('실패 직후 브라우저를 다시 실행해도 연속 다운로드하지 않는다', async () => {
  await runAutomaticSync();
  assert.equal(requests,1);
  assert.equal(alarm.scheduledTime,now+3600_000);
});

test('단발 알람 시간에 재시도할 수 있으며 성공 여부는 스케줄러에 기록된다', async () => {
  now = Date.parse('2026-11-09T08:01:00Z');
  await runAutomaticSync();
  await ensureDailyAlarm();
  assert.equal(requests,2);
  assert.equal(values.feedMeta.nextAt,now+3600_000);
});

test.after(() => { Date.now=realNow;globalThis.fetch=realFetch; });
