import {canControl} from '../public/play/character-control.js';
import {handDisabled,legDisabled,weaponDisabled} from '../public/play/injury-state.js';
import {postures,postureOf,setPosture} from './combat-options.mjs';
import {validateWeapon,selectAttackWeapon} from './combat-weapons.mjs';
import {advanceGameSeconds} from './conditions.mjs';

export const peaceActions=new Set(['ready','stand','posture','grip','switchWeapon']);
const fail=message=>{throw Error(message);};
function ownedWeapon(r,c,w,requestedId=''){
 if(!w||w.unarmed)fail('준비할 무기를 확인하세요.');
 if(!r.economy?.enabled)return;
 if(!c.assets?.confirmed)fail('시작 자산을 먼저 확정하세요.');
 const id=w.inventoryItemId||w.itemId;
 const matches=id?r.economy.items.filter(i=>i.id===id):r.economy.items.filter(i=>i.kind==='gear'&&(w.name===i.name||w.name?.startsWith(i.name+' ·')));
 if(matches.length!==1||!(c.assets.items[matches[0].id]>0))fail('실제로 휴대한 무기를 선택하세요. 잃거나 투척한 무기는 먼저 회수하세요.');
 if(requestedId&&matches[0].id!==requestedId)fail('현재 장비와 다른 무기입니다. 등록된 예비 무기로 전환하세요.');
}
// Only a declaration validated by the server adapter can scope a preparation lock.
// Direct controls retain the global lock; another actor's pending work is preserved.
export function preparationBlocked(r,actorId,declaration){
 const scoped=declaration&&r.actions.includes(declaration)&&declaration.actorId===actorId&&declaration.status==='resolved'&&(declaration.inventoryHandled||declaration.preparationHandled);
 return ['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'&&(!scoped||a.actorId===actorId));
}
// Shared by direct controls and GM declarations. Never starts combat or rolls dice.
export function peaceAction(r,u,p,declaration=null){
 if(r.combat?.status==='active'||!peaceActions.has(p.action))fail('지원하지 않는 평시 준비 행동입니다.');
 const c=r.characters.find(c=>c.id===p.characterId);
 if(!c||!canControl(c,u)||!r.partyCharacterIds.includes(c.id))fail('이 캐릭터의 조작 권한이 없습니다.');
 if(preparationBlocked(r,c.id,declaration))fail('진행 중인 행동을 먼저 마치세요.');
 const f=c.combatState??={status:'active',dropped:false};
 if(f.status&&f.status!=='active'||f.stunned||c.fp<=0)fail('현재 의식·기절·피로 상태에서는 준비할 수 없습니다.');
 let seconds=1,label;
 if(p.action==='stand'||p.action==='posture'){
  const to=p.action==='stand'?'standing':p.posture,from=postureOf(f);
  if(!Object.hasOwn(postures,to))fail('자세를 확인하세요.');
  if(['standing','crouching'].includes(to)&&legDisabled(c))fail('다리·발 부상으로 지지 없이 설 수 없습니다.');
  seconds=from===to?0:['prone','supine'].includes(from)&&to==='standing'?2:1;
  setPosture(f,to);label=postures[to].label;
 }else{
  const profile=c.combatProfile;if(!profile||c.statsPending)fail('검토된 무기 자료가 필요합니다.');
  if(f.lostWeapon||f.disarmed)fail('잃은 무기는 위치와 접근을 확인하고 먼저 회수하세요.');
  if(p.action==='switchWeapon'){
   const index=(c.combatLoadout||[]).findIndex(x=>x.weapon.id===p.weaponId);
   if(index<0)fail('등록된 예비 무기를 선택하세요.');
   const selected=c.combatLoadout[index],weapon={...validateWeapon(selected.weapon),...(selected.weapon.insertedMagazine?{insertedMagazine:structuredClone(selected.weapon.insertedMagazine)}:{})},hand=selected.weaponHand||'right';
   ownedWeapon(r,c,weapon);if(weaponDisabled({...c,combatProfile:{...profile,weaponHand:hand}})||handDisabled(c,profile.weaponHand||'right'))fail('사용 가능한 손을 확인하세요.');
   c.combatLoadout[index]={weapon:profile.weapon,parry:profile.parry,weaponHand:profile.weaponHand};
   profile.weapon=weapon;profile.parry=selected.parry;profile.weaponHand=hand;
   delete f.grip;f.dropped=false;seconds=2;label=weapon.name+' 전환';
  }else{
   ownedWeapon(r,c,profile.weapon,p.itemId);if(weaponDisabled(c))fail('사용 가능한 손과 무기를 확인하세요.');
   if(p.action==='grip'){
    if(f.dropped||!selectAttackWeapon(c).reverseGrip||!['normal','reverse'].includes(p.grip))fail('준비된 역수 가능 무기와 그립을 선택하세요.');
    seconds=(f.grip||'normal')===p.grip?0:1;f.grip=p.grip;label=p.grip==='reverse'?'역수로 잡기':'정수로 잡기';
   }else{f.dropped=false;label=profile.weapon.name+' 꺼내 들기';}
  }
  delete f.switching;delete f.weaponRecovery;
 }
 advanceGameSeconds(r,seconds);
 r.messages.push({id:crypto.randomUUID(),type:'system',name:'상황',author:u.id,text:`${c.name} · ${label} · ${seconds}초`,at:new Date().toISOString(),gameClock:structuredClone(r.chronicle.clock),caseId:r.chronicle.activeCaseId});
 return {seconds};
}
