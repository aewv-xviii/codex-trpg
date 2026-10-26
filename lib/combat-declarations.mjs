import {offMapPosition,offMapDistance} from '../public/play/off-map-state.js';
import {combatLog} from './combat-log.mjs';
import {declarationEffort,effortCost,effortConsentKey,validateEffort} from './combat-effort.mjs';
import {encounterEnemies,encounterDistance} from './encounter-roster.mjs';
import {sameScene} from './awareness.mjs';
import {requireScenarioNPC,combatIdentityText} from './npc-identity.mjs';
import {peaceAction,peaceActions} from './peace-actions.mjs';
import {connectScenarioCombat} from './scenario-combat.mjs';
import {fishRecord} from './aquarium-targets.mjs';
import {shockModifier} from './injury.mjs';
// Prepared GURPS data -> existing authoritative combat engine. No model dice or damage.
import {preparedKnifeModes} from '../public/play/weapon-modes.js';
import {combatCommand,validateCombatProfile} from './combat.mjs';
import {canControl} from '../public/play/character-control.js';
import {combatTemplates,connectLegacyTemplateDetails} from './combat-catalog.mjs';
export {combatTemplates};
export function prepareEncounterMembers(r,actor,list=[]){
 if(!Array.isArray(list)||list.length>11||new Set(list.map(x=>x.characterId)).size!==list.length)throw Error('교전 참가자를 확인하세요.');
 return list.map(p=>{
  let c=requireScenarioNPC(r,p.characterId);
  if(c.controllers?.length||r.partyCharacterIds?.includes(c.id)||!sameScene(r,actor.id,c.id)||!p.reason?.trim()||!Number.isFinite(p.distanceYards)||p.distanceYards<0||p.distanceYards>10000)throw Error('같은 교전의 실제 NPC와 거리·참가 근거가 필요합니다.');
  if(!r.characters.some(x=>x.id===c.id)){
   const t=combatTemplates.find(x=>x.id===p.templateId);if(!t)throw Error('연출 NPC의 확정 전투 시트가 필요합니다.');
   c={...structuredClone(c),owner:r.owner,isNPC:true,controllers:[],hp:t.hp,maxHp:t.hp,fp:t.fp,maxFp:t.fp,fields:structuredClone(t.fields||[]),combatProfile:structuredClone(t.profile),combatTemplateId:t.id,combatUnarmed:structuredClone(t.unarmed),combatLoadout:structuredClone(t.loadout||[]),statsPending:false,assets:{confirmed:true,won:0,items:{}}};
   if(r.characters.length>=60)throw Error('캐릭터 저장 한도입니다.');r.characters.push(c);r.cast=r.cast.filter(x=>x.id!==c.id);
  }
  prepareCombatCharacter(r,c);return {character:c,distance:p.distanceYards,reason:p.reason};
 });
}
const fail=m=>{throw Error(m);};
const field=(c,pattern)=>{const f=c.fields?.find(f=>pattern.test(f.name)&&f.value.trim());return f?Number.parseFloat(f.value):NaN;};
const has=(c,pattern)=>c.fields?.some(f=>pattern.test(f.name)&&!/(미구매|없음)/.test(f.value));
const item=(r,c,pattern)=>r.economy?.items.find(i=>pattern.test(i.name)&&(c.assets?.items?.[i.id]||0)>0);
const event=(r,text,actorId)=>combatLog(r,text,undefined,actorId);
export function prepareCombatCharacter(r,c){
 connectLegacyTemplateDetails(c);
 if(connectScenarioCombat(c))event(r,c.name+' · 확정된 시나리오 전투 시트 연결 (기존 HP·FP·소지품 보존, 탄약 지급 없음)',c.id);
 if(c.combatProfile){validateCombatProfile(c.combatProfile);if(c.statsPending)fail(c.name+'의 전투 수치 검토가 필요합니다.');return;}
 const base={dx:field(c,/^DX$/),ht:field(c,/^HT$/),speed:field(c,/기본\s*속도|^Basic Speed$/i),move:field(c,/기본\s*이동|^Basic Move$/i),dodge:field(c,/^회피$|^Dodge$/i),parry:null,block:null,dr:field(c,/^DR$/),highPain:has(c,/고통에 강함|High Pain Threshold/i)};
 if(!Number.isFinite(base.dr))base.dr=0;
 let weapon,source;
 const pistol=item(r,c,/9mm.*(자동권총|권총)/i),knife=item(r,c,/컴뱃나이프/);
 if(pistol&&Number.isFinite(field(c,/Guns.*Pistol/i))){
  const ammo=item(r,c,/9mm.*탄약/);if(!ammo||!c.assets?.confirmed)fail(c.name+'의 휴대 탄약이 없습니다.');
  weapon={caliberMm:9,rof:3,recoil:2,bulk:-2,reloadTurns:3,reloadStyle:'magazine',magazineCapacity:15,name:pistol.name,kind:'firearm',skill:field(c,/Guns.*Pistol/i),damage:'2d6+2',type:'pi',reach:1850,halfRange:150,acc:2,ammo:0};
  source='WPN-02 · Basic Set B278 (준비된 9mm 자동권총 자료)';
  base.weapon=weapon;c.combatProfile=validateCombatProfile(base);
  Object.assign(c.combatProfile.weapon,{ammoItemId:ammo.id,capacity:16});
  // One-time reconciliation of previously confirmed starting equipment, not free reloading.
  const loaded=Math.min(15,c.assets.items[ammo.id]);c.assets.items[ammo.id]-=loaded;c.combatProfile.weapon.ammo=loaded;
  r.economy.ledger||=[];r.economy.ledger.push({id:crypto.randomUUID(),kind:'initialLoad',characterId:c.id,quantity:loaded,loaded,reason:'확정된 시작 휴대 탄약을 장전분과 예비분으로 분리',at:new Date().toISOString()});
  event(r,`${c.name} · 시작 탄약 장부 연결: 장전 ${loaded}발 / 예비 ${c.assets.items[ammo.id]}발 (총량 유지)`,c.id);
 }else if(knife&&field(c,/^ST$/)===12&&Number.isFinite(field(c,/^(Knife(?: 단검)?|단검)$/i))){
  const skill=field(c,/^(Knife(?: 단검)?|단검)$/i),master=has(c,/무기의 달인.*단검/);
  weapon={name:knife.name+' · 찌르기',kind:'melee',skill,damage:master&&skill>=base.dx+2?'1d6+1':'1d6-1',type:'imp',reach:1,halfRange:0,acc:0,ammo:null};
  base.parry=field(c,/단검 받아내기/);if(!Number.isFinite(base.parry))base.parry=null;
  weapon.modes=preparedKnifeModes(c,skill);weapon.defaultModeId='thrust';
  c.combatProfile=validateCombatProfile({...base,weapon});source='Basic Set B16/B99/B272 · ST12 대형 단검 찌르기, 구매한 무기의 달인만 적용';
 }else fail(c.name+'의 무기 자료를 준비된 전투 프로필에 연결해야 합니다.');
 c.statsPending=false;c.combatProfileSource=source;event(r,`${c.name} · 시트와 소지품에서 전투 수치 연결 · ${source}`,c.id);
}
export function applyCombatDeclaration(r,original,p,die){
 let a=r.actions.find(a=>a.id===p.actionId);const eligible=original.gmJob?.actionIds||[];
 if(!a||a.status!=='pending'||!eligible.includes(a.id))fail('이번 요청의 미처리 행동만 실행할 수 있습니다.');
 const actor=r.characters.find(c=>c.id===a.actorId),user={id:a.author,name:actor?.name};
 if(!canControl(actor,user)||original.gmJob.requesterId!==a.author)fail('행동을 선언한 캐릭터의 권한을 확인하세요.');
 let approved=false;
 if(p.resumeEffortActionId){
  const held=r.actions.find(x=>x.id===p.resumeEffortActionId),request=held?.effortRequest;
  if(!request||held.status!=='pending'||held.id===a.id||held.actorId!==a.actorId||held.author!==a.author||!p.effortConsentQuote?.trim()||!a.text.includes(p.effortConsentQuote))fail('같은 플레이어의 새 승인 선언과 보류된 추가 노력이 필요합니다.');
  if(request.key!==effortConsentKey(r,actor))fail('FP 또는 전투 상황이 바뀌었습니다. 추가 노력 비용을 다시 확인하세요.');
  a.status='resolved';a.effortApprovalFor=held.id;a=held;p=structuredClone(request.payload);delete held.effortRequest;approved=true;
 }
 declarationEffort(r,a,p);
 if(p.extraEffort){
  validateEffort(p,actor,r.combat?.fighters?.[actor.id]||{},p.action==='defense');
  const cost=effortCost(p);
  if(!approved&&(actor.fp-cost)*3<actor.maxFp){
   a.effortRequest={payload:structuredClone(p),key:effortConsentKey(r,actor),cost,remaining:actor.fp-cost};
   r.messages.push({id:crypto.randomUUID(),type:'gmQuestion',name:'GM 확인',author:r.owner,text:`${actor.name}: 이 행동은 최대 ${cost} FP를 사용해 ${actor.fp-cost}/${actor.maxFp} FP가 남습니다. 최대 FP의 ⅓ 미만이 됩니다. 그래도 사용하시겠습니까?`,at:new Date().toISOString()});
   return {waitingForFP:true};
  }
 }
 if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)fail('전투 재정 근거가 필요합니다.');
 if(p.action==='recover'&&r.combat?.status!=='active'){combatCommand(r,user,'recoverWeapon',{characterId:actor.id,lootId:p.lootId},die);a.status='resolved';a.timeCharged=true;return;}
 if(r.combat?.status!=='active'&&peaceActions.has(p.action)){
  a.status='resolved';a.timeCharged=true;a.preparationHandled=true;
  return peaceAction(r,user,{...p,characterId:actor.id},a);
 }
 let target=r.characters.find(c=>c.id===p.targetId);
 if(r.combat?.status!=='active'){
  if(p.action!=='attack')fail('새 전투는 공격 선언으로 시작하세요.');
  if(target&&(!target.isNPC||target.controllers?.length))fail('플레이어 조작 인물을 적으로 자동 편성하지 않습니다.');
  const cast=r.cast?.find(c=>c.id===p.targetId);
  if(!target&&!cast)fail('현재 공개된 NPC를 선택하세요.');
  if(r.maps?.some(m=>m.tokens.some(t=>t.characterId===p.targetId&&t.hidden))&&!target?.contentRevealed)fail('아직 공개되지 않은 인물입니다.');
  if(!target){
   const template=combatTemplates.find(t=>t.id===p.templateId);if(!template)fail('준비된 NPC 전투 템플릿이 필요합니다.');
   if(r.characters.length>=60)fail('캐릭터 저장 한도입니다.');
   target={...structuredClone(cast),owner:r.owner,isNPC:true,controllers:[],hp:template.hp,maxHp:template.hp,fp:template.fp,maxFp:template.fp,fields:structuredClone(template.fields||[]),combatProfile:structuredClone(template.profile),combatTemplateId:template.id,combatUnarmed:structuredClone(template.unarmed),combatLoadout:structuredClone(template.loadout||[]),statsPending:false,assets:{confirmed:true,won:0,items:{}},contentRevealed:true};
   if(template.profile.weapon.kind==='firearm'&&r.economy?.enabled&&!r.economy.items.some(i=>i.id===template.profile.weapon.ammoItemId))throw Error('NPC의 표준 탄약을 경제 장부에 먼저 등록하세요.');
   r.characters.push(target);r.cast=r.cast.filter(c=>c.id!==target.id);
   event(r,`${target.name} · ${template.name} 전투 수치 적용 · ${p.reason}`,target.id);
  }
  prepareCombatCharacter(r,actor);prepareCombatCharacter(r,target);
  if(!Number.isFinite(p.distanceYards)||p.distanceYards<0||p.distanceYards>10000)fail('현재 장면의 전투 거리를 확인하세요.');
  if(offMapPosition(r,actor.id)){const measured=offMapDistance(r,actor.id,target.id);if(!Number.isFinite(measured))fail('지도 밖 위치와 대상의 장소 연결이 필요합니다.');p={...p,distanceYards:measured};}
  a.status='resolved';a.combatHandled=true;
  const location=id=>r.worldLibrary?.characterPlaces?.[id]||r.worldLibrary?.placeId;
  const party=r.characters.filter(c=>c.id===actor.id||r.partyCharacterIds?.includes(c.id)&&!c.isNPC&&location(c.id)===location(actor.id));
  for(const ally of party)prepareCombatCharacter(r,ally);
  const selected=prepareEncounterMembers(r,actor,p.encounterMembers||[]),enemies=[...new Map([...encounterEnemies(r,actor,target),...selected.map(x=>x.character)].map(c=>[c.id,c])).values()];for(const enemy of enemies)prepareCombatCharacter(r,enemy);
  // Joining initiative does not choose an ally's maneuver; their account retains control.
  combatCommand(r,{id:r.owner},'combatStart',{fighters:[...party.map(c=>({id:c.id,team:'party'})),...enemies.map(c=>({id:c.id,team:'enemy'}))],theater:{positions:{...Object.fromEntries(party.map(c=>[c.id,0])),...Object.fromEntries(enemies.map(c=>[c.id,offMapPosition(r,actor.id)?encounterDistance(r,party.find(x=>!offMapPosition(r,x.id))||target,c,0):c.id===target.id?p.distanceYards:selected.find(x=>x.character.id===c.id)?.distance??encounterDistance(r,actor,c,p.distanceYards)]))},openingActorId:actor.id}},die);
  event(r,`교전 거리 ${p.distanceYards}야드 · ${p.reason}`);
  const text=`${enemies.map(c=>c.name).join(', ')}와의 전투가 시작됐다.`;
  r.messages.push({id:crypto.randomUUID(),type:'narration',name:'상황 설명',author:r.owner,text:combatIdentityText(r,text),at:new Date().toISOString(),gameClock:structuredClone(r.chronicle?.clock||null),caseId:r.chronicle?.activeCaseId});
  r.scene={...r.scene,speaker:'상황 설명',speakerId:'',expressionId:'',narration:combatIdentityText(r,text)};
 }else{
  if(!r.combat.fighters[actor.id])fail('현재 전투에 참가한 인물만 행동할 수 있습니다.');
  a.status='resolved';a.combatHandled=true;
 }
 const b=r.combat;a.combatId=b.id;let drawMessage;const startMessages=r.messages.length;
 if(p.action==='defense'){
  const defended=fishRecord(r,b.pending?.targetId)?.owner.id===actor.id?b.pending.targetId:actor.id;
  if(p.extraEffort&&defended!==actor.id)fail('소환체의 방어에 소유자의 마샬아츠 추가 노력을 대신 적용할 수 없습니다.');
  combatCommand(r,user,'combatDefend',{counterattack:p.counterattack===true,attackModeId:p.attackModeId||'',extraEffort:p.extraEffort||'',characterId:defended,parryMode:p.parryMode||'',defense:p.defense,acrobatic:p.acrobatic??false,retreat:p.retreat??false,x:p.x,y:p.y},die,true);
 }else{
  if(b.pending||b.order[b.index]!==actor.id)fail('현재 이 캐릭터의 행동 차례가 아닙니다.');
  if(p.action==='attack'&&p.targetUnaware){
   if(!target?.isNPC||target.controllers?.length)fail('플레이어의 방어권은 자동 생략하지 않습니다.');
   b.unawareOfAttack={actorId:actor.id,targetId:target.id,reason:p.reason};
  }
  combatCommand(r,user,'combatAct',{counterattack:p.counterattack===true,continueUntilDone:p.continueUntilDone===true,extraEffort:p.extraEffort||'',characterId:actor.id,grip:p.grip||'',posture:p.posture||'',steps:p.steps??0,defenseChoice:p.defenseChoice||'',defensiveChoice:p.defensiveChoice||'',telegraphic:p.telegraphic??false,attackSide:p.attackSide||'',weaponId:p.weaponId||'',objectId:p.objectId||'',targetObserves:p.targetObserves??false,hands:p.hands??1,lootId:p.lootId||'',zoneX:p.zoneX,zoneY:p.zoneY,parryMode:p.parryMode||'',action:p.action,drawWeapon:p.drawWeapon,targetId:p.targetId,unseenTarget:p.unseenTarget===true,perceptionReason:p.perceptionReason||'',modifier:p.unseenTarget?p.visibilityModifier:0,attackModeId:p.attackModeId||'',maneuver:p.maneuver||'attack',hitLocation:p.hitLocation||'torso',rapidStrike:p.rapidStrike??false,deceptiveLevels:p.deceptiveLevels??0,shots:p.shots??1,moveYards:p.moveYards??0,x:p.x,y:p.y,magazineId:p.magazineId||'',reloadMode:p.reloadMode,quantity:p.quantity,acrobatic:p.acrobatic??false,retreat:p.retreat??false},die,true);
 }
 drawMessage=r.messages.slice(startMessages).find(m=>m.text?.includes(' · 빠른 뽑기 '));
 if(drawMessage){const hit=r.messages.slice(startMessages).find(m=>m.combatDetails?.event?.phase==='hit');if(hit)drawMessage.combatDetails={event:{...hit.combatDetails.event,result:'preparation'}};}
 a.combatId=b.id;
}
