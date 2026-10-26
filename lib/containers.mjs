import {canControl} from '../public/play/character-control.js';
import {requireScopeIdle} from './play-scope.mjs';
const fail=m=>{throw Error(m);};
const positive=(n,max=100000)=>Number.isFinite(n)&&n>0&&n<=max?n:fail('양수 규격을 입력하세요.');
export function validateContainers(r){
 for(const c of r.characters){
  const assigned={},bags=c.assets?.containers||[];
  for(const b of bags){
   assigned[b.itemId]=(assigned[b.itemId]||0)+1;
   let liters=0,kg=0;
   for(const [id,n] of Object.entries(b.items)){
    const item=r.economy.items.find(i=>i.id===id),p=item?.physical;
    if(!Number.isSafeInteger(n)||n<1||!p||p.container)fail('규격이 확인된 일반 물품만 수납할 수 있습니다.');
    if(p.lengthCm>b.maxLengthCm)fail('물품 길이가 가방 규격을 초과합니다.');
    assigned[id]=(assigned[id]||0)+n;liters+=p.volumeL*n;kg+=p.weightKg*n;
   }
   if(liters>b.capacityL+1e-8||kg>b.maxContentsKg+1e-8)fail('가방의 용량 또는 내용물 무게 한도를 초과합니다.');
  }
  for(const [id,n] of Object.entries(assigned))if(n>(c.assets.items[id]||0))fail('가방 또는 안에 든 물품을 먼저 꺼낸 뒤 이동·소비하세요.');
 }
}
export function containerCommand(r,u,op,p){
 if(!['configureCarrying','configureFood','configureItemPhysical','addContainer','packItem','removeContainer'].includes(op))return null;
 requireScopeIdle(r);
 if(op==='configureCarrying'){
  if(u.id!==r.owner)fail('하중 기준은 방장이 확인합니다.');
  const c=r.characters.find(c=>c.id===p.characterId);if(!c?.combatProfile)fail('전투 수치가 있는 인물을 선택하세요.');
  if(!Number.isSafeInteger(p.basicMove)||!Number.isSafeInteger(p.basicDodge))fail('기본 이동·회피는 정수로 입력하세요.');
  c.carrying={basicLiftKg:positive(p.basicLiftKg),basicMove:positive(p.basicMove),basicDodge:positive(p.basicDodge),extraKg:p.extraKg===0?0:positive(p.extraKg),fallbackMove:c.carrying?.fallbackMove??c.combatProfile.move,fallbackDodge:c.carrying?.fallbackDodge??c.combatProfile.dodge,fallbackEncumbrance:c.carrying?.fallbackEncumbrance??c.combatProfile.encumbrance??0};return {};
 }
 if(op==='configureFood'){
  if(u.id!==r.owner)fail('음식 설정은 방장 권한이 필요합니다.');
  const i=r.economy?.items.find(i=>i.id===p.itemId&&i.kind==='consumable');if(!i)fail('소모품을 선택하세요.');
  if(!Number.isSafeInteger(p.minutes)||p.minutes<1||p.minutes>120)fail('섭취 시간은 1~120분입니다.');
  i.food={minutes:p.minutes};return {};
 }
 if(op==='configureItemPhysical'){
  if(u.id!==r.owner)fail('물품 규격은 방장이 확인합니다.');
  const i=r.economy?.items.find(i=>i.id===p.itemId);if(!i)fail('등록된 물품을 선택하세요.');
  const physical={weightKg:positive(p.weightKg),volumeL:positive(p.volumeL),lengthCm:positive(p.lengthCm)};
  if(p.container)physical.container={capacityL:positive(p.capacityL),maxContentsKg:positive(p.maxContentsKg),maxLengthCm:positive(p.maxLengthCm)};
  for(const c of r.characters)for(const b of c.assets?.containers||[])if(b.itemId===i.id){if(!physical.container)fail('연결된 가방은 가방 규격을 유지해야 합니다.');Object.assign(b,physical.container);}
  i.physical=physical;i.weightKg=physical.weightKg;validateContainers(r);return {};
 }
 const c=r.characters.find(c=>c.id===p.characterId&&canControl(c,u));if(!c?.assets?.confirmed)fail('조작 가능한 인물을 선택하세요.');
 c.assets.containers||=[];
 if(op==='addContainer'){
  const i=r.economy.items.find(i=>i.id===p.itemId),spec=i?.physical?.container;if(!spec)fail('가방 규격을 먼저 등록하세요.');
  if(c.assets.containers.length>=20)fail('가방 한도입니다.');
  const b={id:crypto.randomUUID(),itemId:i.id,name:i.name,...spec,items:{}};c.assets.containers.push(b);validateContainers(r);return {containerId:b.id};
 }
 const b=c.assets.containers.find(b=>b.id===p.containerId);if(!b)fail('가방을 선택하세요.');
 if(op==='removeContainer'){if(Object.keys(b.items).length)fail('가방을 먼저 비우세요.');c.assets.containers=c.assets.containers.filter(x=>x.id!==b.id);return {};}
 if(!Number.isSafeInteger(p.quantity)||p.quantity<0||p.quantity>99999)fail('수납 수량을 확인하세요.');
 if(p.quantity)b.items[p.itemId]=p.quantity;else delete b.items[p.itemId];validateContainers(r);return {};
}
