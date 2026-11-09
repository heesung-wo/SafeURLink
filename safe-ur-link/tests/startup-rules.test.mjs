import test from 'node:test';
import assert from 'node:assert/strict';

const events = {};
const event = name => ({addListener(fn) { events[name] = fn; }});
const values = {
  realtime:false,allow:[],block:[],ruleCount:0,
  appliedSettings:{ realtime:false,allow:[],block:[] }
};
let installedRules = [];
let writes = 0;
globalThis.chrome = {
  runtime: {getURL: path => `chrome-extension://safe/${path}`,onInstalled:event('install'),onStartup:event('startup'),onMessage:event('message')},
  storage: {local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in values).map(k => [k, structuredClone(values[k])])); },
    async set(data) { Object.assign(values, structuredClone(data)); }
  }},
  alarms: {onAlarm:event('alarm')},
  contextMenus: {onClicked:event('click')},
  declarativeNetRequest: {
    async getDynamicRules() { return installedRules; },
    async updateDynamicRules(change) { writes++; installedRules = [...change.addRules]; }
  }
};
const { ensureRulesInstalled } = await import('../background/background.js');

test('정상 DNR 규칙이 유지된 브라우저 재시작은 규칙을 재작성하지 않는다', async () => {
  const r = await ensureRulesInstalled();
  assert.equal(r.reused,true);
  assert.equal(writes,0);
});

test('DNR 규칙 수와 저장된 수가 다른 경우 재구성한다(보호 off면 DB 로드 생략)', async () => {
  values.ruleCount = 2;
  const r = await ensureRulesInstalled();
  assert.equal(writes,1);
  assert.equal(values.ruleCount,0);
  assert.equal(r.total,0);
});

test('저장된 규칙 설정이 현재와 다르면 재구성한다', async () => {
  values.appliedSettings = {realtime:true,allow:[],block:[]};
  const r = await ensureRulesInstalled();
  assert.equal(writes,2);
  assert.equal(r.total,0);
  assert.equal(values.appliedSettings.realtime,false);
});
