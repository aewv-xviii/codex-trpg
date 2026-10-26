// Basic Set B373-375. Ordinary single-projectile rapid fire; not shotgun pellets.
import {ammoFits,magazineCompatible} from '../public/play/ammo-compatibility.js';
const fail=m=>{throw Error(m);};
// Hydrate only explicit catalog specifications. Legacy IDs stay isolated, never infer from names.
export function syncAmmoSpecs(r){
 const items=r.economy?.items||[],link=x=>{const a=items.find(i=>i.id===x?.ammoItemId);if(x&&!x.cartridge&&a?.cartridge)x.cartridge=a.cartridge;};
 for(const c of r.characters||[]){link(c.combatProfile?.weapon);for(const l of c.combatLoadout||[])link(l.weapon);for(const m of c.assets?.magazines||[])link(m);link(c.heldMagazine);link(c.combatProfile?.weapon?.insertedMagazine);}
 for(const i of items)link(i.magazineSpec);for(const g of r.groundMagazines||[])link(g.magazine);
}
export function rapidFireBonus(shots){
 if(shots<=4)return 0;if(shots<=8)return 1;if(shots<=12)return 2;if(shots<=16)return 3;
 if(shots<=24)return 4;if(shots<=49)return 5;return 6+Math.floor(Math.log2(shots/50));
}
export function firingPlan(w,requested=1){
 if(!Number.isInteger(requested)||requested<1||requested>100)fail('발사 수는 1~100발의 정수여야 합니다.');
 if(w.kind!=='firearm'){if(requested!==1)fail('여러 발 사격은 총기만 지원합니다.');return {shots:1,bonus:0};}
 if(requested>(w.rof??1))fail('등록된 연사율을 초과합니다. RoF를 확인하세요.');
 if(requested>w.ammo)fail('장전된 탄약이 부족합니다.');
 if(requested>1&&!Number.isInteger(w.recoil))fail('연사에는 확인된 반동(Rcl)이 필요합니다.');
 if(w.minimumBurst&&requested<Math.min(w.minimumBurst,w.ammo))fail('이 무기의 최소 점사 수를 확인하세요.');
 return {shots:requested,bonus:rapidFireBonus(requested)};
}
export function bulletHits(roll,shots,recoil){return roll.success?Math.min(shots,1+Math.floor(Math.max(0,roll.margin)/(recoil||1))):0;}
export function dodgedHits(total,target,hits){
 if(total===3||total===4||total===5&&target>=15||total===6&&target>=16)return hits;
 if(total>=17||total>target&&total>4)return 0;
 return Math.min(hits,1+Math.max(0,target-total));
}
// Only a confirmed, already filled spare magazine can use the weapon's listed reload time.
export function reloadMagazine(c,magazineId){
 const w=c.combatProfile.weapon,m=c.assets?.magazines?.find(m=>m.id===magazineId);
 if(!m||!magazineFits(w,m)||m.rounds<1)fail('이 총에 맞는 준비된 예비 탄창을 선택하세요.');
 return m;
}
export const weaponKey=w=>w.catalogWeaponId||w.id||w.name;
export const magazineFits=magazineCompatible;
export function completeMagazineReload(c,m,{removeOnly=false}={}){
 const w=c.combatProfile.weapon,oldAmmo=w.ammoItemId,oldChamber=w.capacity>(w.magazineCapacity||w.capacity)&&w.ammo>0?1:0,changing=oldAmmo!==m.ammoItemId,chamber=changing?0:oldChamber,remaining=w.ammo-oldChamber;
 if(m.rounds+chamber>w.capacity)fail('장탄수를 초과합니다.');
 c.assets.magazines=c.assets.magazines.filter(x=>x.id!==m.id);
 // Keep the removed magazine and its actual remaining rounds; never refill it.
 const removed=w.insertedMagazine||{...m,ammoItemId:oldAmmo,id:crypto.randomUUID()};
 const removedMagazine={...removed,rounds:remaining,capacity:w.magazineCapacity||w.capacity,weaponKey:weaponKey(w)};
 if(!removeOnly){
  if(remaining||w.insertedMagazine)(c.assets.magazines||=[]).push(removedMagazine);
  else{c.assets.items??={};c.assets.items[m.itemId]=(c.assets.items[m.itemId]||0)+1;}
 }
 w.insertedMagazine={...m,capacity:w.magazineCapacity||w.capacity,weaponKey:weaponKey(w)};delete w.insertedMagazine.rounds;
 // Variant changes explicitly recover the old chamber round; never relabel it as new ammunition.
 if(changing&&oldChamber){c.assets.items??={};c.assets.items[oldAmmo]=(c.assets.items[oldAmmo]||0)+oldChamber;}
 w.ammoItemId=m.ammoItemId;w.ammo=m.rounds+chamber;return {remaining,chamber,recoveredChamber:changing?oldChamber:0,loaded:w.ammo,removedMagazine};
}

// Basic B373; High-Tech 87. Trigger type never determines loading geometry.
export function reloadPlan(c,{magazineId='',quantity=1,reloadMode='retain'}={}){
 const w=c.combatProfile.weapon;
 if(w.kind!=='firearm')fail('재장전할 총기를 선택하세요.');
 if(w.reloadStyle==='magazine'){
  if(!['retain','drop'].includes(reloadMode))fail('탄창 보관 또는 버림을 선택하세요.');
  const magazine=reloadMagazine(c,magazineId);if(magazine.kind==='speedloader')fail('스피드로더는 탄창식 총기에 사용할 수 없습니다.');
  if(!Number.isInteger(w.reloadTurns)||w.reloadTurns<1)fail('룰북에서 확인한 탄창 교환 시간이 필요합니다.');
  // Tactical Shooting p.20: listed/familiar reload time, plus one Ready to stow.
  const clearChamber=magazine.ammoItemId!==w.ammoItemId&&w.ammo>0&&w.capacity>(w.magazineCapacity||w.capacity)?1:0;
  return {kind:'magazine',magazineId,rounds:magazine.rounds,baseSeconds:w.reloadTurns+clearChamber,seconds:w.reloadTurns+clearChamber+(reloadMode==='retain'?1:0),reloadMode,weaponKey:weaponKey(w)};
 }
 if(w.reloadStyle!=='individual')fail('룰북에서 무기의 장전 구조를 확인하세요.');
 let rounds=quantity,loader;
 if(magazineId){
  loader=reloadMagazine(c,magazineId);
  if(loader.kind!=='speedloader'||!['swingOut','breakOpen'].includes(w.reloadMechanism))fail('이 장전 구조에는 스피드로더를 사용할 수 없습니다.');
  if(w.ammo!==0)fail('스피드로더를 쓰기 전에 남은 실탄을 회수하세요.');
  rounds=loader.rounds;
 }
 if(!Number.isInteger(rounds)||rounds<1||rounds+w.ammo>w.capacity)fail('장전할 발수와 빈 약실을 확인하세요.');
 if(!loader&&(c.assets?.items?.[w.ammoItemId]||0)<rounds)fail('보유 낱발 탄약이 부족합니다.');
 const seconds=loader?(w.reloadMechanism==='swingOut'?6:5):({gate:2+3*rounds,swingOut:3+2*rounds,breakOpen:2+2*rounds,tube:2*rounds,internal:1+2*rounds,breech:2+3*rounds,ejector:2+2*rounds}[w.reloadMechanism]??w.reloadTurns*rounds);
 if(!Number.isInteger(seconds)||seconds<1)fail('확인된 개별 장전 시간이 필요합니다.');
 return {kind:loader?'speedloader':'individual',magazineId,rounds,seconds,weaponKey:weaponKey(w)};
}
export function completeReload(c,plan,{holdRemoved=false}={}){
 const w=c.combatProfile.weapon;
 if(weaponKey(w)!==plan.weaponKey)fail('장전 중 무기가 바뀌었습니다.');
 const current=reloadPlan(c,{magazineId:plan.magazineId,quantity:plan.rounds,reloadMode:plan.reloadMode});
 if(current.kind!==plan.kind||current.rounds!==plan.rounds||current.seconds!==plan.seconds)fail('장전 중 탄창이나 장전 규격이 바뀌었습니다.');
 if(plan.kind==='magazine')return completeMagazineReload(c,reloadMagazine(c,plan.magazineId),{removeOnly:holdRemoved||plan.reloadMode==='drop'});
 if(plan.kind==='speedloader'){const loader=c.assets.magazines.find(m=>m.id===plan.magazineId);w.ammoItemId=loader.ammoItemId;loader.rounds=0;}
 else{c.assets.items[w.ammoItemId]-=plan.rounds;if(!c.assets.items[w.ammoItemId])delete c.assets.items[w.ammoItemId];}
 w.ammo+=plan.rounds;return {loaded:w.ammo,remaining:0};
}

export function fillMagazine(r,c,p){
 const w=c.combatProfile?.weapon||{},n=p.quantity;
 if(!Number.isInteger(n)||n<1||n>1000)fail('삽탄 수량을 확인하세요.');
 let m=c.assets.magazines?.find(m=>m.id===p.lootId);
 if(p.lootId&&!m)fail('보유 탄창을 선택하세요.');
 if(!m){
  const item=r.economy.items.find(i=>i.id===p.itemId),spec=item?.magazineSpec;
  if(!spec||!(c.assets.items[item.id]>0))fail('규격이 확인된 빈 탄창/스피드로더를 선택하세요.');
  m={...spec,id:crypto.randomUUID(),itemId:item.id,weaponName:spec.weaponName||item.name,rounds:0};
 }
 const ammoId=p.ammoItemId||m.ammoItemId,ammo=r.economy.items.find(i=>i.id===ammoId),capacity=m.capacity||(m.weaponName===w.name?w.magazineCapacity||w.capacity:0);
 if(!ammoFits(m,ammo,r.economy.items)||!Number.isInteger(m.rounds)||m.rounds<0||!Number.isInteger(capacity)||capacity<1||m.rounds+n>capacity)fail('탄창의 탄약 규격·용량을 확인하세요.');
 if(m.rounds>0&&ammoId!==m.ammoItemId)fail('혼합 탄창은 만들 수 없습니다. 먼저 탄창을 비우세요.');
 if((c.assets.items[ammoId]||0)<n)fail('보유 낱발 탄약이 부족합니다.');
 if(!p.lootId&&(c.assets.magazines?.length||0)>=200)fail('소지 탄창 한도입니다.');
 if(!p.lootId){c.assets.items[m.itemId]--;if(!c.assets.items[m.itemId])delete c.assets.items[m.itemId];(c.assets.magazines||=[]).push(m);}
 m.capacity=capacity;m.cartridge||=ammo.cartridge;m.ammoItemId=ammoId;
 c.assets.items[m.ammoItemId]-=n;if(!c.assets.items[m.ammoItemId])delete c.assets.items[m.ammoItemId];m.rounds+=n;
 // Campaign preparation rate: 2 seconds per loose round, based on retrieve/insert handling; not a universal magazine-loading rule.
 return {magazineId:m.id,seconds:n*2,rounds:n};
}
export function setMagazineRounds(r,c,p){
 const m=c.assets.magazines?.find(m=>m.id===p.lootId),target=p.quantity;
 if(p.lootId&&!m)fail('보유 탄창을 선택하세요.');
 if(!Number.isInteger(target)||target<0||target>1000)fail('탄창 장전량을 확인하세요.');
 if(!m&&target===0)fail('이미 빈 탄창입니다.');
 const current=m?.rounds||0;
 if(!Number.isInteger(current)||current<0)fail('탄창 잔탄 기록을 확인하세요.');
 if(m&&current&&p.ammoItemId&&p.ammoItemId!==m.ammoItemId)fail('혼합 탄창은 만들 수 없습니다. 먼저 탄창을 비우세요.');
 if(target>current)return fillMagazine(r,c,{...p,quantity:target-current});
 if(target===current)return {magazineId:m.id,rounds:0,seconds:0};
 const rounds=current-target;c.assets.items[m.ammoItemId]=(c.assets.items[m.ammoItemId]||0)+rounds;m.rounds=target;
 return {magazineId:m.id,rounds:-rounds,seconds:rounds*2};
}
export function emptyMagazine(c,id){
 const m=c.assets.magazines?.find(m=>m.id===id);if(!m||!m.rounds)fail('실탄이 있는 보유 탄창을 선택하세요.');
 const rounds=m.rounds;c.assets.items[m.ammoItemId]=(c.assets.items[m.ammoItemId]||0)+rounds;m.rounds=0;return {rounds,seconds:rounds*2};
}
