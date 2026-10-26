// Correct an opening's fictional date, without advancing gameplay or wall-clock timestamps.
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export function correctStartingDate(r,p){
 const c=r.chronicle,old=c.clock;
 if(!old)fail('먼저 시작 날짜를 설정하세요.');
 if(r.actions.length||r.rolls.length||r.combat||c.cases.some(x=>x.status!=='open')||['queued','running'].includes(r.gmJob?.status))fail('플레이 진행 전의 시작 날짜만 함께 정정할 수 있습니다.');
 if(p.time!==old.time)fail('시작 날짜 정정에서는 기존 시각을 유지하세요.');
 const delta=Date.parse(p.date+'T00:00:00Z')-Date.parse(old.date+'T00:00:00Z');
 if(!delta)return;
 const shift=date=>{const next=new Date(Date.parse(date+'T00:00:00Z')+delta).toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(next))fail('이동한 날짜 범위를 확인하세요.');return next;};
 const korean=date=>{const [y,m,d]=date.split('-').map(Number);return `${y}년 ${m}월 ${d}일`;};
 const before={clock:structuredClone(old),messages:[],caseClocks:structuredClone(c.cases.map(x=>({id:x.id,startClock:x.startClock,endClock:x.endClock}))),events:structuredClone(c.events),playedDays:[...(c.playedDays||[])]};
 const rewrite=s=>typeof s==='string'?s.replaceAll(korean(old.date),korean(p.date)).replaceAll(old.date,p.date):s;
 for(const m of r.messages){if(m.gameClock){before.messages.push({id:m.id,gameClock:structuredClone(m.gameClock),text:m.text});m.gameClock.date=shift(m.gameClock.date);}
  if(['narration','gm','npcDialogue','system'].includes(m.type))m.text=rewrite(m.text);
 }
 for(const e of c.events)e.date=shift(e.date);
 for(const x of [...c.cases,...c.episodes])for(const key of ['startClock','endClock'])if(x[key])x[key].date=shift(x[key].date);
 c.playedDays=(c.playedDays||[]).map(s=>s.slice(0,-10)+shift(s.slice(-10)));
 r.scene.narration=rewrite(r.scene.narration);
 if(r.gmJob?.targetClock)r.gmJob.targetClock.date=shift(r.gmJob.targetClock.date);
 if(r.gmJob?.message)r.gmJob.message=rewrite(r.gmJob.message);
 for(const m of r.gmMemory||[])m.text=rewrite(m.text);
 const correction=`[시작 시점 확정] 이 캠페인의 시작은 ${korean(p.date)} ${p.time}이다. 원문 바이블의 ${old.date.slice(0,4)}년 잠정 시작 연도보다 이 정정을 우선한다. 현재 시각은 chronicle.clock을 따른다.`;
 if((r.campaign.gmInstructions||'').length+correction.length+2>200000)fail('GM 지침의 길이를 줄인 뒤 정정하세요.');
 r.campaign.gmInstructions=(r.campaign.gmInstructions||'')+'\n\n'+correction;
 c.startCorrections=[...(c.startCorrections||[]),{at:new Date().toISOString(),reason:p.reason,to:{date:p.date,time:p.time},before}].slice(-5);
}
