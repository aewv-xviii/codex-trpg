import {addEffect,removeEffect,advanceGameSeconds,lifecycleLog} from './conditions.mjs';
import {rulingSource,rulingTarget,rulingRoll,quickContest} from './source-ruling.mjs';
import {powerTurn} from './combat.mjs';
import {sameScene} from './awareness.mjs';
import {controlFlags} from './control-state.mjs';
import {canControl} from '../public/play/character-control.js';
export function applyControlAction(r,original,p,proofs,die){
 const fail=m=>{throw Error(m);},actor=r.characters.find(c=>c.id===p.characterId),profile=actor?.controlProfiles?.[p.profileId],target=r.characters.find(c=>c.id===p.targetId),a=r.actions.find(a=>a.id===p.actionId&&a.actorId===p.characterId&&a.status==='pending');
 const npc=original.gmJob?.kind==='combat'&&original.gmJob.actorId===actor?.id&&actor.isNPC&&!actor.controllers?.length;
 if(!npc&&(!a||!original.gmJob?.actionIds?.includes(a.id)||!canControl(actor,{id:a.author})))fail('이번 선언의 조작권이 필요합니다.');
 if(!target||!profile||actor.fields?.find(f=>f.name===profile.field)?.value!==profile.fieldValue)fail('현재 구매·등록된 상태 능력이 필요합니다. 환각으로 미구매 CC를 부여할 수 없습니다.');
 if(!sameScene(r,actor.id,target.id)||typeof p.reason!=='string'||!p.reason.trim()||controlFlags(actor).noAction)fail('실제 대상·발동 조건과 행동 가능 여부를 확인하세요.');
 const state=r.combat?.status==='active'?r.combat.fighters[actor.id]:actor.combatState;if(state?.stunned||['dead','dying','unconscious'].includes(state?.status))fail('행동할 수 없는 상태입니다.');
 const combat=r.combat?.status==='active';if(combat){if(profile.activationSeconds!==1)fail('장시간 발동은 차례별 절차가 필요합니다.');powerTurn(r,actor.id,true);}
 const source={kind:'source',documentId:profile.documentId,quote:profile.quote};rulingSource(r,source,proofs);
 if(p.release){const e=target.effects?.find(e=>e.controlProfile===profile.id&&e.sourceId===actor.id);if(!e)fail('해제할 상태가 없습니다.');removeEffect(r,target,e.id,p.reason);}
 else{
  if(actor.fp<profile.costFP)fail('FP가 부족합니다.');
  const at=profile.procedure==='resistedContest'?rulingTarget(r,actor,p.actor):null,dt=rulingTarget(r,target,p.opponent);
  const attack=at?rulingRoll(actor,at,die):null,defense=!attack||attack.success?rulingRoll(target,dt,die):null,contest=attack&&defense?quickContest(attack,defense):null;
  const success=profile.procedure==='resistance'?!defense.success:attack.success&&contest?.winner==='actor';actor.fp-=profile.costFP;
  const result={kind:'control',targetId:target.id,profileId:profile.id,attack,defense,contest,success,source,reason:p.reason};
  if(success)addEffect(r,target,{key:'control:'+profile.effect,control:profile.effect,controlProfile:profile.id,sourceId:actor.id,label:{stun:'초능력 기절',paralysis:'마비',immobilized:'이동 봉쇄'}[profile.effect],kind:'debuff',source:profile.reason,remainingSeconds:profile.seconds+(combat?1:profile.activationSeconds),description:profile.effect==='immobilized'?'이동 제한 · 다른 행동은 상황에 따라 가능':'행동 제한 · 기간 만료 또는 등록된 회복 판정으로 해제',...(profile.effect==='stun'?{modifiers:{defense:-4},stackGroup:'control:stun'}:{}),recoveryField:profile.recoveryField,recoveryModifier:profile.recoveryModifier,recoveryDelay:combat?1:profile.activationSeconds});
  if(a)a.stateResult=result;lifecycleLog(r,target,success?'상태 능력 적용':'상태 능력 저항/발동 실패',result);
 }
 if(a){a.status='resolved';a.timeCharged=true;a.stateResult??={kind:'control',release:true,reason:p.reason};}
 if(combat)powerTurn(r,actor.id);else advanceGameSeconds(r,profile.activationSeconds);
}
