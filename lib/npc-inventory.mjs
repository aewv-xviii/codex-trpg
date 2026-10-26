import {normalizeNPCInventory} from '../public/play/npc-inventory-format.js';
import {scenarioNPCs} from './npc-identity.mjs';
import {sameScene} from './awareness.mjs';
const fail=m=>{throw Error(m);};
export function installNPCInventory(r,c,value){
 const inventory=normalizeNPCInventory(value);
 if(c.npcPossessions)fail('이미 적용한 NPC 소지품은 다시 생성할 수 없습니다.');
 if(!inventory){c.npcPossessions={reviewed:false,locations:{}};return;}
 c.npcPossessions={reviewed:inventory.reviewed,locations:{}};
 if(!inventory.reviewed)return;
 r.economy??={enabled:true,items:[],shops:[],ledger:[]};
 const entries=inventory.items.map(x=>{
  const existing=x.itemId?r.economy.items.find(i=>i.id===x.itemId):null;
  if(x.itemId&&!existing)fail('NPC 소지품이 참조한 물품 ID가 없습니다. 탄약·무기는 기존 카탈로그 ID를 사용하세요.');
  const id=existing?.id||'possession-'+crypto.randomUUID();
  return {id,quantity:x.quantity,location:x.location,item:existing||{id,name:x.name,description:x.description,kind:'gear',price:0,sellPrice:0,narrativeOnly:true,scenarioPossession:true}};
 });
 if(new Set(entries.map(e=>e.id)).size!==entries.length)fail('같은 물품의 수량은 한 항목으로 합쳐 주세요.');
 if(r.economy.items.length+entries.filter(e=>!r.economy.items.some(i=>i.id===e.id)).length>1000)fail('물품 등록 한도입니다.');
 c.assets={...c.assets,confirmed:true,won:inventory.won,items:{}};
 for(const e of entries){if(!r.economy.items.some(i=>i.id===e.id))r.economy.items.push(e.item);c.assets.items[e.id]=e.quantity;c.npcPossessions.locations[e.id]=e.location;}
}
export function possessionContext(r){return scenarioNPCs(r).filter(c=>(c.isNPC||r.cast?.some(x=>x.id===c.id))&&!c.controllers?.length&&!r.partyCharacterIds.includes(c.id)&&r.partyCharacterIds.some(id=>sameScene(r,id,c.id))).map(c=>({characterId:c.id,reviewed:c.npcPossessions?.reviewed??c.assets?.confirmed??false,won:c.assets?.won,items:Object.entries(c.assets?.items||{}).filter(([,n])=>n>0).map(([id,quantity])=>{const i=r.economy?.items.find(i=>i.id===id);return {id,name:i?.name,description:i?.description,quantity,kind:i?.kind,location:c.npcPossessions?.locations?.[id]||'미지정'};}),magazines:c.assets?.magazines||[],work:c.possessionWork||null}));}
export function planPossessionTransfer(r,actor,source,selections){
 if(!r.economy?.enabled||!actor.assets?.confirmed||!source.assets?.confirmed||source.npcPossessions?.reviewed===false)fail('시나리오 소지품 명세와 실제 자산 장부를 먼저 확정해야 합니다. 미작성 소지품은 즉석 생성하지 않습니다.');
 if(!Array.isArray(selections)||selections.length>60)fail('가져올 소지품 목록을 확인하세요.');
 const keys=new Set();
 return selections.map(x=>{
  if(!['item','money','magazine'].includes(x.kind)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>(x.kind==='money'?1e9:99999))fail('소지품 종류와 수량을 확인하세요.');
  const key=x.kind+':'+x.id;if(keys.has(key))fail('중복된 소지품 선택입니다.');keys.add(key);
  if(x.kind==='money'){if(x.id||!Number.isSafeInteger(source.assets.won)||source.assets.won<x.quantity||(actor.assets.won||0)+x.quantity>1e9)fail('실제 현금과 금액 한도를 확인하세요.');return {...x,name:'현금'};}
  if(x.kind==='magazine'){
   const m=source.assets.magazines?.find(m=>m.id===x.id);if(!m||x.quantity!==1||actor.assets.magazines?.some(m=>m.id===x.id))fail('실제 예비 탄창 개체를 선택하세요.');
   return {...x,name:m.weaponName+' 탄창',magazine:m};
  }
  const item=r.economy.items.find(i=>i.id===x.id);
  if(!item||(source.assets.items?.[x.id]||0)<x.quantity||(actor.assets.items?.[x.id]||0)+x.quantity>99999)fail('대상의 실제 보유 물품과 수량을 확인하세요.');
  const weapons=[source.combatProfile?.weapon,...(source.combatLoadout||[]).map(x=>x.weapon),...(source.unreviewedWeapons||[]).map(x=>x.weapon)].filter(Boolean);
  if(item.weaponInstance||weapons.some(w=>w.itemId===x.id||w.inventoryItemId===x.id||w.name===item.name))fail('실제 무기는 recoverEquipment 회수 또는 무장해제 절차를 사용하세요.');
  return {...x,name:item.name};
 });
}
export function transferPossessions(r,actor,source,plan,actionId){
 for(const x of plan){
  if(x.kind==='money'){source.assets.won-=x.quantity;actor.assets.won=(actor.assets.won||0)+x.quantity;}
  else if(x.kind==='magazine'){
   (actor.assets.magazines??=[]).push(x.magazine);source.assets.magazines=source.assets.magazines.filter(m=>m.id!==x.id);
   for(const f of [source.combatState,r.combat?.fighters?.[source.id]])if(f?.reload?.magazineId===x.id)delete f.reload;
  }else{source.assets.items[x.id]-=x.quantity;if(!source.assets.items[x.id])delete source.assets.items[x.id];actor.assets.items??={};actor.assets.items[x.id]=(actor.assets.items[x.id]||0)+x.quantity;}
  r.economy.ledger.push({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'npcPossessionTransfer',actionId,characterId:actor.id,fromId:source.id,itemId:x.id,quantity:x.quantity,wonDelta:x.kind==='money'?x.quantity:0,possessionKind:x.kind});
 }
}
