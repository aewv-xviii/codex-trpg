import {position,yards,visibleLine,fishPath,pathLength} from './aquarium-space.mjs';
import {lifecycleLog} from './conditions.mjs';
import {locationOf} from '../public/play/item-view.js';

const fail=m=>{throw Error(m);};
const nearby=(r,a,b)=>yards(a,b)<=1&&visibleLine(r,a,b);
function receipt(r,c,kind,details){
 const entry={id:crypto.randomUUID(),kind,characterId:c.id,quantity:1,at:new Date().toISOString(),...details};
 (r.economy.ledger??=[]).push(entry);lifecycleLog(r,c,'유영어 운반 · '+kind,entry);return entry;
}
export function dropFishCargo(r,c,fish,reason){
 if(!fish.cargo)return null;
 const cargo=fish.cargo;
 const ground={id:crypto.randomUUID(),itemId:cargo.itemId,quantity:1,ownerId:cargo.ownerId,placeId:cargo.placeId||'',mapId:fish.position?.space?.startsWith('map:')?fish.position.space.slice(4):r.combat?.mapId||r.mapId,position:structuredClone(fish.position),reason};
 (r.groundItems??=[]).push(ground);delete fish.cargo;
 receipt(r,c,'내려놓음',{fishId:fish.id,itemId:cargo.itemId,groundId:ground.id,position:ground.position,reason});return ground;
}
export function deliverFishCargo(r,c,fish,targetId){
 if(!fish.cargo)return;
 const target=r.characters.find(x=>x.id===targetId&&r.partyCharacterIds.includes(x.id)&&x.assets?.confirmed);
 const cargo=fish.cargo;
 if(!target||locationOf(r,target.id)!==cargo.placeId||!nearby(r,fish.position,position(r,target.id,fish.position?.space))||(target.assets.items[cargo.itemId]||0)>=99999){
  const ground=dropFishCargo(r,c,fish,'수령인이 도착 위치에 없거나 받을 수 없어 현장에 내려놓음');return {delivered:false,itemId:cargo.itemId,groundId:ground.id};
 }
 target.assets.items[cargo.itemId]=(target.assets.items[cargo.itemId]||0)+1;delete fish.cargo;
 receipt(r,c,'전달 완료',{fishId:fish.id,itemId:cargo.itemId,targetId});
 return {delivered:true,itemId:cargo.itemId,targetId};
}
// The GM adjudicates grip, handling time and an unknown item's weight; the
// server owns custody, the purchased limit and every physical transfer.
export function carryFish(r,c,fish,p,actionId,scene){
 const spec=p.cargo;if(!spec||!['owner','ground','carried'].includes(spec.from))fail('운반할 물건의 현재 보관 위치가 필요합니다.');
 if(fish.mission||fish.reportReady)fail('진행 중인 물고기 임무·보고를 먼저 마치거나 귀환시키세요.');
 if(!fish.position)fail('물고기의 실제 위치가 필요합니다.');
 const item=r.economy?.items?.find(i=>i.id===spec.itemId);if(!item)fail('실제로 등록된 물품만 운반할 수 있습니다.');
 if(!Number.isFinite(spec.weightLb)||spec.weightLb<0||spec.weightLb>.8||spec.graspable!==true)fail('입에 안전하게 물 수 있는 물건 한 개, 최대 0.8lb만 운반합니다.');
 if(Number.isFinite(item.weightLb)&&item.weightLb!==spec.weightLb)fail('등록된 물품 무게와 운반 근거가 다릅니다.');
 if(!Number.isInteger(spec.handlingSeconds)||spec.handlingSeconds<1||spec.handlingSeconds>60)fail('물건을 물고 내려놓는 데 필요한 시간을 재정하세요.');
 const target=spec.targetId?r.characters.find(x=>x.id===spec.targetId&&r.partyCharacterIds.includes(x.id)&&x.assets?.confirmed):null;
 if(spec.targetId&&!target)fail('물건을 받을 실제 일행이 필요합니다.');
 const path=fishPath(r,fish,p.path),end=path.at(-1);
 if(target&&(locationOf(r,target.id)!==locationOf(r,c.id)||!nearby(r,end,position(r,target.id,end.space))))fail('수령인에게 도착하는 실제 경로가 필요합니다.');
 if(spec.from==='carried'){
  if(fish.cargo?.itemId!==item.id)fail('물고기가 현재 물고 있는 물건이 아닙니다.');
 }else{
  if(fish.cargo)fail('물고기는 한 번에 물건 하나만 운반합니다.');
  if(spec.from==='owner'){
   if(!c.assets?.confirmed||!(c.assets.items[item.id]>0)||!nearby(r,fish.position,position(r,c.id,fish.position.space)))fail('주인 곁에서 실제 소지품을 건네야 합니다.');
   const weapons=[c.combatProfile?.weapon,...(c.combatLoadout||[]).map(x=>x.weapon)].filter(Boolean);
   const reserved=weapons.filter(w=>w.itemId===item.id||w.inventoryItemId===item.id||w.name===item.name||w.name?.startsWith(item.name+' ·')).length;
   if(c.assets.items[item.id]<=reserved)fail('현재 장비에 연결된 물건은 먼저 장비에서 분리해야 합니다.');
   c.assets.items[item.id]--;if(!c.assets.items[item.id])delete c.assets.items[item.id];
  }else{
   const ground=r.groundItems?.find(g=>g.id===spec.groundId&&g.itemId===item.id&&g.quantity>0&&g.ownerId===c.id);
   if(!ground||ground.placeId!==locationOf(r,c.id)||ground.mapId!==r.mapId)fail('현재 장소에 실제로 놓인 자신의 물건만 집을 수 있습니다. 사람의 손·주머니 절도는 별도 구매가 필요합니다.');
   const at=ground.position||{space:fish.position.space,...spec.pickupPosition};
   if(!Number.isFinite(at.x)||!Number.isFinite(at.y)||!nearby(r,fish.position,at))fail('물건이 놓인 실제 위치까지 먼저 이동해야 합니다.');
   ground.quantity--;
  }
  fish.cargo={itemId:item.id,name:item.name,weightLb:spec.weightLb,ownerId:c.id,placeId:locationOf(r,c.id),reason:p.reason};
  receipt(r,c,'물품 인계',{actionId,fishId:fish.id,itemId:item.id,from:spec.from});
 }
 delete fish.blocked;delete fish.lost;
 const travel=Math.ceil(pathLength(path)/fish.move),totalSeconds=travel+spec.handlingSeconds;
 fish.mission={actionId,scene,caseId:r.chronicle.activeCaseId||'',kind:'carryFish',path,travel,investigation:0,elapsed:0,totalSeconds,handlingSeconds:spec.handlingSeconds,targetId:spec.targetId||'',area:p.reason};
 return {power:'carryFish',fishId:fish.id,itemId:item.id,seconds:totalSeconds,delivered:false};
}
