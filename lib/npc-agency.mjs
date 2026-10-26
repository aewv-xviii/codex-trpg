import {scenarioNPCs,requireScenarioNPC} from './npc-identity.mjs';
import {sameScene,concealedFrom} from './awareness.mjs';
import {position,yards,visibleLine} from './aquarium-space.mjs';
import {prepareCombatCharacter,prepareEncounterMembers} from './combat-declarations.mjs';
import {encounterEnemies,encounterDistance} from './encounter-roster.mjs';
import {combatCommand} from './combat.mjs';
import {controlFlags} from './control-state.mjs';

const busy=r=>['queued','running','applying','error'].includes(r.gmJob?.status);
const conscious=c=>c.hp>0&&!['dead','dying','unconscious','withdrawn'].includes(c.combatState?.status);
const place=(r,id)=>r.worldLibrary?.characterPlaces?.[id]||[...r.characters,...(r.cast||[])].find(c=>c.id===id)?.placeId||r.worldLibrary?.placeId||r.mapId;
const scene=r=>[r.chronicle?.activeCaseId,r.worldLibrary?.placeId,r.mapId,r.scene?.title].join('|');
export function npcStance(r,c){return c.npcIntent?.scene===scene(r)?c.npcIntent.stance:null;}
function present(r,n,pc){
 if(!sameScene(r,n.id,pc.id))return false;
 if(r.worldLibrary)return place(r,n.id)===place(r,pc.id);
 const maps=r.maps?.filter(m=>m.tokens?.some(t=>t.characterId===n.id))||[];
 return maps.length?maps.some(m=>m.id===r.mapId&&m.tokens.some(t=>t.characterId===pc.id)):r.cast?.some(c=>c.id===n.id)||n.placeId===r.scene?.placeId&&!!n.placeId;
}
function perceives(r,n,pc){
 if(concealedFrom(pc,n.id))return false;
 const a=position(r,n.id),b=position(r,pc.id);
 return !a||!b||visibleLine(r,a,b);
}
export function npcAgencyContext(r){
 const party=r.characters.filter(c=>r.partyCharacterIds.includes(c.id));
 return scenarioNPCs(r).filter(n=>!n.controllers?.length&&!r.partyCharacterIds.includes(n.id)&&party.some(c=>present(r,n,c))).map(n=>({
  id:n.id,name:n.name,weaponReadiness:n.combatState?.lostWeapon||n.combatState?.disarmed?'dropped':n.combatState?.dropped===true?'unready':n.combatState?.dropped===false?'ready':'unspecified',description:n.description||'',role:n.contentRole||'',intent:npcStance(r,n)?n.npcIntent:null,
  traits:(n.fields||[]).filter(f=>/성격|성향|단점|목표|동기|원칙|personality|disadvantage|goal|motive/i.test(f.name)),
  party:party.filter(c=>present(r,n,c)).map(c=>({id:c.id,canCurrentlySee:perceives(r,n,c),distanceYards:Number.isFinite(yards(position(r,n.id),position(r,c.id)))?yards(position(r,n.id),position(r,c.id)):null})),
 }));
}
// An NPC decision has its own actor. It never impersonates or resolves a PC declaration.
export function applyNPCIntent(r,original,p,die){
 if(!['dialogue','individual','turn','narration','storyDay','awareness','combat'].includes(original.gmJob?.kind))throw Error('현재 장면의 NPC 재정만 가능합니다.');
 let npc=requireScenarioNPC(r,p.characterId);
 if(npc.controllers?.length||r.partyCharacterIds.includes(npc.id)||r.characters.includes(npc)&&!npc.isNPC)throw Error('GM이 조작하는 시나리오 NPC만 결정할 수 있습니다.');
 if(!['attack','retaliate','defendOnly','endure','withdraw','neutral'].includes(p.stance)||!p.reason?.trim()||p.reason.length>1000)throw Error('NPC의 선택과 성격·목적·상황 근거가 필요합니다.');
 const target=r.characters.find(c=>c.id===p.targetId&&r.partyCharacterIds.includes(c.id));
 if(!target||!present(r,npc,target))throw Error('현재 같은 장소의 실제 상대가 필요합니다.');
 if(original.gmJob.kind==='combat'&&npc.id!==original.gmJob.actorId)throw Error('현재 차례 NPC의 선택만 변경하세요.');
 if(r.characters.includes(npc)&&!conscious(npc))throw Error('현재 행동할 수 있는 NPC가 아닙니다.');
 if(p.stance==='attack'&&r.combat?.status!=='active'){
  if(!conscious(target))throw Error('현재 교전에 참가할 수 있는 상대가 필요합니다.');
  if(controlFlags(npc).noAction||npc.combatState?.stunned)throw Error('행동 불가 상태로 선제공격할 수 없습니다.');
  if(!['ambush','preemptive','retaliation'].includes(p.opening)||!p.perceptionReason?.trim())throw Error('공격 계기와 NPC가 상대를 알아차린 근거가 필요합니다.');
  if(!perceives(r,npc,target))throw Error('NPC가 확인하지 못한 상대의 비밀 위치로 공격을 시작할 수 없습니다. 먼저 관찰을 재정하세요.');
  if(!Number.isFinite(p.distanceYards)||p.distanceYards<0||p.distanceYards>10000)throw Error('실제 교전 거리가 필요합니다.');
  npc=prepareEncounterMembers(r,target,[{characterId:npc.id,templateId:p.templateId,distanceYards:p.distanceYards,reason:p.reason}])[0].character;
  const selected=prepareEncounterMembers(r,target,p.members||[]);
  const enemies=[...new Map([...encounterEnemies(r,target,npc),...selected.map(x=>x.character)].map(c=>[c.id,c])).values()];
  const party=r.characters.filter(c=>r.partyCharacterIds.includes(c.id)&&sameScene(r,target.id,c.id)&&conscious(c));
  for(const c of [...party,...enemies])prepareCombatCharacter(r,c);
  const pending=(original.gmJob.actionIds||[]).filter(id=>r.actions.some(a=>a.id===id&&a.status==='pending'));
  const distances=Object.fromEntries(enemies.map(c=>[c.id,encounterDistance(r,target,c,selected.find(x=>x.character.id===c.id)?.distance??p.distanceYards)]));
  combatCommand(r,{id:r.owner},'combatStart',{fighters:[...party.map(c=>({id:c.id,team:'party'})),...enemies.map(c=>({id:c.id,team:'enemy'}))],theater:{positions:{...Object.fromEntries(party.map(c=>[c.id,0])),...distances},openingActorId:npc.id}},die);
  r.combat.initiatedBy={characterId:npc.id,targetId:target.id,opening:p.opening,reason:p.reason,perceptionReason:p.perceptionReason,jobId:original.gmJob.id};
  if(pending.length)r.combat.interruptedActions={actionIds:pending,requesterId:original.gmJob.requesterId};
  // Initiative is one normal maneuver. It grants no free hit, damage, surprise penalty or lost defense.
 }
 npc.npcIntent={stance:p.stance,targetId:target.id,reason:p.reason,scene:scene(r),jobId:original.gmJob.id};
 return npc.npcIntent;
}
export function resumeInterruptedActions(r){
 const b=r.combat,held=b?.interruptedActions;if(b?.status!=='ended'||!held||busy(r))return false;
 const actionIds=held.actionIds.filter(id=>r.actions.some(a=>a.id===id&&a.status==='pending'));delete b.interruptedActions;
 if(!actionIds.length)return false;
 r.gmJob={id:crypto.randomUUID(),kind:actionIds.length===1?'individual':'turn',status:'queued',actionIds,requesterId:held.requesterId,advanceTurn:false,at:new Date().toISOString(),requestText:'NPC의 선행 행동으로 보류했던 플레이어 선언입니다. 현재 상황에서 아직 유효한 의도를 재검토하세요. 이미 실행된 준비·공격·비용을 반복하거나 플레이어의 새 선택을 대신 정하지 마세요.'};return true;
}
// Wake the GM on actual scene/preparation/perception changes, never on a timer or every animation frame.
export function queueNPCSituation(r,old,op,p){
 if(r.combat?.status==='active'||busy(r)||r.archivedAt)return false;
 const arrived=r.messages.slice(old.messages.length).some(m=>m.locationArrival);
 const moving=['moveToken','exploreMove','exploreInteract','travelWorldPlace','arriveWorldPlace'].includes(op)||arrived;
 const preparing=op==='inventoryAction'&&p.verb==='ready'||op==='combatAct'&&['ready','switchWeapon'].includes(p.action);
 if(!moving&&!preparing)return false;
 const id=p.characterId||r.maps.flatMap(m=>m.tokens).find(t=>t.id===p.id)?.characterId||(arrived?r.partyCharacterIds[0]:null);
 const pc=r.characters.find(c=>c.id===id&&r.partyCharacterIds.includes(c.id));if(!pc)return false;
 const before=old.characters.find(c=>c.id===id),relevant=scenarioNPCs(r).filter(n=>!n.controllers?.length&&!r.partyCharacterIds.includes(n.id)&&present(r,n,pc)&&perceives(r,n,pc));
 const changed=relevant.filter(n=>{
  if(preparing)return true;
  // Routine travel to a neutral shop stays deterministic. Authored opposition or
  // an already established confrontational intent merits a scene-entry review.
  if(arrived&&n.contentRole!=='enemy'&&!['attack','retaliate'].includes(npcStance(r,n)))return false;
  const prev=scenarioNPCs(old).find(c=>c.id===n.id);
  if(!prev||!before||!present(old,prev,before)||!perceives(old,prev,before))return true;
  const near=(room,c)=>yards(position(room,n.id),position(room,c.id))<=Math.max(1,n.combatProfile?.weapon?.kind==='melee'?n.combatProfile.weapon.reach:1);
  return near(r,pc)&&!near(old,before);
 });
 if(!changed.length)return false;
 r.gmJob={id:crypto.randomUUID(),kind:'narration',npcSituation:true,status:'queued',actorId:pc.id,actionIds:[],requesterId:pc.owner,at:new Date().toISOString(),requestText:'실제 '+(preparing?'무기 준비':'접근·시야 변화')+' 뒤 NPC 반응을 재정하세요. 대상 NPC: '+changed.map(n=>n.id).join(', ')+'. 성격·목적·관계·실제 지각을 보고 선제공격/기습/경고/관망/비응수를 선택하세요. 전투를 반드시 열거나 반드시 피하지 마세요. 공격 결정은 npcIntent attack으로 실행하며 완료된 플레이어 행동을 반복하지 않습니다.'};return true;
}
