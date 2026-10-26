import {canControl} from '../public/play/character-control.js';
import {controlFlags} from './control-state.mjs';
import {powerTurn,combatCommand} from './combat.mjs';
import {applySourceRuling,rulingSource} from './source-ruling.mjs';
import {applyAbilityPlan} from './ability-plan.mjs';
import {applyInventoryDeclaration} from './inventory-actions.mjs';
import {applyCombatDeclaration} from './combat-declarations.mjs';
import {careAction,advanceGameSeconds,syncConditions,lifecycleLog,withElapsedCredit,successRoll,stat} from './conditions.mjs';
const fail=m=>{throw Error(m);};
const active=t=>t&&['queued','paused'].includes(t.status);
const stamp=r=>`${r.combat?.id}:${r.combat?.round}:${r.combat?.index}`;
const where=(r,c)=>JSON.stringify([r.chronicle.activeCaseId,r.mapId,r.combat?.status==='active'?r.combat.theater?.positions[c.id]:null,r.worldLibrary?.characterPlaces?.[c.id]||r.worldLibrary?.placeId||r.mapId,c.offMapPosition||null,r.maps.flatMap(m=>m.tokens.filter(t=>t.characterId===c.id).map(t=>[m.id,t.x,t.y]))]);
const allowed=['sourceRuling','abilityPlan','careAction','inventoryAction','combatAction'];
export function scheduleActivity(r,original,p,proofs=[]){
 const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'&&original.gmJob?.actionIds?.includes(a.id)),c=r.characters.find(c=>c.id===a?.actorId);
 if(!a||!c||!canControl(c,{id:a.author}))fail('본인의 미처리 행동 선언이 필요합니다.');
 if(active(c.activity)||['queued','paused'].includes(r.combat?.fighters[c.id]?.plan?.status))fail('기존 진행 예약을 취소하거나 마친 뒤 예약하세요.');
 if(!p.label?.trim()||p.label.length>100||!Array.isArray(p.steps)||p.steps.length<1||p.steps.length>24)fail('작업 이름과 단계 1~24개가 필요합니다.');
 if(!['pause','restart','concentrate'].includes(p.interruptPolicy))fail('중단 시 진행 보존·재시작·집중 판정을 정하세요.');
 if(!p.sources?.length)fail('소요 시간과 진행 절차의 원문 근거가 필요합니다.');p.sources.forEach(s=>rulingSource(r,s,proofs));
 for(const s of p.steps){
  if(!allowed.includes(s.op)||!s.payload||!Number.isInteger(s.seconds)||s.seconds<1||s.seconds>86400||!['ready','concentrate'].includes(s.maneuver))fail('실제 실행 단계와 소요 시간을 확인하세요.');
  if(s.op==='abilityPlan'&&(s.payload.waitForReports||s.payload.steps?.some(x=>x.kind==='awaitReports')))fail('귀환 보고 대기는 완료 단계와 분리하세요.');
  if(s.op==='careAction'&&s.seconds!==60)fail('기본 지혈은 60초 작업입니다. 다른 처치는 원문 재정으로 구성하세요.');
  if(s.op==='sourceRuling'&&(![0,s.seconds].includes(s.payload.seconds)||s.payload.transfer?.fromId))fail('완료 판정의 시간은 0 또는 단계 시간으로 지정하세요. 물품 이전은 전용 처리로 수행하세요.');
 }
 c.activity={id:crypto.randomUUID(),actionId:a.id,ownerId:a.author,label:p.label,interruptPolicy:p.interruptPolicy,steps:structuredClone(p.steps),sources:structuredClone(p.sources),proofs:structuredClone(proofs),index:0,progress:0,status:'queued',hp:c.hp,where:where(r,c),reason:'',receipts:[]};
 a.status='resolved';a.activityId=c.activity.id;a.reason='진행 예약 등록';return {activityId:c.activity.id};
}
export function activityCommand(r,u,op,p){
 if(op!=='activityControl')return null;
 const c=r.characters.find(c=>c.id===p.characterId),t=c?.activity;if(!c||!canControl(c,u)||!active(t))fail('본인의 진행 중 작업이 필요합니다.');
 if(p.mode==='cancel'){t.status='cancelled';t.reason='사용자가 취소';return {};}
 if(p.mode!=='resume'||t.status!=='paused'||!p.reason?.trim())fail('중단 사유를 확인하고 재개 근거를 입력하세요.');
 if(t.where!==where(r,c))fail('원래 작업 장소로 돌아가거나 새 계획을 세우세요.');
 t.status='queued';t.reason=p.reason;t.hp=c.hp;return {};
}
function complete(r,c,t,s,die){
 const savedJob=r.gmJob,root=r.actions.find(a=>a.id===t.actionId);if(!root)fail('원래 선언이 없습니다.');
 const a={id:crypto.randomUUID(),actorId:c.id,author:t.ownerId,text:root.text,scope:'individual',status:'pending',activityStep:t.id+':'+t.index};r.actions.push(a);
 const job={id:crypto.randomUUID(),kind:'individual',status:'applying',actorId:c.id,requesterId:t.ownerId,actionIds:[a.id]};r.gmJob=job;const original=structuredClone(r),p={...structuredClone(s.payload),actionId:a.id};
 try{
  if(s.op==='sourceRuling')applySourceRuling(r,original,{...p,seconds:r.combat?.status==='active'?1:0},t.proofs,die);
  if(s.op==='abilityPlan')applyAbilityPlan(r,original,p,t.proofs,die);
  if(s.op==='careAction')careAction(r,original,p,die,{scheduled:true});
  if(s.op==='inventoryAction')applyInventoryDeclaration(r,original,p,die);
  if(s.op==='combatAction')applyCombatDeclaration(r,original,p,die);
  if(a.status!=='resolved')fail('완료 단계가 미처리 상태입니다.');
  t.receipts.push({index:t.index,actionId:a.id,op:s.op,seconds:s.seconds});t.index++;t.progress=0;
  if(t.index===t.steps.length){t.status='completed';t.reason='모든 단계 완료';lifecycleLog(r,c,t.label+' 완료',{activityId:t.id});}
 }finally{r.gmJob=savedJob;}
}
export function advanceActivities(r,die,depth=0){
 if(depth>=24)return;
 if(['queued','running','applying','error'].includes(r.gmJob?.status))return;
 const combat=r.combat?.status==='active';if(combat&&r.combat.pending)return;
 const ids=combat?[r.combat.order[r.combat.index]]:r.characters.filter(c=>c.activity?.status==='queued').map(c=>c.id);
 for(const id of ids){
  const c=r.characters.find(c=>c.id===id),t=c?.activity;if(t?.status!=='queued'||combat&&t.lastTurn===stamp(r))continue;
  const f=combat?r.combat.fighters[id]:c.combatState;
  if(c.hp<t.hp||t.disrupted){
   delete t.disrupted;t.hp=c.hp;
   if(t.interruptPolicy==='concentrate'){const will=stat(c,'Will');if(!will){t.status='paused';t.reason='집중 유지 Will 능력치 필요';continue;}const roll=successRoll(will-3,die);lifecycleLog(r,c,'집중 유지 '+(roll.success?'성공':'실패'),{activityId:t.id,roll});if(!roll.success){t.progress=0;t.status='paused';t.reason='집중 실패 · 현재 단계 처음부터 재개';continue;}}
   else {if(t.interruptPolicy==='restart')t.progress=0;t.status='paused';t.reason='피해·방어로 중단';continue;}
  }
  const reason=!canControl(c,{id:t.ownerId})?'조작 권한 변경':t.where!==where(r,c)?'작업 장소 변경':c.hp<t.hp?'피해로 중단':f?.stunned||['dead','unconscious','dying'].includes(f?.status)||controlFlags(c).noAction?'행동 불가':r.actions.some(a=>a.actorId===id&&a.status==='pending')?'새 선언 검토 필요':'';
  if(reason){t.status='paused';t.reason=reason;continue;}
  const copy=structuredClone(r),cc=copy.characters.find(c=>c.id===id),tt=cc.activity,s=tt.steps[tt.index];tt.lastTurn=stamp(copy);
  try{
   if(combat){powerTurn(copy,id,true);if(tt.progress+1<s.seconds){powerTurn(copy,id,false,s.maneuver);tt.progress++;}else{const before=stamp(copy);complete(copy,cc,tt,s,die);if(copy.combat?.status==='active'&&before===stamp(copy))powerTurn(copy,id,false,s.maneuver);}}
   else {
    while(tt.progress<s.seconds){const delta=Math.min(60,s.seconds-tt.progress);advanceGameSeconds(copy,delta);tt.progress+=delta;syncConditions(copy,die);if(cc.hp<tt.hp||['dead','unconscious','dying'].includes(cc.combatState?.status)){tt.status='paused';tt.reason='작업 중 피해·의식 변화';break;}}
    if(tt.status==='queued'){
     const finished=structuredClone(copy),fc=finished.characters.find(c=>c.id===id);
     try{withElapsedCredit(finished,s.seconds,()=>complete(finished,fc,fc.activity,s,die));Object.assign(copy,finished);}
     catch(e){tt.status='paused';tt.reason=e.message;}
    }
   }
   syncConditions(copy,die);copy.characters.find(c=>c.id===id).activity.hp=copy.characters.find(c=>c.id===id).hp;Object.assign(r,copy);
  }catch(e){t.status='paused';t.reason=e.message;}
 }
 if(!combat&&r.characters.some(c=>c.activity?.status==='queued'))advanceActivities(r,die,depth+1);
}
