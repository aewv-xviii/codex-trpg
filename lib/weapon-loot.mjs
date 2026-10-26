import {requireLocalAccess} from '../public/play/off-map-state.js';
import {canControl} from '../public/play/character-control.js';
import {sameScene,concealedFrom} from './awareness.mjs';
import {position,yards,visibleLine} from './aquarium-space.mjs';
import {controlFlags,requireControlAction} from './control-state.mjs';
import {freeHands,grips} from './close-combat.mjs';
import {handDisabled} from '../public/play/injury-state.js';
import {advanceGameSeconds} from './conditions.mjs';
import {powerTurn} from './combat.mjs';
import {rebindWeapon,fallbackUnarmed} from './weapon-rebinding.mjs';
import {npcPresentation} from './npc-identity.mjs';
const fail=m=>{throw Error(m);};
const active=r=>r.combat?.status==='active';
const state=(r,c)=>active(r)?r.combat.fighters?.[c.id]||(c.combatState??={status:'active'}):(c.combatState??={status:'active'});
const log=(r,c,text)=>r.messages.push({id:crypto.randomUUID(),type:'system',name:'상황',author:c.owner,text:`${c.name} · ${text}`,at:new Date().toISOString(),gameClock:structuredClone(r.chronicle?.clock)});
function eligible(r,source){const f=state(r,source),flags=controlFlags(source);return ['dead','dying','unconscious'].includes(f.status)||flags.noAction&&flags.noDefense;}
function access(r,c,source,p){
 requireLocalAccess(r,c.id,source.id);
 if(!source.isNPC||source.controllers?.length||r.partyCharacterIds.includes(source.id)||!sameScene(r,c.id,source.id)||concealedFrom(source,c.id))fail('현재 접근 가능한 비조작 NPC의 장비만 회수할 수 있습니다.');
 if(!p.reason?.trim()||p.reason.length>500)fail('장비가 있는 위치와 실제 접근 근거가 필요합니다.');
 const a=position(r,c.id),b=position(r,source.id),f=state(r,source),droppedMain=p.kind==='weapon'&&(!p.weaponId||p.weaponId===source.combatProfile?.weapon.id),spot=droppedMain&&f.lostWeapon||b;
 if(!eligible(r,source)&&!f.lostWeapon)fail('아직 저항할 수 있는 상대입니다. HP 0이나 넘어짐만으로 장비를 빼앗을 수 없습니다.');
 if(a&&spot&&(!visibleLine(r,a,spot)||yards(a,spot)>1.01))fail('무기가 있는 곳의 1야드 안으로 실제 접근해야 합니다.');
 if(active(r)&&(!a||!spot))fail('현재 교전의 실제 회수 위치가 필요합니다.');
 return {f,spot};
}
export function equipmentLootContext(r){return r.characters.filter(c=>c.isNPC&&!c.controllers?.length&&!r.partyCharacterIds.includes(c.id)&&r.partyCharacterIds.some(id=>sameScene(r,id,c.id))).map(c=>({characterId:c.id,incapacitated:eligible(r,c),lostWeapon:state(r,c).lostWeapon||null,weapons:[c.combatProfile?.weapon,...(c.combatLoadout||[]).map(x=>x.weapon)].filter(w=>w&&!w.unarmed).map(w=>({id:w.id||'',name:w.name,loaded:w.ammo,capacity:w.capacity})),magazines:(c.assets?.magazines||[]).map(m=>({id:m.id,weaponName:m.weaponName,rounds:m.rounds})),ammunitionUnspecified:c.npcAmmoPending===true}));}
export function recoverEquipment(r,original,p){
 const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'),c=r.characters.find(c=>c.id===a?.actorId),source=r.characters.find(c=>c.id===p.sourceId);
 if(!a||!original.gmJob.actionIds?.includes(a.id)||original.gmJob.requesterId!==a.author||!canControl(c,{id:a.author})||!r.partyCharacterIds.includes(c.id)||!source||source===c)fail('현재 플레이어 선언과 실제 장비 소유자를 확인하세요.');
 if(!c.assets?.confirmed||!c.combatProfile)fail('회수할 인물의 소지품·기본 전투 시트가 필요합니다.');
 if(c.fp<=0||state(r,c).stunned||['dead','dying','unconscious'].includes(state(r,c).status))fail('장비를 회수할 수 있는 상태가 아닙니다.');
 requireControlAction(c,'ready');const {f}=access(r,c,source,p);
 const index=(source.combatLoadout||[]).findIndex(x=>x.weapon.id===p.weaponId),main=source.combatProfile?.weapon;
 const w=p.kind==='weapon'?(main&&!main.unarmed&&(!p.weaponId||main.id===p.weaponId)?main:index>=0?source.combatLoadout[index].weapon:null):null;
 const mag=p.kind==='magazine'?source.assets?.magazines?.find(m=>m.id===p.magazineId):null;
 if(p.kind==='magazine'&&(!mag||!eligible(r,source)))fail('실제로 가진 예비 탄창과 저항 불가 상태를 확인하세요.');
 if(p.kind==='weapon'&&(!w||w.unarmed))fail('회수할 실제 무기가 없습니다. 이미 가져간 무기는 다시 얻을 수 없습니다.');
 if(!['weapon','magazine'].includes(p.kind))fail('회수할 장비 종류를 확인하세요.');
 if(w!==main&&f.lostWeapon&&!eligible(r,source))fail('떨어진 주 무기 외의 소지품은 빼앗을 수 없습니다.');
 const key=[source.id,p.kind,w?.id,mag?.id].join('|'),cf=state(r,c);
 if(p.equip&&cf.lostWeapon)fail('잃은 현재 무기의 회수를 먼저 정리하거나 새 무기를 equip=false로 보관하세요.');
 const stowing=p.equip&&!c.combatProfile.weapon.unarmed&&!cf.dropped;
 const needed=(cf.prone||['kneeling','crouching','sitting'].includes(cf.posture)?1:2)+(stowing?1:0);
 if(freeHands(r,c)<1&&!(stowing&&c.combatProfile.weaponHand==='both'&&!handDisabled(c,'left')&&!handDisabled(c,'right')&&!grips(r,c.id).length))fail('장비를 회수할 자유로운 손이 필요합니다.');
 if(active(r)){
  powerTurn(r,c.id,true,'ready');
  const progress=cf.equipmentRecovery?.key===key?cf.equipmentRecovery.progress+1:1;
  if(progress<needed){cf.equipmentRecovery={key,progress};a.status='resolved';a.timeCharged=true;log(r,c,`장비 회수 준비 ${progress}/${needed}`);powerTurn(r,c.id,false,'ready');return {complete:false};}
 }
 if(mag){
  c.assets.magazines??=[];if(c.assets.magazines.some(m=>m.id===mag.id))fail('중복 탄창입니다.');c.assets.magazines.push(mag);source.assets.magazines=source.assets.magazines.filter(m=>m.id!==mag.id);if(f.reload?.magazineId===mag.id)delete f.reload;
  log(r,c,`${mag.weaponName} 예비 탄창 회수 · ${mag.rounds}발`);
 }else{
  const existingItem=r.economy?.items?.find(i=>i.id===w.inventoryItemId),id=existingItem?.weaponInstance?w.inventoryItemId:'weapon-'+crypto.randomUUID(),bound=rebindWeapon(c,w,id,{weaponHand:(w===main?source.combatProfile:source.combatLoadout[index]).weaponHand||'right'});
  if(p.equip&&!bound)fail('무기는 회수할 수 있지만 이 무기의 사용자별 사용 수치 연결은 별도 검토가 필요합니다. equip=false로 회수하세요.');
  if(p.equip&&bound.weaponHand==='both'&&(handDisabled(c,'left')||handDisabled(c,'right')||grips(r,c.id).length))fail('양손 무기를 사용하려면 양손을 사용할 수 있어야 합니다.');
  const fallback=w===main?fallbackUnarmed(source):null;
  const known=r.economy?.items?.find(i=>i.id===id);
  if(w.inventoryItemId&&(source.assets?.items?.[w.inventoryItemId]||0)<1)fail('장비에 연결된 실제 소지품이 없습니다.');
  r.economy??={enabled:true,items:[],shops:[],ledger:[]};r.economy.items??=[];
  if(!known)r.economy.items.push({id,name:w.name,kind:'gear',price:0,sellPrice:0,source:'회수한 기존 무기',weaponInstance:true});
  if(w.inventoryItemId){source.assets.items[w.inventoryItemId]--;if(!source.assets.items[w.inventoryItemId])delete source.assets.items[w.inventoryItemId];}
  c.assets.items??={};if(c.assets.items[id])fail('이미 소유한 무기 개체입니다.');c.assets.items[id]=1;
  if(w===main){source.combatProfile.weapon=fallback.weapon;source.combatProfile.parry=fallback.parry;source.combatProfile.weaponHand='right';source.npcAmmoPending=false;delete f.lostWeapon;delete f.disarmed;f.dropped=false;delete f.reload;}
  else source.combatLoadout.splice(index,1);
  if(bound){
   if(bound.weaponHand!=='both')bound.weaponHand=handDisabled(c,'right')?'left':'right';
   if(p.equip){(c.combatLoadout??=[]).push({weapon:c.combatProfile.weapon,parry:c.combatProfile.parry,weaponHand:c.combatProfile.weaponHand});c.combatProfile.weapon=bound.weapon;c.combatProfile.parry=bound.parry;c.combatProfile.weaponHand=bound.weaponHand;cf.dropped=false;delete cf.grip;delete cf.reload;delete cf.switching;}
   else (c.combatLoadout??=[]).push(bound);
  }else (c.unreviewedWeapons??=[]).push({weapon:{...structuredClone(w),id,inventoryItemId:id,catalogWeaponId:w.catalogWeaponId||w.id},sourceId:source.id});
  log(r,c,`${npcPresentation(source).name}의 ${w.name} 회수${w.kind==='firearm'?` · 남은 장탄 ${w.ammo}발`:''}${p.equip?' · 사용 준비':bound?' · 소지품에 보관':' · 사용자별 사용 수치 검토 필요'}`);
 }
 delete cf.equipmentRecovery;a.status='resolved';a.timeCharged=true;
 if(active(r))powerTurn(r,c.id,false,'ready');else advanceGameSeconds(r,needed);
 return {complete:true};
}
