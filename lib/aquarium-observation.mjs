import {sceneKey,position,visibleLine} from './aquarium-space.mjs';
import {sameScene} from './awareness.mjs';
import {stat,successRoll,addEffect,lifecycleLog} from './conditions.mjs';
const fail=m=>{throw Error(m);};
export function observeAquarium(r,c,p,die){
 if(!c?.aquarium||!p.reason?.trim()||p.reason.length>500)fail('실제 수족관과 관찰 근거가 필요합니다.');
 const target=r.characters.find(t=>t.id===p.targetId);if(!target)fail('실제 관찰자가 필요합니다.');
 const state=r.combat?.status==='active'?r.combat.fighters[target.id]:target.combatState;
 if(['dead','dying','unconscious'].includes(state?.status))fail('의식 없는 관찰자의 목격·불신 판정은 할 수 없습니다.');
 let result;
 if(p.power==='witness'){
  const fish=c.aquarium.fish.find(f=>f.hp>0&&(!p.fishId||f.id===p.fishId)),key=sceneKey(r);
  if(!fish||p.targetSawFish!==true||!sameScene(r,c.id,target.id))fail('같은 장면의 활성 물고기를 직접 알아본 근거가 필요합니다.');
  c.aquarium.witnesses??=[];
  if(c.aquarium.witnesses.some(w=>w.targetId===target.id&&w.scene===key))result={power:p.power,targetId:target.id,alreadyWitnessed:true};
  else{
   const at=position(r,target.id,fish.position?.space);if(at&&fish.position&&!visibleLine(r,at,fish.position))fail('벽·닫힌 문 너머 물고기는 직접 볼 수 없습니다.');
   const will=stat(target,'Will');if(!will)fail('목격자의 Will이 필요합니다.');
   const roll=successRoll(will+(p.knowsAbility===true?2:0),die),duration=roll.success?0:die(6);
   c.aquarium.witnesses.push({targetId:target.id,scene:key});
   if(duration)addEffect(r,target,{key:'fish-distraction',sourceId:c.id,label:'물고기에 주의 분산',kind:'debuff',source:'거짓 수족관 v1.4 · 첫 목격',remainingSeconds:duration,stackGroup:'fish-distraction',modifiers:{concentration:-2,approachDetection:-4}});
   result={power:p.power,targetId:target.id,roll,duration};
  }
 }else if(p.power==='disbelieve'){
  const e=target.effects?.find(e=>e.key==='predator'&&e.sourceId===c.id&&e.remainingSeconds>0);
  if(!e)fail('불신 판정할 활성 포식어 효과가 없습니다.');if(e.disbelieved)fail('이미 환각을 간파한 대상입니다.');
  if(p.contradiction!==true)fail('직접 접촉이나 새로운 강한 모순이 필요합니다.');
  e.disbeliefEvidence??=[];
  if(e.disbeliefEvidence.includes(p.reason.trim())||p.evidenceId&&e.disbeliefEventIds?.includes(p.evidenceId))fail('같은 사건·모순의 불신 판정은 이미 처리했습니다.');
  const will=stat(target,'Will');if(!will)fail('관찰자의 Will이 필요합니다.');
  const roll=successRoll(will,die);e.disbeliefEvidence.push(p.reason.trim());if(p.evidenceId)(e.disbeliefEventIds??=[]).push(p.evidenceId);if(roll.success)e.disbelieved=true;
  result={power:p.power,targetId:target.id,roll,effectId:e.id,remainingSeconds:e.remainingSeconds};
 }else fail('목격·불신 반응만 처리할 수 있습니다.');
 lifecycleLog(r,target,p.power==='witness'?(result.alreadyWitnessed?'이번 장면 목격 기록 사용 · 재굴림 없음':'첫 목격 · '+(result.roll.success?'저항 성공':result.duration+'초 주의 분산')):'환각 불신 '+(result.roll.success?'성공 · 환각 자체는 지속':'실패'),result);return result;
}
export function applyAquariumObservation(r,original,p,die){
 if(!['individual','turn','combat','narration','awareness','dialogue'].includes(original.gmJob?.kind))fail('현재 장면의 GM 관찰 재정이 필요합니다.');
 if(original.gmJob.kind==='combat'&&p.targetId!==original.gmJob.actorId)fail('현재 NPC 차례의 관찰자만 재정하세요.');
 const source=r.characters.find(c=>c.id===p.sourceId);
 if(!source?.fields?.some(f=>f.name==='시트 출처'&&/PC-GYH-001/.test(f.value)))fail('등록된 능력 소유자가 필요합니다.');
 const result=observeAquarium(r,source,{...p,evidenceId:original.gmJob.id},die);
 if(result.alreadyWitnessed&&original.gmJob.kind==='combat')fail('이미 목격한 상태입니다. 재판정 대신 현재 차례의 행동을 선택하세요.');
 return result;
}
