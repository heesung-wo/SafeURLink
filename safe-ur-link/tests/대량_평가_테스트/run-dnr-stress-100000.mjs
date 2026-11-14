// Exercise the real DNR rule generator with 100,000 synthetic .test signatures.
// This does NOT install rules in Chrome and is not a real browser blocking test.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {buildProtectionRules} from '../../core/dnr.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const dest=path.join(here,'results','dnr-stress-100000-summary.json');
const names=['URLhaus','PhishTank','PhishingDB','ThreatFox'];
const now=new Date().toISOString();
const records=[];
for(let s=0;s<names.length;s++) for(let i=0;i<25000;i++) {
  const url=`https://s${s}-${String(i).padStart(6,'0')}.test/x-${i}`;
  records.push({url,source:names[s],meta:{active:true,online:true,valid:true,verified:true,confidence:90,first_seen:now,lastObservedAt:now}});
}
const ts=performance.now();
const {rules,stats}=buildProtectionRules({realtime:true,allow:[],block:[]},records,'chrome-extension://test/warning.html');
const ms=performance.now()-ts;
const selected=Object.fromEntries(names.map(name=>[name,stats.selectedBySource[name]]));
assert.equal(rules.length,29700);
assert.equal(rules.filter(r=>r.action.type==='block').length,29700);
assert.deepEqual(selected,{URLhaus:9000,PhishTank:9000,PhishingDB:9000,ThreatFox:2700});
assert.equal(stats.quotaOverflowUrls,70300);
const summary={input_records:records.length,unique_urls:records.length,
  generated_rules:rules.length,block_rules:rules.filter(r=>r.action.type==='block').length,
  selected_by_source:selected,quota_overflow:stats.quotaOverflowUrls,generation_ms:Math.round(ms),
  note:'100,000 synthetic .test signatures; pure JavaScript rule generation only; Chrome installation/matching not tested.'};
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(summary,null,2)+'\n');
console.log('DNR 규칙 생성 시험 통과:',JSON.stringify(summary,null,2));
console.log(`결과: ${dest}`);
