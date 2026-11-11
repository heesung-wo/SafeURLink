'use strict';
const $ = (id) => document.getElementById(id);
let stopped=false, results=[], summary=null;

function csvRows(s) {
  const out=[];let row=[],cur='',q=false;
  // RFC4180-style quoted cells; includes embedded commas and newlines.
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){if(c==='"' && s[i+1]==='"'){cur+='"';i++;}else if(c==='"'){q=false;}else{cur+=c;}}
    else if(c==='"'){q=true;}
    else if(c===','){row.push(cur);cur='';}
    else if(c==='\n'){row.push(cur.replace(/\r$/,''));if(row.some(x=>x.length))out.push(row);row=[];cur='';}
    else{cur+=c;}
  }
  row.push(cur.replace(/\r$/,''));if(row.some(x=>x.length))out.push(row);
  return out;
}
function parseCsv(text){
  const rows=csvRows(text);if(!rows.length)throw Error('CSV가 비어 있습니다');
  const h=rows.shift().map(x=>x.trim().replace(/^\ufeff/,''));
  if(!h.includes('url')||!h.includes('label'))throw Error('url,label 열이 필요합니다');
  const ix=key=>h.indexOf(key);
  const result=[];
  for(let i=0;i<rows.length;i++) {
    const r=rows[i],url=(r[ix('url')]||'').trim(),label=(r[ix('label')]||'').trim();
    if(!url || !['0','1'].includes(label))throw Error(`${i+2}행: url이 없거나 label이 0/1이 아닙니다`);
    result.push({url,label:Number(label),group:ix('group')<0?'':r[ix('group')]||'',evidence:ix('evidence')<0?'':r[ix('evidence')]||''});
  }
  return result;
}
const metrics=(rows,pred)=>{
  let TP=0,FP=0,FN=0,TN=0;
  for(const r of rows){const p=pred(r);if(r.label===1){p?TP++:FN++;}else{p?FP++:TN++;}}
  const ratio=(a,b)=>b?+(a/b).toFixed(6):null;
  return {n:rows.length,TP,FP,FN,TN,accuracy:ratio(TP+TN,rows.length),precision:ratio(TP,TP+FP),recall:ratio(TP,TP+FN),f1:ratio(2*TP,2*TP+FP+FN),fpr:ratio(FP,FP+TN)};
};
const fmtCsv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
function save(name,text,type){const blob=new Blob([text],{type});const link=document.createElement('a');const u=URL.createObjectURL(blob);link.href=u;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
const show=s=>$('status').textContent=s;
async function start(){
 const file=$('file').files[0];if(!file){show('CSV 파일을 선택해 주세요.');return;}
 const cases=parseCsv(await file.text());
 $('start').disabled=true;$('cancel').disabled=false;$('saveResults').disabled=true;$('saveSummary').disabled=true; stopped=false;results=[];
 const st=Date.now(),den=await chrome.runtime.sendMessage({type:'status'});
 const dnr=chrome.declarativeNetRequest;
 const dynamic=await dnr.getDynamicRules();
 const session=await dnr.getSessionRules();
 const byId=new Map([...dynamic,...session].map(r=>[r.id,r]));
 const dnrEnabled=typeof dnr.testMatchOutcome==='function';
 const dnrWarnings=[];
 for(let from=0;from<cases.length && !stopped;from+=20){
   const portion=cases.slice(from,from+20);
   const answers=await Promise.all(portion.map(async t=>{
     const started=performance.now();let check=null,matched=null,mode='not_evaluated',err='';
     try{check=await chrome.runtime.sendMessage({type:'check',url:t.url});}catch(e){err='check: '+String(e.message||e);}
     const elapsed=performance.now()-started;
     if(dnrEnabled){
       try{
         matched=await dnr.testMatchOutcome({url:t.url,type:'main_frame'});
         const actions=(matched.matchedRules||[]).map(v=>byId.get(v.ruleId)?.action?.type).filter(Boolean);
         mode=actions.includes('block')?'block':actions.includes('redirect')?'redirect':actions.includes('allow')?'allow':actions.length?'other':'none';
         if(matched.matchedRules?.length && actions.length!==matched.matchedRules.length)mode='unknown_rule';
       }catch(e){mode='api_error';if(!dnrWarnings.length)dnrWarnings.push(String(e.message||e));}
     }else{mode='api_unavailable';}
     return {...t,verdict:check?.verdict||'',score:check?.score??'',historyOnly:check?.historyOnly??'',sources:(check?.sources||[]).join('|'),elapsed_ms:elapsed.toFixed(3),dnr_action:mode,error:err||check?.error||''};
   }));
   results.push(...answers);
   show(`${results.length}/${cases.length}개 완료\nDNR 시험: ${dnrEnabled?'요청 중':'API 사용 불가'}\n시간: ${((Date.now()-st)/1000).toFixed(1)}초`);
   await new Promise(r=>setTimeout(r,0));
 }
 const evaluated=results.filter(x=>!x.error && ['Malicious','Suspicious','No Threat Detected'].includes(x.verdict));
 const strict=metrics(evaluated,x=>x.verdict==='Malicious');
 const warning=metrics(evaluated,x=>['Malicious','Suspicious'].includes(x.verdict));
 const dnrEvaluated=results.filter(x=>!x.error && ['block','redirect','allow','none'].includes(x.dnr_action));
 const dnrMetrics=metrics(dnrEvaluated,x=>x.dnr_action==='block');
 summary={
  kind:'independent evaluation of user-supplied labeled URL dataset',
  createdAt:new Date().toISOString(),sourceFile:file.name,requestedCount:cases.length,completedCount:results.length,stopped,
  labelNotes:'Label quality and ground-truth provenance are the responsibility of the evaluator; group and evidence columns retained.',
  feedMeta:den?.feedMeta||{},ruleCount:dynamic.length,sessionRules:session.length,counts:den?.counts||{},
  direct_strict:strict,direct_warning:warning,
  dnr_block_vs_nonblock:dnrMetrics,dnr_tested:dnrEvaluated.length,dnr_api_warnings:dnrWarnings,
  note:'DNR block rate is evaluated for all labeled URLs; DNR selection and browser rule matching may differ. TestMatchOutcome does NOT navigate to URLs.'
 };
 show($('status').textContent+'\n\n직접 검사: '+JSON.stringify(strict)+'\n경고 기준: '+JSON.stringify(warning)+'\nDNR 차단: '+JSON.stringify(dnrMetrics));
 $('start').disabled=false;$('cancel').disabled=true;$('saveResults').disabled=false;$('saveSummary').disabled=false;
}
$('start').addEventListener('click',()=>start().catch(e=>{show('실패: '+String(e.message||e));$('start').disabled=false;$('cancel').disabled=true;}));
$('cancel').addEventListener('click',()=>{stopped=true;});
$('saveResults').addEventListener('click',()=>{const fields=['group','url','label','evidence','verdict','score','historyOnly','sources','elapsed_ms','dnr_action','error'];const csv=fields.join(',')+'\n'+results.map(r=>fields.map(k=>fmtCsv(r[k])).join(',')).join('\n');save('safeurlink-predictions.csv',csv,'text/csv;charset=utf-8');});
$('saveSummary').addEventListener('click',()=>save('safeurlink-metrics.json',JSON.stringify(summary,null,2),'application/json'));
