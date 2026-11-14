import test from 'node:test';
import assert from 'node:assert/strict';

// 설정 화면에 필요한 최소 DOM·Chrome API 모의.
const elements = {};
for (const id of ['realtime','allow','block','save','sync','msg','rc','coverage','tbl','note']) {
  elements[id] = {value:'',checked:true,textContent:'',innerHTML:'',disabled:false,onclick:null};
}
globalThis.document = {getElementById: id => elements[id]};
const values = { realtime:true, allow:[], block:[] };
const calls = [];
globalThis.chrome = {
  storage: {local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in values).map(k => [k, structuredClone(values[k])])); },
    async set(data) { Object.assign(values, structuredClone(data)); }
  }},
  runtime: {
    async sendMessage(msg) {
      calls.push(msg.type);
      if (msg.type === 'status') return { counts:{}, ruleCount:0, ruleStats:{} };
      if (msg.type === 'rebuild') return {total:0};
      if (msg.type === 'sync') return {ok:true,changed:false};
    }
  }
};
await import('../../pages/options/options.js');
const settle = () => new Promise(resolve => setImmediate(resolve));
await settle();

test('기존과 동일한 설정을 저장하면 DNR 규칙 재생성을 생략한다', async () => {
  calls.length = 0;
  await elements.save.onclick();
  assert.equal(calls.filter(c => c === 'rebuild').length, 0);
  assert.match(elements.msg.textContent, /변경된 설정/);
});

test('지금 업데이트를 누를 때 변경된 설정이 없으면 rebuild를 호출하지 않는다', async () => {
  calls.length = 0;
  await elements.sync.onclick();
  assert.equal(calls.filter(c => c === 'rebuild').length, 0);
  assert.equal(calls.filter(c => c === 'sync').length, 1);
});

test('설정 변경은 저장 후 규칙을 딱 한 번 재구성한다', async () => {
  calls.length = 0;
  elements.allow.value = 'trusted.example';
  await elements.save.onclick();
  assert.deepEqual(values.allow,['trusted.example']);
  assert.equal(calls.filter(c => c === 'rebuild').length,1);
});
