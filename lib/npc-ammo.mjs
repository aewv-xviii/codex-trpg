import {weaponKey} from './firearms.mjs';
import {sameScene} from './awareness.mjs';
import {npcPresentation} from './npc-identity.mjs';
// Only authored-but-unspecified ammunition on a newly connected NPC may be established once.
export function configureNPCAmmunition(r,original,p){
 const c=r.characters.find(c=>c.id===p.characterId),w=c?.combatProfile?.weapon;
 if(!['combat','individual','turn','narration'].includes(original.gmJob?.kind)||!c?.isNPC||c.controllers?.length||r.partyCharacterIds.includes(c.id)||c.npcAmmoPending!==true||!w||w.kind!=='firearm'||w.ammo!==0||c.assets?.magazines?.length)throw Error('처음 연결된 탄약 미정 NPC만 한 번 초기 탄약을 정할 수 있습니다.');
 if(original.gmJob.kind==='combat'&&original.gmJob.actorId!==c.id)throw Error('현재 NPC의 초기 장비만 정하세요.');
 if(!r.partyCharacterIds.some(id=>sameScene(r,id,c.id))||!p.reason?.trim()||p.reason.length>500)throw Error('현재 장면의 시나리오 장비 근거가 필요합니다.');
 if(!Number.isInteger(p.loaded)||p.loaded<0||p.loaded>w.capacity||!Number.isInteger(p.spareMagazines)||p.spareMagazines<0||p.spareMagazines>6||w.reloadStyle!=='magazine'||!w.magazineCapacity)throw Error('확정된 무기 규격과 유한한 초기 탄약을 지정하세요.');
 c.assets??={confirmed:true,won:0,items:{}};c.assets.items??={};c.assets.magazines??=[];
 const itemId='magazine-'+(w.catalogWeaponId||w.id||c.id);
 if(!r.economy.items.some(i=>i.id===itemId))r.economy.items.push({id:itemId,name:w.name+' 탄창',kind:'gear',price:0,sellPrice:0});
 const spec={weaponKey:weaponKey(w),weaponName:w.name,...(w.cartridge?{cartridge:w.cartridge}:{}),ammoItemId:w.ammoItemId,capacity:w.magazineCapacity,kind:'magazine'};r.economy.items.find(i=>i.id===itemId).magazineSpec=spec;w.magazineItemId=itemId;
 for(let i=0;i<p.spareMagazines;i++)c.assets.magazines.push({...spec,id:crypto.randomUUID(),itemId,ammoItemId:w.ammoItemId,weaponName:w.name,rounds:w.magazineCapacity});
 w.ammo=p.loaded;c.npcAmmoPending=false;c.npcAmmoInitial={loaded:p.loaded,spareMagazines:p.spareMagazines,jobId:original.gmJob.id};
 r.messages.push({id:crypto.randomUUID(),type:'system',name:'상황',author:r.owner,audience:'gm',text:npcPresentation(c).name+' · 초기 탄약 확정',at:new Date().toISOString()});
}
