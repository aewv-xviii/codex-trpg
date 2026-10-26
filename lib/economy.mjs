import {requireAccess} from './factions.mjs';
import {requireLocalAccess} from '../public/play/off-map-state.js';
import {reloadPlan,completeReload,weaponKey,fillMagazine,emptyMagazine} from './firearms.mjs';
import {cartridgeKey} from '../public/play/ammo-compatibility.js';
import {advanceGameSeconds} from './conditions.mjs';
import {dropMagazine} from './magazine-ground.mjs';
import {setEquipmentAlias} from './equipment-alias.mjs';
import {configureKnife} from './knife-equipment.mjs';
import {selectAttackWeapon} from './combat-weapons.mjs';
import {stamp,chronicleCommand} from './chronicle.mjs';
import {canControl} from '../public/play/character-control.js';
const fail=(m,status=400)=>{throw Object.assign(Error(m),{status});};
const int=(n,min=0,max=1e12)=>Number.isSafeInteger(n)&&n>=min&&n<=max?n:fail('금액과 수량은 허용 범위의 정수여야 합니다.');
const text=(s,max=200)=>typeof s==='string'&&s.trim()&&s.length<=max?s.trim():fail('이름과 사유를 확인하세요.');
export const starterItems=[
 {id:'water',name:'생수',kind:'consumable',price:1000,sellPrice:200},
 {id:'meal',name:'간편 식사',kind:'consumable',price:5000,sellPrice:1000},
 {id:'bandage',name:'붕대',kind:'consumable',price:3000,sellPrice:600},
 {id:'flashlight',name:'손전등',kind:'gear',price:15000,sellPrice:6000},
 {id:'ammo-standard',name:'캠페인 표준 탄약 · 1발',kind:'ammo',price:1000,sellPrice:300}
];
export function economy(r){
 r.economy||={version:1,currency:'KRW',enabled:false,items:structuredClone(starterItems),shops:[],ledger:[],visit:null};
 for(const c of r.characters)c.assets||={confirmed:false,won:0,items:{}};
 return r.economy;
}
function idle(r){if(r.combat?.status==='active'||['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))fail('전투·대기 행동·GM 처리를 먼저 마치세요.',409);}
function actor(r,u,id){const c=r.characters.find(c=>c.id===id);if(!c||!canControl(c,u))fail('이 캐릭터의 조작 권한이 없습니다.',403);if(!r.partyCharacterIds.includes(id))fail('현재 파티 캐릭터를 선택하세요.');if(!c.assets.confirmed)fail('시작 자산을 먼저 확정하세요.');return c;}
const item=(e,id)=>e.items.find(x=>x.id===id)||fail('등록된 물품이 아닙니다.');
function count(c,id,delta,storage='carried'){if(!['carried','home'].includes(storage))fail('보관 위치를 확인하세요.');const items=storage==='home'?(c.assets.storedItems||={}):c.assets.items;const next=int((items[id]||0)+delta,0,99999);if(next)items[id]=next;else delete items[id];}
export function record(r,u,kind,description,details={}){
 const e=economy(r);if(e.ledger.length>=5000)fail('거래 기록 한도에 도달했습니다. 내보내기 후 새 캠페인을 준비하세요.');
 const entry={id:crypto.randomUUID(),kind,description,actorId:u.id,caseId:r.chronicle.activeCaseId||'',gameClock:structuredClone(r.chronicle.clock),at:new Date().toISOString(),...details};e.ledger.push(entry);
 const hidden=r.chronicle.cases.some(x=>x.id===entry.caseId&&x.visibility==='gm');
 r.messages.push({id:entry.id,type:'system',name:'거래 기록',author:u.id,text:description,caseId:entry.caseId,gameClock:entry.gameClock,at:entry.at,...(hidden?{recipient:r.owner}:{})});return entry;
}
function chargeTime(r,minutes,reason){if(!r.chronicle.clock)fail('게임 시작 시각이 필요합니다.');if(minutes){chronicleCommand(r,{id:r.owner,name:'시간'},'advanceClock',{minutes,reason});if(r.chronicle.cases.some(x=>x.id===r.chronicle.activeCaseId&&x.visibility==='gm'))r.messages.at(-1).recipient=r.owner;}}
export function recordAmmoUse(r,u,c,quantity=1){record(r,u,'shot',`${c.name} · 탄약 ${quantity}발 사용 · 장전 ${c.combatProfile.weapon.ammo}발`,{characterId:c.id,quantity,loaded:c.combatProfile.weapon.ammo});}
export function recordEconomyRestore(r,u,checkpointId){record(r,u,'restore','복구 지점의 소지금·물품·탄약·상점 재고를 함께 복원했습니다.',{checkpointId});}
export function spendTravel(r,u,characterId,amount,details){
 const c=actor(r,u,characterId);int(amount);if(c.assets.won<amount)fail('이동 비용을 낼 소지금이 부족합니다.');c.assets.won-=amount;
 record(r,u,'travel',`${c.name} · 이동 비용 ${amount.toLocaleString('ko-KR')}원 · ${details.minutes}분`,{characterId,wonDelta:-amount,balance:c.assets.won,...details});
}
export function openAt(shop,clock){if(shop.schedule){if(!clock.date)return false;const day=new Date(stamp(clock.date,clock.time)).getUTCDay(),slot=shop.schedule[day];if(!slot)return false;return slot.open<=clock.time&&clock.time<slot.close;}const hh=Number(clock.time.slice(0,2));return shop.openHour===shop.closeHour||shop.openHour<shop.closeHour?shop.openHour===shop.closeHour||hh>=shop.openHour&&hh<shop.closeHour:hh>=shop.openHour||hh<shop.closeHour;}
function visitShop(r,id){const e=economy(r),s=e.shops.find(s=>s.id===id&&s.enabled);if(!s)fail('이용할 수 없는 상점입니다.');return s;}
function shopping(r,id,character){requireLocalAccess(r,character?.id);
 const s=visitShop(r,id),v=r.economy.visits?.[character?.id]||r.economy.visit,clock=r.chronicle.clock;
 if(s.worldLibraryId&&s.placeId!==(r.worldLibrary?.characterPlaces?.[character?.id]||r.worldLibrary?.placeId))fail('현재 장소의 상점만 이용할 수 있습니다.');
 if(!clock||!v||v.shopId!==id||v.caseId!==(r.chronicle.activeCaseId||'')||(!s.worldLibraryId&&v.mapId!==r.mapId)||stamp(clock.date,clock.time)<v.arrivedAt||stamp(clock.date,clock.time)>=v.expiresAt)fail('먼저 상점을 방문하세요.');
 const end=new Date(stamp(clock.date,clock.time)+60000).toISOString();
 if(!openAt(s,clock)||!openAt(s,{date:end.slice(0,10),time:end.slice(11,16)}))fail('영업시간이 아닙니다.');return s;
}
export function economyCommand(r,u,op,p){
 if(!['setEquipmentAlias','configureKnifeEquipment','confirmStartingAssets','economySetup','economyItem','economyShop','initializeAssets','adjustAssets','visitShop','leaveShop','buyItem','sellItem','useItem','reloadWeapon','unloadWeapon','prepareMagazine','unpackMagazine'].includes(op))return null;
 const e=economy(r),host=()=>{if(r.owner!==u.id)fail('방장 권한이 필요합니다.',403);};idle(r);
 if(op==='setEquipmentAlias'){host();if(!e.enabled)fail('캠페인 경제를 먼저 설정하세요.');const result=setEquipmentAlias(r,p);record(r,u,'alias',`${r.characters.find(c=>c.id===result.characterId).name} · ${result.before} → ${result.name} · 장비 별칭 설정`,result);return result;}
 if(op==='configureKnifeEquipment'){host();if(!e.enabled)fail('캠페인 경제를 먼저 설정하세요.');const reason=text(p.reason,500),result=configureKnife(r,p);record(r,u,'equipment',`${r.characters.find(c=>c.id===result.characterId).name} · ${result.before.name} ×${result.before.quantity} → ${result.name} ×${result.quantity} (대형 나이프) · ${reason}`,result);return result;}
 if(op==='confirmStartingAssets'){
  host();if(!Array.isArray(p.characters)||!p.characters.length||p.characters.length>4||new Set(p.characters.map(x=>x.characterId)).size!==p.characters.length)fail('시작 자산을 확정할 파티원을 확인하세요.');
  for(const x of p.characters)if(!r.partyCharacterIds.includes(x.characterId)||!r.characters.some(c=>c.id===x.characterId&&!c.assets.confirmed))fail('아직 자산을 확정하지 않은 파티원만 선택하세요.');
  if(!e.enabled)economyCommand(r,u,'economySetup',{});
  for(const x of p.characters)economyCommand(r,u,'initializeAssets',{characterId:x.characterId,won:x.won,items:x.items,reason:'시작 준비에서 확인'});
  return {};
 }
 if(op==='economySetup'){

  host();if(e.enabled)fail('이미 경제가 설정되어 있습니다.');e.enabled=true;
  e.shops=[{id:crypto.randomUUID(),name:'동네 편의점',enabled:true,mapId:r.mapId,npcId:'',openHour:0,closeHour:0,travelMinutes:10,visitMinutes:5,cash:100000,offers:starterItems.filter(i=>i.kind!=='ammo').map(i=>({itemId:i.id,price:i.price,sellPrice:i.sellPrice,stock:10}))}];
  record(r,u,'setup','원화 경제 시작 · 가격·재고는 캠페인 설정값');return {};
 }
 if(!e.enabled)fail('캠페인 경제를 먼저 설정하세요.');
 if(op==='economyItem'){
  host();let i=p.id?e.items.find(i=>i.id===p.id):null;if(p.id&&!i)fail('물품을 찾을 수 없습니다.');if(!['gear','consumable','ammo'].includes(p.kind))fail('물품 분류를 확인하세요.');
  if(p.ballisticType!==undefined&&(!['standard','ap','hp','aphc'].includes(p.ballisticType)||p.kind!=='ammo'))fail('탄도 유형을 확인하세요.');
  const cartridge=p.cartridge===undefined?i?.cartridge||'':cartridgeKey(p.cartridge);
  if(cartridge.length>60||cartridge&&!/^[a-z0-9.×x+/_-]+$/.test(cartridge))fail('탄약 규격은 9x19mm, 5.56x45mm처럼 입력하세요.');
  if(i?.cartridge&&cartridge!==i.cartridge)fail('기존 탄약 규격은 변경할 수 없습니다. 별도 물품을 등록하세요.');
  if(i&&p.ballisticType!==undefined&&p.ballisticType!==(i.ballisticType||'standard'))fail('기존 탄종의 탄도는 바꿀 수 없습니다. 별도 물품을 등록하세요.');
  if(i&&i.kind!==p.kind)fail('기존 물품의 분류는 변경할 수 없습니다.');
  if(!i){if(e.items.length>=200)fail('물품 한도입니다.');i={id:crypto.randomUUID()};e.items.push(i);}Object.assign(i,{name:text(p.name,80),kind:p.kind,...(p.kind==='ammo'?{cartridge,ballisticType:p.ballisticType||i.ballisticType||'standard'}:{})});record(r,u,'catalog',`물품 등록·수정 · ${i.name}`);return {itemId:i.id};
 }
 if(op==='economyShop'){
  if(e.shops.some(s=>s.id===p.id&&s.worldLibraryId))fail('세계 자료의 상점은 자료를 통해 관리하세요.');
  host();let s=p.id?e.shops.find(s=>s.id===p.id):null;if(p.id&&!s)fail('상점을 찾을 수 없습니다.');
  if(!r.maps.some(m=>m.id===p.mapId))fail('상점 지도를 선택하세요.');if(p.npcId&&!(r.cast||[]).some(c=>c.id===p.npcId))fail('등록된 대화 상대를 선택하세요.');
  if(!Array.isArray(p.offers)||p.offers.length>100||new Set(p.offers.map(o=>o.itemId)).size!==p.offers.length)fail('판매 목록을 확인하세요.');
  const offers=p.offers.map(o=>{item(e,o.itemId);const price=int(o.price,1,1e9),sellPrice=int(o.sellPrice,0,price);return {itemId:o.itemId,price,sellPrice,stock:int(o.stock,0,99999),...(s?.offers.find(old=>old.itemId===o.itemId)?.accessRequirements?{accessRequirements:structuredClone(s.offers.find(old=>old.itemId===o.itemId).accessRequirements)}:{})};});
  if(!s){if(e.shops.length>=30)fail('상점 한도입니다.');s={id:crypto.randomUUID()};e.shops.push(s);}
  Object.assign(s,{name:text(p.name,80),enabled:p.enabled===true,mapId:p.mapId,npcId:p.npcId||'',openHour:int(p.openHour,0,23),closeHour:int(p.closeHour,0,23),travelMinutes:int(p.travelMinutes,1,1440),visitMinutes:int(p.visitMinutes,1,120),cash:int(p.cash),offers});
  e.visit=null;record(r,u,'shop',`상점 설정·재고 변경 · ${s.name} · ${text(p.reason,500)}`);return {shopId:s.id};
 }
 if(['initializeAssets','adjustAssets'].includes(op)){
  host();const c=r.characters.find(c=>c.id===p.characterId);if(!c)fail('캐릭터를 찾을 수 없습니다.');const reason=text(p.reason,500);
  if(op==='initializeAssets'){
   if(c.assets.confirmed)fail('시작 자산은 한 번만 확정합니다. 정정을 사용하세요.');
   c.assets.won=int(p.won);if(!Array.isArray(p.items)||p.items.length>200)fail('시작 물품을 확인하세요.');
   for(const x of p.items){item(e,x.itemId);count(c,x.itemId,int(x.quantity,1,99999));}
   const stored=p.storedItems??[];if(!Array.isArray(stored)||stored.length>200)fail('보관 물품을 확인하세요.');
   for(const x of stored){item(e,x.itemId);count(c,x.itemId,int(x.quantity,1,99999),'home');}
   c.assets.prepaidWon=int(p.prepaidWon??0);c.assets.confirmed=true;
   record(r,u,'initial',`${c.name} 시작 자산 확정 · ${c.assets.won.toLocaleString('ko-KR')}원 · ${reason}`,{characterId:c.id,won:c.assets.won,items:structuredClone(c.assets.items),storedItems:structuredClone(c.assets.storedItems||{}),prepaidWon:c.assets.prepaidWon,loadedAmmo:c.combatProfile?.weapon.ammo||0});
  }else{
   if(!c.assets.confirmed)fail('시작 자산을 먼저 확정하세요.');const delta=int(p.wonDelta,-1e12,1e12);c.assets.won=int(c.assets.won+delta);
   const prepaidDelta=int(p.prepaidDelta??0,-1e12,1e12);c.assets.prepaidWon=int((c.assets.prepaidWon||0)+prepaidDelta);
   if(p.itemId){item(e,p.itemId);count(c,p.itemId,int(p.quantityDelta,-99999,99999),p.storage??'carried');}
   record(r,u,'adjust',`${c.name} 자산 정정 · ${reason}`,{characterId:c.id,wonDelta:delta,prepaidDelta,storage:p.storage??'carried',itemId:p.itemId||'',quantityDelta:p.itemId?p.quantityDelta:0});
  }return {};
 }
 if(op==='visitShop'){
  host();const s=visitShop(r,p.shopId);if(s.worldLibraryId)fail('장소에서 상점으로 들어가세요.');if(!r.chronicle.clock)fail('게임 시각을 먼저 설정하세요.');
  const minutes=s.travelMinutes+s.visitMinutes,start=structuredClone(r.chronicle.clock),end=new Date(stamp(start.date,start.time)+minutes*60000).toISOString();
  if(p.expectedMinutes!==undefined&&p.expectedMinutes!==minutes)fail('이동 시간이 변경되었습니다. 다시 확인하세요.',409);
  const targetMap=r.maps.find(m=>m.id===s.mapId);if(!targetMap)fail('상점 지도를 확인하세요.');
  if(targetMap.tokens.length+r.partyCharacterIds.filter(id=>!targetMap.tokens.some(t=>t.characterId===id)).length>40)fail('도착 지도에 파티 토큰을 놓을 공간이 없습니다.');
  if(!openAt(s,{date:end.slice(0,10),time:end.slice(11,16)}))fail('도착 시각에는 영업하지 않습니다.');
  chargeTime(r,minutes,`${s.name} 이동·방문`);r.mapId=s.mapId;const m=r.maps.find(m=>m.id===s.mapId);r.scene.title=s.name;r.scene.background=m.image;
  for(const [index,id] of r.partyCharacterIds.entries())if(!m.tokens.some(t=>t.characterId===id)){const c=r.characters.find(c=>c.id===id);m.tokens.push({id:crypto.randomUUID(),characterId:id,name:c.name,x:.25+index*.15,y:.8,hidden:false});}
  const arrivedAt=stamp(r.chronicle.clock.date,r.chronicle.clock.time);e.visit={shopId:s.id,caseId:r.chronicle.activeCaseId||'',mapId:r.mapId,arrivedAt,expiresAt:arrivedAt+60*60000};
  record(r,u,'visit',`${s.name} 방문 · ${minutes}분 소모`,{shopId:s.id,fromClock:start,minutes});return {};
 }
 if(op==='leaveShop'){
  const ids=r.characters.filter(c=>canControl(c,u)).map(c=>c.id);
  if(u.id===r.owner){e.visit=null;e.visits={};}else{e.visits||={};for(const id of ids)e.visits[id]={left:true};}
  record(r,u,'leave','상점 방문 종료');return {};
 }
 if(op==='prepareMagazine')host();
 const c=op==='prepareMagazine'?r.characters.find(c=>c.id===p.characterId&&c.assets?.confirmed&&r.partyCharacterIds.includes(c.id)):actor(r,u,p.characterId);
 if(!c)fail('자산이 확정된 파티원을 선택하세요.');
 if(op==='unpackMagazine'){
  const m=c.assets.magazines?.find(m=>m.id===p.magazineId);if(!m)fail('준비된 탄창을 찾을 수 없습니다.');
  const result=emptyMagazine(c,m.id);count(c,m.itemId,1);c.assets.magazines=c.assets.magazines.filter(x=>x.id!==m.id);
  advanceGameSeconds(r,result.seconds);record(r,u,'magazine',`${c.name} · 예비 탄창 비움 · ${result.rounds}발 회수`,{characterId:c.id,magazineId:m.id,quantity:result.rounds});return {};
 }
 const quantity=int(p.quantity,1,99999);
 if(op==='prepareMagazine'){
  host();const w=c.combatProfile?.weapon;if(!w||w.kind!=='firearm')fail('등록된 총기가 필요합니다.');
  const mode=selectAttackWeapon(c),gear=item(e,p.itemId),ammo=item(e,w.ammoItemId);
  if(gear.kind!=='gear'||ammo.kind!=='ammo'||!['magazine','individual'].includes(mode.reloadStyle)||!(mode.magazineCapacity||w.capacity)||!w.capacity)fail('확인된 탄창 규격과 탄종이 필요합니다.');
  if(quantity>(mode.magazineCapacity||w.capacity)||quantity>w.capacity)fail('탄창 용량을 초과합니다.');
  if((c.assets.magazines?.length||0)>=30)fail('예비 탄창 한도입니다.');
  const why=text(p.reason,500);
  if(mode.reloadStyle==='individual'&&!['swingOut','breakOpen'].includes(w.reloadMechanism))fail('이 리볼버는 스피드로더를 지원하지 않습니다.');
  const spec={weaponKey:weaponKey(w),weaponName:w.name,ammoItemId:ammo.id,...(ammo.cartridge?{cartridge:ammo.cartridge}:{}),capacity:mode.magazineCapacity||w.capacity,kind:mode.reloadStyle==='individual'?'speedloader':'magazine'};
  if(gear.magazineSpec&&(gear.magazineSpec.weaponKey!==spec.weaponKey||gear.magazineSpec.capacity!==spec.capacity||gear.magazineSpec.kind!==spec.kind))fail('이 물품은 다른 탄창 규격으로 연결되어 있습니다.');
  gear.magazineSpec||=spec;w.magazineItemId=gear.id;
  const result=fillMagazine(r,c,{itemId:gear.id,quantity,ammoItemId:ammo.id});
  advanceGameSeconds(r,result.seconds);record(r,u,'magazine',`${c.name} · ${gear.name}에 ${quantity}발 준비 · ${why}`,{characterId:c.id,magazineId:result.magazineId,quantity});return {magazineId:result.magazineId};
 }

 if(op==='buyItem'||op==='sellItem'){
  const s=shopping(r,p.shopId,c),i=item(e,p.itemId),o=s.offers.find(o=>o.itemId===i.id);if(!o)fail('이 상점이 취급하지 않는 물품입니다.');if(op==='buyItem')requireAccess(r,o.accessRequirements);const buying=op==='buyItem',amount=int((buying?o.price:o.sellPrice)*quantity);
  if(p.expectedUnitPrice!==(buying?o.price:o.sellPrice))fail('가격이 변경되었습니다. 현재 가격을 다시 확인하세요.',409);
  if(buying){if(o.stock<quantity)fail('상점 재고가 부족합니다.');if(c.assets.won<amount)fail('소지금이 부족합니다.');c.assets.won-=amount;s.cash=int(s.cash+amount);o.stock-=quantity;count(c,i.id,quantity);}
  else{if(!o.sellPrice)fail('매입하지 않는 물품입니다.');if(s.cash<amount)fail('상점의 매입 자금이 부족합니다.');count(c,i.id,-quantity);c.assets.won=int(c.assets.won+amount);s.cash-=amount;o.stock=int(o.stock+quantity,0,99999);}
  chargeTime(r,1,`${s.name} ${buying?'구매':'판매'}`);
  record(r,u,buying?'buy':'sell',`${c.name} · ${s.name} · ${i.name} ×${quantity} ${buying?'구매':'판매'} · ${amount.toLocaleString('ko-KR')}원`,{characterId:c.id,shopId:s.id,itemId:i.id,quantity,unitPrice:buying?o.price:o.sellPrice,wonDelta:buying?-amount:amount,balance:c.assets.won});return {};
 }
 if(op==='useItem'){
  const i=item(e,p.itemId);if(i.food)fail('음식은 식사 행동으로 섭취하세요.');if(i.kind!=='consumable')fail('직접 소비할 수 없는 물품입니다.');const reason=text(p.reason,500);count(c,i.id,-quantity);
  record(r,u,'use',`${c.name} · ${i.name} ×${quantity} 사용 · ${reason}`,{characterId:c.id,itemId:i.id,quantity});return {};
 }
 const w=c.combatProfile?.weapon;if(!w||w.kind==='melee'||!w.ammoItemId||item(e,w.ammoItemId).kind!=='ammo')fail('방장이 무기의 탄종과 장탄수를 먼저 연결해야 합니다.');
 if(op==='reloadWeapon'){
  if(p.reloadMode&&p.reloadMode!=='retain')fail('인벤토리 재장전은 탄창 보관 방식만 지원합니다.');
  if(c.heldMagazine)fail('손의 헌 탄창 보관을 먼저 마치세요.');
  const plan=reloadPlan(c,{quantity,magazineId:p.magazineId||'',reloadMode:p.reloadMode}),result=completeReload(c,plan);if(plan.reloadMode==='drop')dropMagazine(r,c,result.removedMagazine);advanceGameSeconds(r,plan.seconds);record(r,u,'ammo',`${c.name} · 재장전 ${plan.rounds}발`,{characterId:c.id,quantity:plan.rounds,loaded:w.ammo});return {};
 }else{if(w.ammo<quantity)fail('장전된 탄약이 부족합니다.');w.ammo-=quantity;count(c,w.ammoItemId,quantity);}
 chargeTime(r,1,op==='reloadWeapon'?'탄약 장전':'탄약 회수');record(r,u,'ammo',`${c.name} · ${op==='reloadWeapon'?'장전':'탄약 회수'} ${quantity}발 · 장전 ${w.ammo}발`,{characterId:c.id,quantity,loaded:w.ammo});return {};
}
