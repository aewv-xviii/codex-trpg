import {canControl} from '../public/play/character-control.js';
import {selectAttackWeapon} from './combat-weapons.mjs';
import {weaponKey,reloadPlan} from './firearms.mjs';
import {counterattackLevel,counterattackOpportunity} from './counterattack.mjs';
import {controlFlags} from './control-state.mjs';
const fail=m=>{throw Error(m);};
const turn=r=>`${r.combat.id}:${r.combat.round}:${r.combat.index}`;
const active=p=>p&&['queued','paused'].includes(p.status);
export function planCommand(r,u,p){
 const b=r.combat,c=r.characters.find(c=>c.id===p.characterId),f=b?.fighters[c?.id];
 if(b?.status!=='active'||!f||!canControl(c,u))fail('현재 전투의 조작 가능한 인물만 예약할 수 있습니다.');
 if(p.kind==='cancel'){
  if(!active(f.plan))fail('취소할 진행 예약이 없습니다.');
  f.plan.status='cancelled';f.plan.reason='플레이어가 취소했습니다.';return {planId:f.plan.id};
 }
 if(active(f.plan))fail('기존 예약을 취소한 뒤 새 행동을 예약하세요.');
 if(!['reload','counterattack'].includes(p.kind))fail('지원하는 진행 예약을 선택하세요.');
 if(f.status!=='active'||f.stunned)fail('의식과 기절 상태를 확인하세요.');
 let payload;
 if(p.kind==='reload'){
  if(c.heldMagazine)fail('손의 헌 탄창 보관을 먼저 마치세요.');
  const plan=reloadPlan(c,{magazineId:p.magazineId,quantity:p.quantity,reloadMode:p.reloadMode});
  payload={characterId:c.id,action:'reload',magazineId:plan.magazineId,quantity:plan.rounds,reloadMode:plan.reloadMode};
 }else{
  const target=b.fighters[p.targetId];if(!target||target.team===f.team||target.status!=='active')fail('현재 교전의 반격 상대를 선택하세요.');
  const w=selectAttackWeapon(c,p.attackModeId||'');counterattackLevel(c,w);
  payload={characterId:c.id,action:'attack',counterattack:true,targetId:p.targetId,attackModeId:p.attackModeId||'',maneuver:'attack',hitLocation:p.hitLocation||'torso'};
 }
 f.plan={id:crypto.randomUUID(),kind:p.kind,status:'queued',ownerId:u.id,combatId:b.id,weaponKey:weaponKey(c.combatProfile.weapon),payload,createdTurn:turn(r),steps:0,reason:''};
 return {planId:f.plan.id};
}
export function interruptPlan(f,reason){if(active(f?.plan)){f.plan.status='paused';f.plan.reason=reason;}}
export function cancelPlanForManual(f){if(active(f?.plan)){f.plan.status='cancelled';f.plan.reason='새 행동으로 변경했습니다.';}}
// One request never runs ahead of opponents, defenses, or unresolved declarations.
// Failed validation uses a transaction copy, preserving the incoming successful action.
export function advancePlans(r,die,execute){
 if(['queued','running','applying','error'].includes(r.gmJob?.status))return;
 for(let n=0;n<24;n++){
  const b=r.combat;if(b?.status!=='active'||b.pending)return;
  const id=b.order[b.index],f=b.fighters[id],p=f?.plan,c=r.characters.find(c=>c.id===id);
  if(p?.status!=='queued'||p.lastTurn===turn(r))return;
  if(r.actions.some(a=>a.actorId===id&&a.status==='pending')){interruptPlan(f,'새 선언을 GM이 검토해야 합니다.');return;}
  if(!c||!canControl(c,{id:p.ownerId})||p.combatId!==b.id||p.weaponKey!==weaponKey(c.combatProfile.weapon)){interruptPlan(f,'조작권·교전 또는 무기가 변경되었습니다.');return;}
  if(f.status!=='active'||f.stunned||controlFlags(c).stunned){interruptPlan(f,'의식 또는 기절 상태 때문에 중단했습니다.');return;}
  if(p.kind==='counterattack'&&!counterattackOpportunity(r,id,p.payload.targetId)){
   if(p.createdTurn===turn(r))return;
   interruptPlan(f,'직전 방어 성공이 없어 Counterattack을 실행하지 않았습니다.');return;
  }
  const copy=structuredClone(r),next=copy.combat.fighters[id].plan;
  next.lastTurn=turn(r);next.steps++;
  try{
   execute(copy,{id:p.ownerId},'combatAct',structuredClone(p.payload),die,false,true);
   const cf=copy.combat.fighters[id],cc=copy.characters.find(c=>c.id===id);
   if(p.kind==='counterattack'||!cf.reload&&!cc.heldMagazine){cf.plan.status='completed';cf.plan.reason='실행 완료';}
   Object.assign(r,copy);
  }catch(e){interruptPlan(f,e.message);return;}
 }
 const f=r.combat?.fighters[r.combat.order[r.combat.index]];
 interruptPlan(f,'연속 처리 한도에 도달했습니다. 진행 상태를 확인하세요.');
}
