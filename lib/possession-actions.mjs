import {requireLocalAccess} from '../public/play/off-map-state.js';
import {requireScenarioNPC} from './npc-identity.mjs';
import {handDisabled} from '../public/play/injury-state.js';
import {canControl} from '../public/play/character-control.js';
import {sameScene,concealedFrom} from './awareness.mjs';
import {position,yards,visibleLine} from './aquarium-space.mjs';
import {controlFlags,requireControlAction} from './control-state.mjs';
import {freeHands} from './close-combat.mjs';
import {powerTurn} from './combat.mjs';
import {advanceGameSeconds,lifecycleLog} from './conditions.mjs';
import {rulingSource,rulingTarget,rulingRoll,quickContest} from './source-ruling.mjs';
import {planPossessionTransfer,transferPossessions} from './npc-inventory.mjs';
const fail=m=>{throw Error(m);};
const reason=v=>typeof v==='string'&&v.trim()&&v.length<=1000?v.trim():fail('접근·판정·시간의 상황 근거가 필요합니다.');
const state=(r,c)=>r.combat?.status==='active'?r.combat.fighters?.[c.id]||c.combatState||{}:c.combatState||{};
export function applyPossessionAction(r,original,p,proofs,die){
 const a=r.actions.find(a=>a.id===p.actionId),actor=r.characters.find(c=>c.id===a?.actorId),source=[...r.characters,...(r.cast||[])].find(c=>c.id===p.sourceId);
 if(!['individual','turn'].includes(original.gmJob?.kind)||!a||a.status!=='pending'||!original.actions.some(x=>x.id===a.id&&x.status==='pending')||!original.gmJob.actionIds?.includes(a.id)||original.gmJob.requesterId!==a.author||!actor||!canControl(actor,{id:a.author})||!r.partyCharacterIds.includes(actor.id))fail('현재 선언과 조작 권한을 확인하세요.');
 if(a.mapIntent||a.worldDestination||a.timeCharged||a.storyEventId)fail('이동·사건과 별개의 미처리 소지품 행동이 필요합니다.');
 if(!source||source===actor||!source.isNPC||source.controllers?.length||r.partyCharacterIds.includes(source.id)||!sameScene(r,actor.id,source.id)||concealedFrom(source,actor.id))fail('현재 접근 가능한 실제 NPC를 지정하세요.');
 if(!['search','loot','pickpocket'].includes(p.mode)||!['helpless','consent','covert'].includes(p.access)||typeof p.automatic!=='boolean')fail('수색·회수·소매치기 방식을 확인하세요.');
 requireScenarioNPC(r,source.id);reason(p.reason);
 const f=state(r,source),cf=state(r,actor),flags=controlFlags(source),combat=r.combat?.status==='active';
 if(['dead','dying','unconscious'].includes(cf.status)||cf.stunned)fail('현재 소지품을 다룰 수 없는 상태입니다.');requireControlAction(actor,'ready');
 if((actor.combatProfile?freeHands(r,actor):['left','right'].filter(h=>!handDisabled(actor,h)).length)<1)fail('소지품을 다룰 자유로운 손이 필요합니다.');
 if(p.access==='helpless'&&!(['dead','dying','unconscious'].includes(f.status)||flags.noAction&&flags.noDefense))fail('HP 0·넘어짐만으로 저항 불가가 되지는 않습니다. 동의 또는 소매치기 판정이 필요합니다.');
 if(p.mode==='pickpocket'&&(p.automatic||p.access!=='covert')||p.access==='covert'&&p.automatic||p.mode==='loot'&&p.access==='covert')fail('몰래 가져오는 행동에는 실제 소매치기 판정이 필요합니다.');
 requireLocalAccess(r,actor.id,source.id);const from=position(r,actor.id),to=position(r,source.id);
 if(from&&to&&(!visibleLine(r,from,to)||yards(from,to)>1.01)||combat&&(!from||!to))fail('대상의 소지품에 닿을 수 있는 실제 위치로 접근하세요.');
 if(!Number.isSafeInteger(p.seconds)||p.seconds<1||p.seconds>86400||!r.chronicle?.clock)fail('근거 있는 소요 시간(1초 이상)과 게임 날짜가 필요합니다.');
 const plan=planPossessionTransfer(r,actor,source,p.selections);
 if(p.mode!=='search'&&!plan.length)fail('가져올 실제 물품 또는 현금을 선택하세요.');
 if(!Array.isArray(p.sources)||p.sources.length>6||!p.automatic&&!p.sources.length)fail('판정에는 룰북 원문 근거가 필요합니다.');
 const sources=p.sources.map(s=>rulingSource(r,s,proofs));
 const target=p.automatic?null:rulingTarget(r,actor,p.actor);
 if(!['none','contest'].includes(p.victimMode)||p.automatic&&p.victimMode!=='none')fail('피해자의 경계 여부에 맞는 대결 방식을 선택하세요.');
 if(p.victimMode==='contest'&&['dead','dying','unconscious'].includes(f.status))fail('의식 없는 대상과 경계 대결을 할 수 없습니다.');
 const victimTarget=p.victimMode==='contest'?rulingTarget(r,source,p.victim):null;
 if(!Array.isArray(p.observers)||p.observers.length>30||new Set(p.observers.map(x=>x.characterId)).size!==p.observers.length)fail('목격자 목록을 확인하세요.');
 const observers=p.observers.map(o=>{
  const c=[...r.characters,...(r.cast||[])].find(c=>c.id===o.characterId);reason(o.reason);
  if(!c||c===actor||c===source||!sameScene(r,actor.id,c.id)||!['contest','noticed','unaware'].includes(o.mode)||p.automatic&&o.mode==='contest')fail('실제 목격자와 관찰 방식을 확인하세요.');
  if(o.mode!=='unaware'&&['dead','dying','unconscious'].includes(state(r,c).status))fail('의식 없는 인물은 목격자가 될 수 없습니다.');
  return {...o,c,target:o.mode==='contest'?rulingTarget(r,c,o.check):null};
 });
 if(combat)powerTurn(r,actor.id,true,'ready');
 // Each submitted declaration spends one turn; no speculative roll or transfer
 // before the last Ready. A changed plan/target restarts work, never clones loot.
 const key=JSON.stringify({...p,actionId:undefined,reason:undefined,sources:undefined});
 if(combat){
  const progress=actor.possessionWork?.key===key?actor.possessionWork.progress+1:1;
  if(progress<p.seconds){actor.possessionWork={key,sourceId:source.id,progress,seconds:p.seconds};a.status='resolved';a.timeCharged=true;a.possessionResult={complete:false,mode:p.mode,sourceId:source.id,progress,seconds:p.seconds};lifecycleLog(r,actor,`소지품 작업 ${progress}/${p.seconds}초`,{kind:'possession',complete:false,progress,seconds:p.seconds});powerTurn(r,actor.id,false,'ready');return a.possessionResult;}
 }
 const roll=target?rulingRoll(actor,target,die):null,victimRoll=victimTarget?rulingRoll(source,victimTarget,die):null,contest=victimRoll?quickContest(roll,victimRoll):null;
 const success=p.automatic||(contest?contest.winner==='actor':roll.success);
 const observed=observers.map(o=>{const other=o.target?rulingRoll(o.c,o.target,die):null,comparison=other?quickContest(roll,other):null;return {characterId:o.characterId,roll:other,contest:comparison,notice:o.mode==='noticed'?'noticed':o.mode==='unaware'?'unnoticed':comparison.winner==='opponent'?'noticed':comparison.winner==='actor'?'unnoticed':'uncertain',reason:o.reason};});
 if(success&&p.mode!=='search')transferPossessions(r,actor,source,plan,a.id);
 const result={complete:true,needsNarration:!p.automatic||p.mode==='search'||observers.length>0,mode:p.mode,sourceId:source.id,success,roll,victimRoll,contest,observers:observed,victimNotice:contest?(contest.winner==='actor'?'unnoticed':'unresolved'):'unresolved',sources,reason:p.reason,seconds:p.seconds,transferred:success&&p.mode!=='search',possessions:success?plan.map(({kind,id,name,quantity,magazine})=>({kind,id,name,quantity,...(magazine?{rounds:magazine.rounds,ammoItemId:magazine.ammoItemId}:{})})):[]};
 a.status='resolved';a.timeCharged=true;a.possessionResult=result;delete actor.possessionWork;
 if(roll){const record={id:crypto.randomUUID(),actionId:a.id,author:a.author,name:actor.name,...roll,success,formula:'3d6',resolution:'gurps4',comparator:'lte',scope:p.mode,source:sources.join('\n'),victimRoll,contest,observers:observed,at:new Date().toISOString()};r.rolls.push(record);a.resolutionId=record.id;}
 if(combat)powerTurn(r,actor.id,false,'ready');else advanceGameSeconds(r,p.seconds);
 lifecycleLog(r,actor,`${p.mode==='search'?'소지품 수색':p.mode==='pickpocket'?'소매치기':'소지품 회수'} · ${success?'성공':'실패'}${success&&plan.length?' · '+plan.map(x=>x.name+' × '+x.quantity).join(', '):''}`,{kind:'possession',mode:p.mode,success,transferred:result.transferred});
 return result;
}
