// Fish remain nested campaign summons. They defend and take injury but do not add owner turns.
import {dropFishCargo} from './aquarium-cargo.mjs';
export function fishRecord(r,id){for(const owner of r.characters){const fish=owner.aquarium?.fish.find(f=>f.id===id);if(fish)return {owner,fish};}return null;}
export function fishTarget(r,id){const entry=fishRecord(r,id);if(!entry)return null;const {owner,fish}=entry;return {...fish,owner:owner.owner,controllers:owner.controllers,isNPC:false,maxFp:1,fp:1,fields:[],summonOwnerId:owner.id,
 combatProfile:{dx:fish.dx??13,ht:10,move:11,speed:5.75,dodge:8,parry:null,block:null,dr:0,weapon:{name:'유영어',kind:'melee',skill:3,damage:'1d6',type:'cr',reach:0,ammo:null}}};}
export function syncFishFighters(r){
 const b=r.combat;if(b?.status!=='active')return;
 for(const owner of r.characters){const team=b.fighters[owner.id]?.team;if(!team)continue;
  for(const fish of owner.aquarium?.fish||[]){
   const already=b.fighters[fish.id];
   // Without an actual map location, no target is fabricated.
   if(b.theater){if(!already){const sameSpace=fish.position?.space==='combat:'+b.id,map=r.maps.find(m=>'map:'+m.id===fish.position?.space),t=map?.tokens.find(t=>t.characterId===owner.id&&!t.hidden);const atOwner=!fish.position||!fish.mission&&t&&Math.hypot(fish.position.x-t.x*map.columns*map.unit,fish.position.y-t.y*map.rows*map.unit)<=1;if(!sameSpace&&!atOwner)continue;fish.position={space:'combat:'+b.id,x:sameSpace?fish.position.x:b.theater.positions[owner.id],y:0};}b.theater.positions[fish.id]=fish.position.x;}
   else{const map=r.maps.find(m=>m.id===b.mapId);if(!map||fish.position?.space!=='map:'+map.id)continue;let t=map.tokens.find(t=>t.characterId===fish.id);if(!t){t={id:fish.id,characterId:fish.id,name:fish.name,hidden:false};map.tokens.push(t);}t.x=fish.position.x/(map.columns*map.unit);t.y=fish.position.y/(map.rows*map.unit);}
   b.fighters[fish.id]??={team,status:'active',shock:0,activeShock:0,parries:0,summon:true};if(fish.hp<=0)b.fighters[fish.id].status='dead';
  }
 }
 for(const [id,f] of Object.entries(b.fighters))if(f.summon&&!fishRecord(r,id)){f.status='withdrawn';}
}
export function hurtFish(r,id,injury,{type='cr',supernatural=false,area=false}={}){
 const {owner,fish}=fishRecord(r,id);const cap=area?Infinity:supernatural?(type==='imp'||type.startsWith('pi')?1:2):1;
 const amount=Math.min(cap,injury);fish.hp=Math.max(0,fish.hp-amount);
 if(!fish.hp){dropFishCargo(r,owner,fish,'물고기 파괴 · 운반 물품 낙하');delete fish.mission;delete fish.reportReady;delete fish.suspendedSurvey;if(!fish.destroyedRemnant){(owner.aquarium.remnants??=[]).push({fishId:id,quantity:0,reusable:false,position:structuredClone(fish.position),reason:'HP 0 · 찢어진 비닐'});fish.destroyedRemnant=true;}if(r.combat?.fighters[id])r.combat.fighters[id].status='dead';}
 return amount;
}
