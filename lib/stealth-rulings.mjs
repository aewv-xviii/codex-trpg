import {rulingSource,rulingTarget,rulingRoll,quickContest} from './source-ruling.mjs';
import {advanceGameSeconds,lifecycleLog} from './conditions.mjs';
import {powerTurn,combatMove} from './combat.mjs';
import {canControl} from '../public/play/character-control.js';
import {clearMovement,yards} from '../public/play/exploration-geometry.js';
import {sameScene,actorPosition,refreshStealthEffect} from './awareness.mjs';
import {controlFlags} from './control-state.mjs';
const fail=m=>{throw Error(m);};
const reason=s=>typeof s==='string'&&s.trim()&&s.length<=1000?s.trim():fail('상황과 판정 근거가 필요합니다.');
const person=(r,id)=>r.characters.find(c=>c.id===id)||fail('등록된 인물이 필요합니다.');
const sources=(r,p,proofs)=>{if(!Array.isArray(p.sources)||!p.sources.length||p.sources.length>6)fail('은신·감지 판정의 원문 근거가 필요합니다.');return p.sources.map(x=>rulingSource(r,x,proofs));};
function observers(r,c,list){
 if(!Array.isArray(list)||list.length>30||new Set(list.map(x=>x.characterId)).size!==list.length)fail('관찰자 목록을 확인하세요.');
 return list.map(x=>{const o=person(r,x.characterId);if(o.id===c.id||!sameScene(r,o.id,c.id))fail('같은 장면의 다른 관찰자만 처리하세요.');reason(x.reason);return {...x,person:o};});
}
export function applyStealthAction(r,original,p,proofs,die){
 const c=person(r,p.characterId),a=r.actions.find(x=>x.id===p.actionId),npc=original.gmJob?.kind==='combat'&&original.gmJob.actorId===c.id&&c.isNPC&&!c.controllers?.length;
 if(!npc&&(!a||a.status!=='pending'||a.actorId!==c.id||!original.gmJob?.actionIds?.includes(a.id)||!canControl(c,{id:a.author})))fail('이번 은신 선언의 조작권을 확인하세요.');
 if(!['hide','leave','search'].includes(p.mode))fail('은신 행동을 확인하세요.');
 reason(p.reason);if(controlFlags(c).noAction||['dead','dying','unconscious'].includes(c.combatState?.status))fail('현재 행동할 수 없습니다.');
 const combat=r.combat?.status==='active';if(combat)powerTurn(r,c.id,true,'move');
 const evidence=p.mode==='leave'?[]:sources(r,p,proofs),others=observers(r,c,p.observers||[]);
 if(p.mode==='search'&&others.some(o=>!o.person.stealth?.active))fail('실제 은신 상태인 대상을 수색하세요.');
 const target=p.mode!=='leave'&&!p.automatic?rulingTarget(r,c,p.actor):null;
 const resolved=others.map(o=>({...o,target:o.mode==='contest'?rulingTarget(r,o.person,o.check):null}));
 if(p.automatic&&resolved.some(o=>o.mode==='contest'))fail('대결에는 실제 시전자 판정이 필요합니다.');
 if(resolved.some(o=>!['contest','hidden','exposed'].includes(o.mode)))fail('관찰 결과의 판정 방식을 확인하세요.');
 if(!Number.isInteger(p.seconds)||p.seconds<0||p.seconds>86400)fail('은신 행동 시간을 확인하세요.');
 if(!combat&&p.seconds&&(a?.timeCharged||a?.storyEventId))fail('이미 처리한 이동·사건 시간을 은신 판정에 다시 부과할 수 없습니다. seconds 0으로 관찰만 처리하세요.');
 if(combat&&p.seconds!==1)fail('전투 은신·수색은 현재 차례 1초 단위로 처리하세요.');
 const path=p.path||[];if(!Array.isArray(path)||path.length>40||p.mode!=='hide'&&path.length)fail('은신 이동 경로를 확인하세요.');
 let traveled=0;const m=r.maps?.find(m=>m.id===r.mapId),t=m?.tokens.find(t=>t.characterId===c.id);let previous=t;
 for(const point of path){if(!previous||r.combat?.theater||![point.x,point.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!clearMovement(m,previous,point))fail('벽·닫힌 문을 통과하지 않는 실제 은신 경로가 필요합니다.');traveled+=yards(m,previous,point);previous=point;}
 if(path.length&&traveled>(combat?(c.combatProfile?.move||1):Math.max(1,p.seconds)*(c.combatProfile?.move||1))+.01)fail('이동 거리와 소요 시간을 확인하세요.');
 if(path.length){if(combat){if(path.length!==1)fail('전투 은신 이동은 한 차례의 직선 구간으로 나누세요.');combatMove(r,{id:npc?c.owner:a.author},c.id,path[0].x,path[0].y,true,die);}else Object.assign(t,path.at(-1),{positionReviewed:true});}
 const roll=target?rulingRoll(c,target,die):null,results=[];
 if(p.mode==='leave'){if(c.stealth){c.stealth.active=false;c.stealth.endedReason=p.reason;}refreshStealthEffect(c);}
 else if(p.mode==='hide'){
  const prior=c.stealth;c.stealth={id:prior?.id||crypto.randomUUID(),active:true,reason:p.reason,roll,observers:{...(prior?.observers||{})},path:structuredClone(path),position:actorPosition(r,c.id),reviewedPosition:JSON.stringify(actorPosition(r,c.id))};
  for(const o of resolved){const other=o.target?rulingRoll(o.person,o.target,die):null;const contest=roll&&other?quickContest(roll,other):null;const hidden=o.mode==='hidden'?(roll?.success??true):o.mode==='exposed'?false:contest?.winner==='actor';
   const state=hidden?'hidden':'exposed';c.stealth.observers[o.characterId]={state,reason:o.reason,lastKnown:state==='exposed'?actorPosition(r,c.id):null};results.push({characterId:o.characterId,state,roll:other,contest});}
  if(roll&&!roll.success&&!resolved.length){c.stealth.active=false;c.stealth.endedReason='은신 시도 실패';}
  refreshStealthEffect(c);
 }else{
  for(const o of resolved){const hidden=o.person,other=o.target?rulingRoll(hidden,o.target,die):hidden.stealth.roll,contest=roll&&other?quickContest(roll,other):null;const spotted=o.mode==='exposed'||o.mode==='contest'&&(contest?contest.winner==='actor':roll?.success);
   if(spotted)hidden.stealth.observers[c.id]={state:'exposed',reason:p.reason,lastKnown:actorPosition(r,hidden.id)};refreshStealthEffect(hidden);results.push({characterId:hidden.id,spotted,roll:other,contest});}
 }
 const result={kind:'stealth',mode:p.mode,roll,observers:results,source:evidence,reason:p.reason,path,seconds:p.seconds};
 if(a){a.status='resolved';a.timeCharged=true;a.stateResult=result;}
 lifecycleLog(r,c,p.mode==='leave'?'은신 종료':p.mode==='search'?'수색 판정 완료':'은신 판정 완료',result);
 if(combat)powerTurn(r,c.id,false,'move');else if(p.seconds)advanceGameSeconds(r,p.seconds);
 return result;
}
export function applyAwarenessUpdate(r,original,p,proofs,die){
 const c=person(r,p.characterId);if(!c.stealth?.active)fail('진행 중인 은신이 없습니다.');reason(p.reason);
 if(!['observe','warn','maintain','end'].includes(p.mode))fail('발각 처리 방식을 확인하세요.');
 const list=observers(r,c,p.observers||[]),pending=c.stealth.pending;
 if(p.cueId&&p.cueId!==pending?.id)fail('이미 처리되었거나 오래된 관찰 단서입니다.');
 if(p.mode==='end'){c.stealth.active=false;c.stealth.endedReason=p.reason;}
 else if(p.mode==='warn'){
  const speaker=person(r,p.speakerId),state=r.combat?.status==='active'?r.combat.fighters[speaker.id]:speaker.combatState;
  if(!sameScene(r,c.id,speaker.id)||c.stealth.observers[speaker.id]?.state!=='exposed'||controlFlags(speaker).noSpeech||['dead','dying','unconscious'].includes(state?.status))fail('실제로 발견했고 경고할 수 있는 인물이 필요합니다.');
  for(const o of list){if(c.stealth.observers[o.characterId]?.state==='exposed')continue;c.stealth.observers[o.characterId]={state:'alerted',reason:o.reason,lastKnown:structuredClone(c.stealth.observers[speaker.id].lastKnown),warnedBy:speaker.id};}
 }else if(p.mode==='observe'){
  if(!list.length)fail('관찰자가 필요합니다.');if(list.some(o=>o.mode==='contest'))sources(r,p,proofs);
  const checked=list.map(o=>({...o,target:o.mode==='contest'?rulingTarget(r,o.person,o.check):null}));
  for(const o of checked){const key=(p.cueId||p.reason)+'/'+o.characterId;c.stealth.checks??=[];if(c.stealth.checks.includes(key))fail('같은 단서를 재굴림할 수 없습니다.');
   const roll=o.target?rulingRoll(o.person,o.target,die):null,contest=roll&&c.stealth.roll?quickContest(roll,c.stealth.roll):null;
   const spotted=o.mode==='exposed'||o.mode==='contest'&&(contest?contest.winner==='actor':roll.success);
   if(!['exposed','hidden','contest'].includes(o.mode))fail('관찰 방식을 확인하세요.');
   c.stealth.observers[o.characterId]={state:spotted?'exposed':c.stealth.observers[o.characterId]?.state==='alerted'?'alerted':'hidden',reason:o.reason,lastKnown:spotted?actorPosition(r,c.id):c.stealth.observers[o.characterId]?.lastKnown,roll,contest};c.stealth.checks.push(key);c.stealth.checks=c.stealth.checks.slice(-100);
  }
 }
 if(p.cueId){delete c.stealth.pending;c.stealth.reviewedPosition=JSON.stringify(actorPosition(r,c.id));}
 refreshStealthEffect(c);lifecycleLog(r,c,p.mode==='warn'?'발각 경고 전파':p.mode==='end'?'은신 종료':'발각 여부 확인',{kind:'awareness',mode:p.mode,reason:p.reason});
}
