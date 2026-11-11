// Reproduce the 10,000-case synthetic URL checker evaluation.
// Production background.check() is imported unchanged; only its IndexedDB module
// is swapped for an in-memory test double in a TEMPORARY isolated copy.
// No real malicious sites are visited or API requests made.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {datasetPath, readDataset, createDataset, SOURCES} from './generate-dataset.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(here,'../..');
const outDir=path.join(here,'results');
const cases=readDataset();
assert.deepEqual(cases, createDataset(), 'Input CSV must match reproducible dataset generator.');
const now=new Date().toISOString();
const recordsMap=new Map();
const known=[];
for (const row of cases) {
  if (row.group !== 'known_active' && row.group !== 'known_historical') continue;
  const found=row.url.match(/-(\d{5})\.test/);
  assert.ok(found, `Fixture URL format incorrect: ${row.url}`);
  const i=Number(found[1]);
  const active=row.group==='known_active';
  const record={url:row.url, source:SOURCES[i%SOURCES.length],meta:active ?
    {active:true,verified:true,online:true,valid:true,confidence:90,first_seen:now,lastObservedAt:now}:
    {active:false,verified:true,online:false,first_seen:'2025-01-01T00:00:00.000Z',lastObservedAt:'2025-01-01T00:00:00.000Z'}};
  recordsMap.set(row.url,[record]);
  known.push(record);
}
assert.equal(known.length,3000);

// The production DB adapter cannot be used in plain Node because it requires IndexedDB.
// Work on a temporary *copy* to avoid changing any production source file.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'safeurlink-synthetic-'));
try {
  fs.mkdirSync(path.join(temp,'core'),{recursive:true});
  fs.mkdirSync(path.join(temp,'background'),{recursive:true});
  fs.writeFileSync(path.join(temp,'package.json'),'{"type":"module"}\n');
  for(const f of fs.readdirSync(path.join(projectRoot,'core'))) {
    if (f.endsWith('.js') && f !== 'db.js') fs.copyFileSync(path.join(projectRoot,'core',f),path.join(temp,'core',f));
  }
  fs.copyFileSync(path.join(projectRoot,'background','background.js'),path.join(temp,'background','background.js'));
  // Only this adapter differs from original. Everything else (check, scoring, rule generation) is actual project code.
  fs.writeFileSync(path.join(temp,'core','db.js'), `
export async function lookup(url) { return globalThis.__SafeURLinkTestRecords.get(url) || []; }
export async function countBySource() { return { URLhaus:1, PhishTank:1, PhishingDB:1, ThreatFox:1, Demo:0 }; }
export async function all() { return [...globalThis.__SafeURLinkTestRecords.values()].flat(); }
`);
  globalThis.__SafeURLinkTestRecords=recordsMap;
  const noop=()=>{};
  globalThis.chrome={
    storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{}}},
    runtime:{onInstalled:{addListener:noop},onStartup:{addListener:noop},onMessage:{addListener:noop},getURL:s=>`chrome-extension://test/${s}`},
    alarms:{onAlarm:{addListener:noop}},contextMenus:{onClicked:{addListener:noop}},tabs:{}
  };
  const {check}=await import(pathToFileURL(path.join(temp,'background','background.js')).href);
  const {normalizeUrl}=await import(pathToFileURL(path.join(temp,'core','common.js')).href);
  const {buildProtectionRules}=await import(pathToFileURL(path.join(temp,'core','dnr.js')).href);
  const t0=performance.now();
  const {rules}=buildProtectionRules({realtime:true,allow:[],block:[]},known,'chrome-extension://test/warning.html');
  const rulesMs=performance.now()-t0;
  const blocks=rules.filter(r=>r.action.type==='block');
  assert.equal(blocks.length,2500);
  const selected=new Set(blocks.map(r=>r.condition.urlFilter.slice(1,-1)));
  const output=[];
  const durations=[];
  const expected={known_active:'Malicious',known_historical:'Suspicious',
    unseen_no_indicators:'No Threat Detected',unseen_heuristic_signals:'Suspicious',
    benign_simple:'No Threat Detected',benign_adversarial_synthetic:'Suspicious'};
  for(const row of cases){
    const start=performance.now();
    const v=await check(row.url);
    const duration=performance.now()-start;
    durations.push(duration);
    assert.equal(v.verdict,expected[row.group],`Unexpected verdict for ${row.group}: ${row.url}`);
    output.push({...row,verdict:v.verdict,score:v.score,heuristic:v.heuristicScore,
      external:v.externalScore,source:(v.sources||[]).join(';'),
      signature_present:recordsMap.has(normalizeUrl(row.url)),
      selected_rule:selected.has(normalizeUrl(row.url)),duration_ms:duration.toFixed(3)});
  }
  const counts={};
  for(const row of output){
    const group=counts[row.group]??={n:0,Malicious:0,Suspicious:0,'No Threat Detected':0,ERROR:0,block_rules_selected:0};
    group.n++;group[row.verdict]++;if(row.selected_rule)group.block_rules_selected++;
  }
  function scores(pred){
    const cm={TP:0,FP:0,FN:0,TN:0};
    for(const r of output){
      const y=pred(r), positive=r.label===1;
      cm[positive?(y?'TP':'FN'):(y?'FP':'TN')]++;
    }
    const {TP,FP,TN,FN}=cm;
    return {...cm,accuracy:(TP+TN)/output.length,precision:TP/(TP+FP||1),
      recall:TP/(TP+FN||1),f1:2*TP/(2*TP+FP+FN||1),fpr:FP/(FP+TN||1)};
  }
  durations.sort((a,b)=>a-b);
  const summary={
    experiment:'Synthetic fixture regression of production check() and buildProtectionRules(); NOT real-world accuracy',
    test_count:cases.length,real_feed_in_zip:2,synthetic_known_records:known.length,
    direct_check_invocations:output.length,production_source_version:'0.6.9',
    dnr_rules_generated:rules.length,block_rules_generated:blocks.length,
    direct_check_group_results:counts,
    illustrative_fixture_confusion_matrix_strict:scores(r=>r.verdict==='Malicious'),
    illustrative_fixture_confusion_matrix_warning:scores(r=>r.verdict==='Malicious'||r.verdict==='Suspicious'),
    time:{dnr_generation_ms:Math.round(rulesMs),direct_total_ms:Math.round(durations.reduce((x,y)=>x+y,0)),
      mean_check_ms:+(durations.reduce((x,y)=>x+y,0)/durations.length).toFixed(4),
      p95_check_ms:+durations[Math.floor(durations.length*.95)].toFixed(3)},
    limitation:'All labels are artificial .test assumptions; NOT measured detection accuracy against verified URLs. DNR rules are generated only; Chrome engine not tested.'
  };
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'synthetic-10000-summary.json'),JSON.stringify(summary,null,2)+'\n');
  const cols=['group','url','label','verdict','score','heuristic','external','source','signature_present','selected_rule','duration_ms'];
  const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  fs.writeFileSync(path.join(outDir,'synthetic-10000-results.csv'),cols.join(',')+'\n'+output.map(r=>cols.map(c=>cell(r[c])).join(',')).join('\n')+'\n');
  console.log(`합성 URL 검사 ${output.length}건: 전건 예상 판정 일치 / DNR block 규칙 ${blocks.length}개 생성`);
  console.log('주의: 실제 악성 URL 탐지 정확도가 아님.');
  console.log(JSON.stringify({groups:counts,strict:summary.illustrative_fixture_confusion_matrix_strict,warning:summary.illustrative_fixture_confusion_matrix_warning},null,2));
  console.log(`결과 폴더: ${outDir}`);
} finally {
  delete globalThis.__SafeURLinkTestRecords;
  delete globalThis.chrome;
  fs.rmSync(temp,{recursive:true,force:true});
}
