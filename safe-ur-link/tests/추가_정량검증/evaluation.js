// SafeURLink 추가 정량 검증 페이지. 위험 URL로 네트워크 요청을 보내지 않습니다.
const $ = id => document.getElementById(id);
const SOURCES = ['URLhaus', 'PhishTank', 'PhishingDB', 'ThreatFox'];
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const reports = { generatedAt: null, environment: null, registered: null, normal: null, dnr: null };
const details = { registered: [], normal: [], dnr: [] };

function showError(error) {
  $('error').textContent = String(error?.message || error);
  console.error(error);
}
function reportText(id, value) {
  $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function escapeCell(raw) {
  let s = raw === undefined || raw === null ? '' : String(raw);
  if (/^\s*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function saveRows(group) {
  const rows = details[group];
  if (!rows.length) throw new Error('저장할 검사 결과가 없습니다.');
  const cols = Object.keys(rows[0]);
  const csv = '\uFEFF' + cols.join(',') + '\r\n' + rows.map(row => cols.map(key => escapeCell(row[key])).join(',')).join('\r\n');
  download(`SafeURLink_${group}_details.csv`, csv, 'text/csv;charset=utf-8');
}
function sampleIndices(count, amount, seed) {
  // 동일한 입력일 때 같은 표본을 고를 수 있도록 고정된 난수 시드 사용.
  let state = seed >>> 0;
  function rand() { state = (1664525 * state + 1013904223) >>> 0; return state / 2**32; }
  const selected = new Set();
  while (selected.size < Math.min(count, amount)) selected.add(Math.floor(rand() * count));
  return [...selected].sort((a,b) => a-b);
}
function send(type, payload={}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}
async function readEnvironment() {
  const result = await send('status');
  if (result?.error) throw new Error(result.error);
  reports.environment = {
    time: new Date().toISOString(),
    counts: result.counts,
    ruleCountStored: result.ruleCount,
    feedGeneratedAt: result.feedMeta?.generatedAt || null,
    feedLastAppliedAt: result.feedMeta?.lastAppliedAt || null
  };
  return reports.environment;
}
async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('safe-ur-link');
    request.onupgradeneeded = () => reject(new Error('현재 프로필에 기존 SafeURLink DB가 없습니다. 먼저 설정에서 시그니처를 다운로드하세요.'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (!request.result.objectStoreNames.contains('sigs')) {
        request.result.close(); reject(new Error('sigs 저장소가 없습니다.'));
      } else resolve(request.result);
    };
  });
}
async function chooseSourceRecords(db, source, target=50) {
  // source 인덱스에서 시드 기반 분산 위치를 선택한다. 활성/최신 상태를 확인한 뒤 검증한다.
  const tx = db.transaction('sigs', 'readonly');
  const idx = tx.objectStore('sigs').index('source');
  const count = await new Promise((resolve,reject) => {
    const req = idx.count(IDBKeyRange.only(source));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!count) return [];
  const offsets = sampleIndices(count, Math.min(count, Math.max(300, target * 8)), 20261114 + source.length * 97);
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const items = [];
    let pos = 0, index = 0;
    const request = idx.openCursor(IDBKeyRange.only(source));
    request.onsuccess = () => {
      const cur = request.result;
      if (!cur || index >= offsets.length || items.length >= target) { resolve(items); return; }
      if (pos < offsets[index]) { const delta = offsets[index] - pos; pos += delta; cur.advance(delta); return; }
      const record = cur.value;
      const ts = Date.parse(record.meta?.lastObservedAt);
      if (record.meta?.active !== false && (!Number.isFinite(ts) || now - ts <= SEVEN_DAYS)) items.push(record);
      index++;
      if (index >= offsets.length || items.length >= target) { resolve(items); return; }
      const delta = offsets[index] - pos;
      pos += delta;
      cur.advance(delta);
    };
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}
function countsForVerdicts(rows) {
  const byVerdict = {};
  for (const row of rows) byVerdict[row.verdict] = (byVerdict[row.verdict] || 0) + 1;
  return byVerdict;
}
async function testRegistered() {
  const button = $('registered'); button.disabled = true;
  $('error').textContent = '';
  reportText('registeredResult', '현재 DB에서 표본을 선정하고 있습니다...');
  let db;
  try {
    await readEnvironment();
    db = await openDb();
    const chosen = [], seen = new Set(), selectedBySource = {};
    for (const source of SOURCES) {
      const records = await chooseSourceRecords(db, source, 50);
      selectedBySource[source] = 0;
      for (const record of records) {
        if (seen.has(record.url)) continue;
        seen.add(record.url);
        chosen.push({ source, url: record.url, lastObservedAt: record.meta?.lastObservedAt || '' });
        selectedBySource[source]++;
      }
    }
    if (!chosen.length) throw new Error('현재 활성 시그니처 표본을 찾지 못했습니다.');
    const rows = [];
    for (let i=0; i<chosen.length; i++) {
      const candidate = chosen[i];
      const result = await send('check', { url: candidate.url });
      rows.push({ ...candidate,
        verdict: result?.verdict || '',
        sources: (result?.sources || []).join('|'),
        historyOnly: result?.historyOnly === true,
        error: result?.error || '' });
      if ((i + 1) % 25 === 0) reportText('registeredResult', `검사 중 ${i+1}/${chosen.length}...`);
    }
    details.registered = rows;
    const valid = rows.filter(r => !r.error);
    const malicious = valid.filter(r => r.verdict === 'Malicious').length;
    const summary = {
      time: new Date().toISOString(), sampled: rows.length,
      errors: rows.length - valid.length, checked: valid.length,
      verdicts: countsForVerdicts(valid),
      recognized: malicious, recognitionRate: valid.length ? Math.round(10000*malicious/valid.length)/100 : null,
      selectedBySource, limitation: '현재 DB 활성·최신 URL을 입력한 조회 기능 시험(독립적인 악성 URL 탐지율 아님)'
    };
    reports.registered = summary;
    reportText('registeredResult', summary);
    $('registeredDownload').disabled = false;
  } catch(e) { showError(e); reportText('registeredResult', '검사 실패: ' + e.message); }
  finally { db?.close(); button.disabled = false; }
}
function parseCsv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;}else{cell+=c;}}
    else if(c==='"'){quoted=true;}
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));if(row.some(s=>s.trim())) rows.push(row);row=[];cell='';}
    else{cell+=c;}
  }
  row.push(cell.replace(/\r$/,''));if(row.some(s=>s.trim())) rows.push(row);
  if(!rows.length)throw new Error('CSV 데이터가 비어 있습니다.');
  const headers=rows.shift().map(s=>s.trim());
  if(!headers.includes('url')||!headers.includes('label')) throw new Error('CSV에는 url,label 열이 필요합니다.');
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}
async function testNormal() {
  const button=$('normal');button.disabled=true;$('error').textContent='';
  reportText('normalResult','CSV에서 정상 URL 후보를 읽고 있습니다...');
  try{
    const file=$('normalFile').files[0];
    if(!file)throw new Error('먼저 정상 URL 후보가 포함된 CSV 파일을 선택해 주세요.');
    const max=Math.min(1000,Math.max(1,Number($('normalLimit').value)||500));
    const records=parseCsv(await file.text()).filter(r=>r.label==='0'&&r.url);
    const unique=[...new Map(records.map(r=>[r.url,r])).values()];
    const offsets=sampleIndices(unique.length,Math.min(unique.length,max),20261114);
    const chosen=offsets.map(i=>unique[i]);
    if(!chosen.length)throw new Error('label=0인 정상 URL 후보가 없습니다.');
    const rows=[];
    for(let i=0;i<chosen.length;i++){
      const candidate=chosen[i];
      const result=await send('check',{url:candidate.url});
      rows.push({url:candidate.url,label:'0',group:candidate.group||'',
        verdict:result?.verdict||'',sources:(result?.sources||[]).join('|'),error:result?.error||''});
      if((i+1)%25===0) reportText('normalResult',`검사 중 ${i+1}/${chosen.length}...`);
    }
    details.normal=rows;
    const valid=rows.filter(r=>!r.error);
    const alarms=valid.filter(r=>r.verdict==='Malicious'||r.verdict==='Suspicious').length;
    const summary={time:new Date().toISOString(),filename:file.name,normalCandidates:rows.length,
      errors:rows.length-valid.length,checked:valid.length,
      verdicts:countsForVerdicts(valid),alarms,
      candidateWarningRate:valid.length?Math.round(10000*alarms/valid.length)/100:null,
      limitation:'제공 데이터의 정상 후보 라벨을 전제한 표본 오경고율. 전체 정상 사이트 오탐률이 아님'};
    reports.normal=summary;reportText('normalResult',summary);$('normalDownload').disabled=false;
  }catch(e){showError(e);reportText('normalResult','검사 실패: '+e.message);}
  finally{button.disabled=false;}
}
async function testDnr(){
  const button=$('dnr');button.disabled=true;$('error').textContent='';
  reportText('dnrResult','등록된 DNR 규칙을 읽고 있습니다...');
  try{
    const rules=(await chrome.declarativeNetRequest.getDynamicRules())
      .filter(rule=>rule.action?.type==='block' && /^\|https?:\/\//.test(rule.condition?.urlFilter||'') && rule.condition.urlFilter.endsWith('|'))
      .sort((a,b)=>a.id-b.id);
    if(!rules.length)throw new Error('등록된 DNR block 규칙이 없습니다. 실시간 보호 설정과 규칙을 확인하세요.');
    const ids=sampleIndices(rules.length,Math.min(50,rules.length),20261114);
    const rows=[];
    for(let i=0;i<ids.length;i++){
      const rule=rules[ids[i]], url=rule.condition.urlFilter.slice(1,-1);
      try{
        const result=await chrome.declarativeNetRequest.testMatchOutcome({url,type:'main_frame'});
        const matched=(result.matchedRules||[]).some(r=>r.ruleId===rule.id);
        rows.push({ruleId:rule.id,url,match:matched,returnedRules:(result.matchedRules||[]).map(r=>r.ruleId).join('|'),error:''});
      }catch(error){rows.push({ruleId:rule.id,url,match:false,returnedRules:'',error:error.message||String(error)});}
    }
    details.dnr=rows;
    const valid=rows.filter(r=>!r.error), matched=valid.filter(r=>r.match).length;
    const summary={time:new Date().toISOString(),dynamicBlockRules:rules.length,sampled:rows.length,
      errors:rows.length-valid.length,checked:valid.length,matched,
      virtualMatchRate:valid.length?Math.round(10000*matched/valid.length)/100:null,
      limitation:'가상 요청 결과. 실제 악성 사이트 방문 또는 전체 위협 차단율 측정이 아님'};
    reports.dnr=summary;reportText('dnrResult',summary);$('dnrDownload').disabled=false;
  }catch(e){showError(e);reportText('dnrResult','검사 실패: '+e.message);}
  finally{button.disabled=false;}
}
$('status').onclick=async()=>{try{reportText('statusResult',await readEnvironment());}catch(e){showError(e);}};
$('registered').onclick=testRegistered;
$('normal').onclick=testNormal;
$('dnr').onclick=testDnr;
for(const group of ['registered','normal','dnr'])$(group+'Download').onclick=()=>{try{saveRows(group);}catch(e){showError(e);}};
$('summary').onclick=()=>{reports.generatedAt=new Date().toISOString();download('SafeURLink_evaluation_summary.json',JSON.stringify(reports,null,2),'application/json;charset=utf-8');};
