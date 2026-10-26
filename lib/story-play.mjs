import {chronicleCommand,stamp} from './chronicle.mjs';
import {storyState} from '../public/play/story-state.js';
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
export function playableDay(r,date){
 const c=r.chronicle;
 stamp(date);
 if(!c.clock||!c.activeCaseId)fail('시나리오를 먼저 준비하세요.');
 const active=c.cases.find(x=>x.id===c.activeCaseId);if(active?.contentRef&&(!active.opened||r.journey?.regionId!==active.contentRef.regionId))fail('달력에서 해당 지역에 먼저 진입하세요.');
 if(active?.contentRef)fail('준비 케이스는 달력에서 장소와 행동을 선택하세요. 도입을 다시 생성하지 않습니다.');
 if(stamp(date)-stamp(c.clock.date)>366*86400000)fail('현재 날짜에서 1년 이내의 사건을 선택하세요.');
 if(date<c.clock.date)fail('지나간 날짜는 기록에서 확인하세요.');
 if(['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>!a||a.status!=='resolved'))fail('진행 중인 행동과 GM 응답을 먼저 마치세요.');
 const events=c.events.filter(e=>(!e.caseId||e.caseId===c.activeCaseId)&&e.visibility==='public'&&e.status==='scheduled');
 if(date>c.clock.date&&events.some(e=>e.date<date))fail('앞선 날짜의 사건과 마감을 먼저 처리하세요.');
 const today=events.filter(e=>e.date===date);
 if(!today.length)fail('이 날짜에는 플레이할 사건이 없습니다.');
 if(c.playedDays?.includes(`${c.activeCaseId}/${date}`))fail('이미 시작한 날짜입니다. 진행 가능한 행동을 선택하세요.');
 return {date,time:date===c.clock.date?c.clock.time:today.map(e=>e.time).sort()[0]};
}
export function queueStoryDay(r,u,p){
 if(!r.members.some(m=>m.id===u.id))fail('참가 권한이 필요합니다.',403);
 if(r.owner!==u.id)fail('새 날짜 시작은 방장이 선택합니다. 참가자는 열린 날짜의 행동을 선택하세요.',403);
 const targetClock=playableDay(r,p.date);
 r.gmJob={id:crypto.randomUUID(),kind:'storyDay',status:'queued',at:new Date().toISOString(),requesterId:u.id,targetClock,caseId:r.chronicle.activeCaseId};
 return {};
}
export function beginStoryDay(r,u){
 const c=r.chronicle,target=r.gmJob.targetClock;
 if(c.activeCaseId!==r.gmJob.caseId)fail('진행 중인 사건이 바뀌었습니다.');
 // Validate again against the authoritative state, ignoring only this job's lock.
 playableDay({...r,gmJob:{status:'applying'}},target.date);
 const minutes=(stamp(target.date,target.time)-stamp(c.clock.date,c.clock.time))/60000;
 // Move in bounded chunks so a scenario may span months without weakening normal time limits.
 let left=minutes;while(left>0){const step=Math.min(left,10080);chronicleCommand(r,u,'advanceClock',{minutes:step,reason:'선택한 날짜 시작'});left-=step;}
 const first=c.events.find(e=>e.date===target.date&&e.caseId===c.activeCaseId&&e.visibility==='public'&&e.mapId);
 if(first&&r.maps.some(m=>m.id===first.mapId))r.mapId=first.mapId;
 const map=r.maps.find(m=>m.id===r.mapId);
 if(map){
  r.scene.title=map.title;r.scene.background=map.sceneBackground||map.image;
  for(const [index,id] of (r.partyCharacterIds||[]).entries()){
   const character=r.characters.find(c=>c.id===id);if(character&&!map.tokens.some(t=>t.characterId===id))map.tokens.push({id:crypto.randomUUID(),characterId:id,name:character.name,x:.25+index*.15,y:.8,hidden:false});
  }
 }
 c.playedDays??=[];c.playedDays.push(`${c.activeCaseId}/${target.date}`);
}
export function storyGMCommand(r,original,u,op,p){
 const c=r.chronicle;
 const actionIds=original.gmJob.actionIds||original.actions.filter(a=>a.status==='pending').map(a=>a.id);
 if(op==='finishBeat'){
  const e=c.events.find(e=>e.id===p.id);
  if(!e||e.kind==='deadline')fail('완료할 활동을 확인하세요.');
  const ids=p.actionIds||r.actions.filter(a=>a.storyEventId===e.id&&actionIds.includes(a.id)).map(a=>a.id);
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length)fail('행동 근거를 확인하세요.');
  const actions=ids.map(id=>r.actions.find(a=>a.id===id&&actionIds.includes(id)&&(!a.storyEventId||a.storyEventId===e.id))); 
  if(!actions.length||actions.some(a=>!a||a.status!=='resolved')||r.actions.some(a=>a.storyEventId===e.id&&a.status!=='resolved'))fail('이 사건의 실제 행동 결과가 필요합니다.');
  if(e.duration&&actions.some(a=>a.timeCharged))fail('이미 시간을 반영한 행동입니다.');
  chronicleCommand(r,u,'finishBeat',p);
  for(const a of actions)a.timeCharged=true;
  return true;
 }
 if(op==='advanceActionTime'){
  if(!Array.isArray(p.actionIds)||!p.actionIds.length||new Set(p.actionIds).size!==p.actionIds.length)fail('시간을 사용할 행동을 확인하세요.');
  const actions=p.actionIds.map(id=>r.actions.find(a=>a.id===id&&actionIds.includes(id)));
  if(actions.some(a=>!a||a.status!=='resolved'||a.timeCharged||a.storyEventId))fail('완료된 일반 행동에만 시간을 한 번 반영할 수 있습니다.');
  chronicleCommand(r,u,'advanceClock',{minutes:p.minutes,reason:p.reason});
  actions.forEach(a=>a.timeCharged=true);return true;
 }
 if(op==='resolveDeadline'){
  const e=c.events.find(e=>e.id===p.id);
  if(!e||e.kind!=='deadline'||e.status!=='scheduled'||e.caseId&&e.caseId!==c.activeCaseId||!['available','overdue'].includes(storyState(e,c)))fail('현재 도달한 마감만 처리할 수 있습니다.');
  if(!['done','cancelled'].includes(p.status)||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>2000)fail('마감 결과를 확인하세요.');
  e.status=p.status;e.resolution=p.reason;
  r.messages.push({id:crypto.randomUUID(),type:'system',name:'GM',author:u.id,text:`${e.title} · ${p.reason}`,...(e.visibility==='gm'?{type:'whisper',recipient:r.owner}:{}),at:new Date().toISOString()});return true;
 }
 if(op==='endCase'){
  if(!c.activeCaseId||c.events.some(e=>e.caseId===c.activeCaseId&&e.status==='scheduled'))fail('남아 있는 사건과 마감을 먼저 처리하세요.');
  chronicleCommand(r,u,'endCase',p);return true;
 }
 return false;
}
