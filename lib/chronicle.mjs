import {requireScopeIdle} from './play-scope.mjs';
import {requireAccess} from './factions.mjs';
// Fictional civil time: never tied to wall-clock time, browser locale or DST.
import {configureReward,settleCaseReward} from './case-rewards.mjs';
import {correctStartingDate} from './starting-date.mjs';
import {storyState,periods} from '../public/play/story-state.js';
const bad=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max=2000,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim())?v.trim():bad('기록 내용을 확인하세요.');
export function stamp(date,time='00:00'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))bad('날짜와 시간을 확인하세요.');
 const iso=`${date}T${time}:00.000Z`,ms=Date.parse(iso);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==iso||Number(date.slice(0,4))<1)bad('존재하는 날짜와 시간이 필요합니다.');
 return ms;
}
export function chronicle(r){
 r.chronicle||={clock:null,cases:[],events:[],episodes:[],activeCaseId:'',activeEpisodeId:''};
 return r.chronicle;
}
export function eventTiming(e,clock){
 if(e.status!=='scheduled')return e.status;
 if(!clock)return 'scheduled';
 const diff=stamp(e.date,e.time)-stamp(clock.date,clock.time);
 return diff<0?'overdue':diff===0?'due':'upcoming';
}
export function publicChronicle(r,u){
 const c=chronicle(r);
 if(r.owner===u.id)return;
 delete c.preparation;delete c.startCorrections;
 if(r.gmJob?.kind==='preparation'){delete r.gmJob.requestText;delete r.gmJob.title;delete r.gmJob.message;}
 const hidden=new Set(c.cases.filter(x=>x.visibility==='gm').map(x=>x.id));
 const availability=new Map(c.events.map(e=>[e.id,storyState(e,c)]));
 c.cases=c.cases.filter(x=>x.visibility!=='gm');
 for(const entry of c.cases){delete entry.scenarioSource;delete entry.openingPrompt;}
 c.events=c.events.filter(x=>x.visibility!=='gm'&&!hidden.has(x.caseId));
 // A hidden prerequisite must not become a playable public beat or leak its ID.
 c.events=c.events.map(e=>({...e,availability:availability.get(e.id),requires:(e.requires||[]).filter(id=>c.events.some(v=>v.id===id))}));
 c.episodes=c.episodes.filter(x=>!hidden.has(x.caseId));
 if(hidden.has(c.activeCaseId))c.activeCaseId='';
 if(!c.episodes.some(x=>x.id===c.activeEpisodeId))c.activeEpisodeId='';
}
export const CHRONICLE_OPS=['configureCaseReward','claimCaseReward','setClock','advanceClock','nextPeriod','finishBeat','startCase','endCase','caseFile','deleteCase','selectCase','calendarEvent','deleteCalendarEvent','startEpisode','endEpisode','editEpisode'];
export function chronicleCommand(r,u,op,p){
 if(!CHRONICLE_OPS.includes(op))return null;
 if(r.owner!==u.id)bad('방장 권한이 필요합니다.',403);
 if(['startCase','selectCase','startEpisode'].includes(op)){requireScopeIdle(r);const target=r.chronicle?.cases.find(c=>c.id===(p.id||p.caseId));requireAccess(r,target?.accessRequirements);}
 const c=chronicle(r),now=new Date().toISOString();
 if(['startCase','selectCase','startEpisode'].includes(op)&&c.cases.some(x=>x.id===(p.id||p.caseId)&&x.contentRef))bad('준비된 케이스는 달력에서 이동·진입을 선택하세요.');
 const find=(list,id)=>list.find(x=>x.id===id)||bad('기록을 찾을 수 없습니다.');
 const caseId=id=>{if(id)find(c.cases,id);return id||'';};
 const visibility=v=>['public','gm'].includes(v)?v:bad('공개 범위를 확인하세요.');
 const log=message=>r.messages.push({id:crypto.randomUUID(),type:'system',text:message,author:u.id,name:u.name,gameClock:structuredClone(c.clock),at:now});
 switch(op){
 case 'configureCaseReward':{
  if(r.combat?.status==='active'||['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))bad('진행 중인 행동을 먼저 마치세요.');
  const entry=find(c.cases,p.id);configureReward(r,entry,p);log(`보상 설정 · ${entry.title} · 1인당 ${entry.reward.won.toLocaleString('ko-KR')}원 · ${entry.reward.cp} CP`);r.messages.at(-1).caseId=entry.id;if(entry.visibility==='gm')r.messages.at(-1).recipient=r.owner;break;
 }
 case 'claimCaseReward':{
  const entry=find(c.cases,p.id);if(entry.status!=='resolved'||!entry.endedAt)bad('플레이를 종료한 케이스만 정산할 수 있습니다.');
  if(r.combat?.status==='active'||['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))bad('진행 중인 행동을 먼저 마치세요.');
  settleCaseReward(r,u,entry);break;
 }
 case 'nextPeriod':{
  if(!c.clock)bad('게임 시작 날짜를 먼저 설정하세요.');
  const hour=Number(c.clock.time.slice(0,2)),next=periods.find(v=>v.hour>hour);
  const minutes=next?next.hour*60-hour*60-Number(c.clock.time.slice(3)):1440-hour*60-Number(c.clock.time.slice(3));
  return chronicleCommand(r,u,'advanceClock',{minutes,reason:text(p.reason||'다음 시간대로 진행',500)});
 }
 case 'finishBeat':{
  const e=find(c.events,p.id);
  if(storyState(e,c)!=='available')bad('시각과 선행 사건을 확인하세요. 기한 초과 사건은 결과를 검토한 뒤 편집하세요.',409);
  if(e.caseId&&e.caseId!==c.activeCaseId)bad('현재 진행 중인 케이스의 사건만 처리할 수 있습니다.');
  if(['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))bad('대기 행동과 판정을 먼저 처리하세요.',409);
  const logStart=r.messages.length;
  if(e.duration)chronicleCommand(r,u,'advanceClock',{minutes:e.duration,reason:e.title});
  e.status='done';log(`사건 완료 · ${e.title}`);
  if(e.visibility==='gm')for(const m of r.messages.slice(logStart)){m.type='whisper';m.recipient=r.owner;}
  break;
 }
 case 'startCase':{
  const x=find(c.cases,p.id);requireAccess(r,x.accessRequirements);
  if(x.visibility!=='public'||x.status!=='open')bad('공개된 진행 중 케이스를 선택하세요.');
  if(c.activeCaseId&&c.activeCaseId!==x.id)bad('현재 케이스를 종료한 뒤 다음 케이스를 시작하세요.');
  if(['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))bad('대기 행동과 GM 처리를 먼저 마치세요.');
  c.activeCaseId=x.id;x.startedAt||=now;x.startClock||=structuredClone(c.clock);log(`케이스 시작 · ${x.title}`);break;
 }
 case 'endCase':{
  if(['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))bad('대기 행동과 GM 처리를 먼저 마치세요.');
  if(r.combat?.status==='active')bad('전투를 먼저 종료하세요.');
  const x=find(c.cases,c.activeCaseId);if(c.events.some(e=>e.caseId===x.id&&e.status==='scheduled'))bad('남아 있는 전개와 마감을 먼저 처리하세요.');settleCaseReward(r,u,x);x.status='resolved';x.recap=text(p.recap||'',4000,true);x.endedAt=now;x.endClock=structuredClone(c.clock);
  log(`케이스 종료 · ${x.title}`);r.messages.at(-1).caseId=x.id;
  // Retain older play-chunk records as legacy history, without creating new chunks.
  const legacy=c.episodes.find(e=>e.id===c.activeEpisodeId);if(legacy){legacy.endedAt=now;legacy.endClock=structuredClone(c.clock);}
  c.activeEpisodeId='';c.activeCaseId='';break;
 }
 case 'setClock':{
  stamp(p.date,p.time);
  const reason=text(p.reason,500);
  if(p.correctStart===true)correctStartingDate(r,p);
  c.clock={date:p.date,time:p.time};log(`게임 시각 설정 · ${p.date} ${p.time} · ${reason}`);break;
 }
 case 'advanceClock':{
  if(!c.clock)bad('게임 시작 날짜를 먼저 설정하세요.');
  if(!Number.isSafeInteger(p.minutes)||p.minutes<1||p.minutes>10080)bad('경과 시간은 1분~7일 사이로 입력하세요.');
  const reason=text(p.reason,500),next=new Date(stamp(c.clock.date,c.clock.time)+p.minutes*60000).toISOString();
  stamp(next.slice(0,10),next.slice(11,16));
  c.clock={date:next.slice(0,10),time:next.slice(11,16)};
  log(`${p.minutes}분 경과 · ${c.clock.date} ${c.clock.time} · ${reason}`);break;
 }
 case 'caseFile':{
  const old=p.id?find(c.cases,p.id):null;
  if(!old&&c.cases.length>=100)bad('케이스는 100개까지 저장할 수 있습니다.');
  if(!['open','resolved','closed'].includes(p.status))bad('케이스 상태를 확인하세요.');
  if(old?.id===c.activeCaseId&&p.visibility==='gm')bad('진행 중인 케이스는 숨길 수 없습니다.');
  const item={id:old?.id||crypto.randomUUID(),title:text(p.title,100),summary:text(p.summary||'',4000,true),status:p.status,visibility:visibility(p.visibility),createdAt:old?.createdAt||now,updatedAt:now};
  if(old)Object.assign(old,item);else c.cases.push(item);
  return {caseId:item.id};
 }
 case 'selectCase':
  if(c.activeEpisodeId)bad('진행 중인 회차를 종료한 뒤 케이스를 바꾸세요.');
  if(p.id&&find(c.cases,p.id).visibility==='gm')bad('진행할 케이스를 먼저 공개하세요.');
  c.activeCaseId=caseId(p.id);break;
 case 'deleteCase':{
  find(c.cases,p.id);
  if(c.activeCaseId===p.id||c.episodes.some(x=>x.caseId===p.id)||c.events.some(x=>x.caseId===p.id)||(r.notes||[]).some(x=>x.caseId===p.id))bad('연결된 회차·일정·기록이 있는 케이스는 삭제 대신 종결하세요.');
  c.cases=c.cases.filter(x=>x.id!==p.id);break;
 }
 case 'calendarEvent':{
  const old=p.id?find(c.events,p.id):null;
  if(!old&&c.events.length>=300)bad('일정은 300개까지 저장할 수 있습니다.');
  stamp(p.date,p.time);
  if(!['scheduled','done','cancelled'].includes(p.status))bad('일정 상태를 확인하세요.');
  const item={id:old?.id||crypto.randomUUID(),caseId:caseId(p.caseId),title:text(p.title,100),description:text(p.description||'',2000,true),date:p.date,time:p.time,status:p.status,visibility:visibility(p.visibility)};
  item.kind=p.kind??old?.kind??'scene';
  if(!['scene','activity','deadline'].includes(item.kind))bad('사건 종류를 확인하세요.');
  item.duration=p.duration??old?.duration??0;
  if(!Number.isSafeInteger(item.duration)||item.duration<0||item.duration>10080)bad('소요 시간은 0~10080분입니다.');
  item.requires=p.requires??old?.requires??[];
  if(!Array.isArray(item.requires)||item.requires.length>20||new Set(item.requires).size!==item.requires.length)bad('선행 사건을 확인하세요.');
  for(const id of item.requires){find(c.events,id);if(id===item.id)bad('자신을 선행 사건으로 지정할 수 없습니다.');}
  const seen=new Set([item.id]),visited=new Set(),walk=id=>{if(seen.has(id))bad('선행 사건이 순환합니다.');if(visited.has(id))return;seen.add(id);for(const v of find(c.events,id).requires||[])walk(v);seen.delete(id);visited.add(id);};
  for(const id of item.requires)walk(id);
  if(old)Object.assign(old,item);else c.events.push(item);
  return {eventId:item.id};
 }
 case 'deleteCalendarEvent':find(c.events,p.id);if(c.events.some(e=>e.requires?.includes(p.id)))bad('다른 사건의 선행 조건입니다. 연결을 먼저 해제하세요.');c.events=c.events.filter(x=>x.id!==p.id);break;
 case 'startEpisode':{
  if(c.activeEpisodeId)bad('이미 진행 중인 회차가 있습니다.');
  if(['queued','running'].includes(r.gmJob?.status)||r.actions.some(x=>x.status!=='resolved'))bad('대기 중인 행동과 GM 처리를 마친 뒤 회차를 시작하세요.');
  if(c.episodes.length>=500)bad('회차 기록 한도에 도달했습니다.');
  const id=caseId(p.caseId);if(!id)bad('진행할 케이스를 선택하세요.');
  if(find(c.cases,id).visibility==='gm')bad('케이스를 먼저 공개하세요.');
  if(find(c.cases,id).status!=='open')bad('진행 중인 케이스에서 회차를 시작하세요.');
  const number=Math.max(0,...c.episodes.map(x=>x.number),Number(r.session?.episode||1)-1)+1;
  const e={id:crypto.randomUUID(),caseId:id,number,title:text(p.title,100),recap:'',startedAt:now,endedAt:'',startClock:structuredClone(c.clock),endClock:null,startMessageId:r.messages.at(-1)?.id||'',endMessageId:''};
  c.episodes.push(e);c.activeEpisodeId=e.id;c.activeCaseId=id;
  r.session={...r.session,episode:number};log(`${number}회차 시작 · ${e.title}`);return {episodeId:e.id};
 }
 case 'endEpisode':{
  if(['queued','running'].includes(r.gmJob?.status)||r.actions.some(x=>x.status!=='resolved'))bad('대기 중인 행동과 GM 처리를 마친 뒤 회차를 종료하세요.');
  const e=find(c.episodes,c.activeEpisodeId);e.recap=text(p.recap||'',4000,true);e.endedAt=now;e.endClock=structuredClone(c.clock);
  log(`${e.number}회차 종료 · ${e.title}`);e.endMessageId=r.messages.at(-1).id;
  c.activeEpisodeId='';r.session={...r.session,episode:e.number,recap:e.recap};break;
 }
 case 'editEpisode':{
  const e=find(c.episodes,p.id);e.title=text(p.title,100);e.recap=text(p.recap||'',4000,true);break;
 }
 }
 return {};
}
