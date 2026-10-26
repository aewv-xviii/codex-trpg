import {attributePlay} from './play-scope.mjs';
import {syncCarrying} from '../public/play/carrying.js';
import {validateContainers} from './containers.mjs';
import {reserveWait,triggerWait} from './wait-interrupts.mjs';
import {queueDeclarations} from './declaration-queue.mjs';
import {scheduleActivity,advanceActivities} from './activities.mjs';
import {applyAquariumSituation} from './aquarium-situations.mjs';
import {applyOffMapPosition} from './off-map-position.mjs';
import {extendLocalSelection} from './library-selection.mjs';
import {spatialGeometrySchema,authoredPositionSchema} from './spatial-schema.mjs';
import {possessionContext} from './npc-inventory.mjs';
import {spatialContext} from './spatial-context.mjs';
import {applyPossessionAction} from './possession-actions.mjs';
import {applyNPCIntent,npcAgencyContext,resumeInterruptedActions} from './npc-agency.mjs';
import {ammunitionLedger} from '../public/play/ammo-ledger.js';
import {controlFlags} from './control-state.mjs';
import {npcRosterContext,scenarioNPCs,validateNPCReferences} from './npc-identity.mjs';
import {abilityRules,applyAbilityPlan,queueAbilityNarration} from './ability-plan.mjs';
import {applyAquariumSequence} from './aquarium-sequence.mjs';
import {applyAquariumObservation} from './aquarium-observation.mjs';
import {perceptionContext} from './aquarium-profile.mjs';
import {applySourceRuling} from './source-ruling.mjs';
import {markScenarioStart,scenarioCheckpointRequest} from './scenario-checkpoints.mjs';
import {attackManeuvers,postures} from '../public/play/combat-options.js';
import {recruitCompanion,recruitmentActions,recruitmentCandidates} from './companions.mjs';
import {scenarioCombatIndex} from './scenario-combat.mjs';
import {applyInventoryDeclaration} from './inventory-actions.mjs';
import {hitLocations} from '../public/play/injury-state.js';
import {applyAquarium,aquariumSummary,hasAquarium,queueAquariumReports} from './aquarium.mjs';
import {applyStealthAction,applyAwarenessUpdate} from './stealth-rulings.mjs';
import {applyControlAction} from './control-rulings.mjs';
import {syncAwareness,queueAwareness,awarenessContext} from './awareness.mjs';
import {initializeConditions,syncConditions,restAction,careAction} from './conditions.mjs';
import {captureScenes} from './scene-archive.mjs';
import {promoteDialogue} from './dialogue-action.mjs';
import {presentMessage} from '../public/play/message-purpose.js';
import {worldGMContext,applyWorldArrival,applyWorldTravel} from './world-library.mjs';
import {stageProgress,endProgress,progressJob} from './gm-progress.mjs';
import {applyExplorationGM,visibleCells} from './exploration.mjs';
import {index} from '../public/play/exploration-geometry.js';
import {randomDie} from './table-engine.mjs';
import {projectContentForGM} from './content-packs.mjs';
import {queueCombatAI,settlePreparedCombat,advanceCombatPlans,combatCommand} from './combat.mjs';
import {validateCombatReaction} from './combat-reactions.mjs';
import {prepareEncounterMembers} from './combat-declarations.mjs';
import {applyCombatDeclaration,combatTemplates} from './combat-declarations.mjs';
import {beginStoryDay,storyGMCommand} from './story-play.mjs';
import {preparationCommand} from './scenario-preparation.mjs';
import {eventTiming} from './chronicle.mjs';
import {storyState} from '../public/play/story-state.js';
import { mutateRoom, requireOwner, TableError, visibleRoom } from './table-engine.mjs';
import { updateMemory,MEMORY_KINDS } from './gm-memory.mjs';
import {recordClue} from './clues.mjs';
import { workspace } from './workspace.mjs';
import {recoverEquipment,equipmentLootContext} from './weapon-loot.mjs';
import {configureNPCAmmunition} from './npc-ammo.mjs';
import {effortOptions} from './combat-effort.mjs';
const s={type:'string'},n={type:'integer'};
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const sheetFields={type:'array',items:object({name:s,value:s,formula:s})};
const payloads={advanceClock:object({minutes:n,reason:s}),calendarEvent:object({id:s,caseId:s,title:s,description:s,date:s,time:s,status:{type:"string",enum:["scheduled","done","cancelled"]},visibility:{type:"string",enum:["public","gm"]}}),caseFile:object({id:s,title:s,summary:s,status:{type:"string",enum:["open","resolved","closed"]},visibility:{type:"string",enum:["public","gm"]}}),adminReply:object({text:s}),gmQuestion:object({text:{type:'string',description:'A brief out-of-character clarification to the players. Chat only; never changes the scene or resolves an action.'}}),narration:object({text:s}),npcDialogue:object({speakerId:s,name:s,text:s}),automatic:object({actionId:s,reason:s}),rule:object({name:s,kind:{type:'string',enum:['source','local_source','house_rule']},documentId:s,quote:s,source:s,formula:s,comparator:{type:'string',enum:['gte','lte']},target:n,attribute:{type:'string',enum:['','ST','DX','IQ','HT','Will','Per']},reactive:{type:'boolean'},costFP:n,successHpDelta:n,failureHpDelta:n}),plan:object({conditionContext:{type:'string',enum:['','concentration','approachDetection']},actionId:s,ruleId:s,targetId:s,scope:s,risk:s}),note:object({title:s,text:s,kind:{type:'string',enum:['person','quest','clue','summary']},visibility:{type:'string',enum:['public','gm']}}),sheetTemplate:object({fields:sheetFields}),memory:object({id:s,kind:{type:'string',enum:MEMORY_KINDS},subjectId:s,title:s,text:s,certainty:{type:'string',enum:['confirmed','belief','unknown']},knownTo:{type:'array',items:s},status:{type:'string',enum:['active','resolved','retired']}})};
payloads.recoverEquipment=object({actionId:s,sourceId:s,kind:{type:'string',enum:['weapon','magazine']},weaponId:s,magazineId:s,equip:{type:'boolean'},reason:s});
payloads.npcAmmunition=object({characterId:s,loaded:{type:'integer',minimum:0,maximum:1000},spareMagazines:{type:'integer',minimum:0,maximum:6},reason:s});
payloads.observeNPC=object({characterId:s,mode:{type:'string',enum:['heard','detected','seen']},reason:s});
delete payloads.advanceClock;
Object.assign(payloads,{
 finishBeat:object({id:s,actionIds:{type:'array',items:s}}),
 advanceActionTime:object({actionIds:{type:'array',items:s},minutes:n,reason:s}),
 resolveDeadline:object({id:s,status:{type:'string',enum:['done','cancelled']},reason:s}),
 endCase:object({recap:s}),
});
payloads.combatAct=object({shots:{type:'integer',minimum:1,maximum:100},moveYards:{type:'number',minimum:0,maximum:100},magazineId:s,rapidStrike:{type:'boolean'},deceptiveLevels:{type:'integer',minimum:0,maximum:20},attackModeId:s,maneuver:{type:'string',enum:['attack','stepAttack','moveAttack']},hitLocation:{type:'string',enum:Object.keys(hitLocations)},characterId:s,action:{type:'string',enum:['attack','aim','defend','wait','move','stand','ready','reload']},targetId:s,x:{type:'number'},y:{type:'number'},modifier:{type:'integer',enum:[0]}});
for(const op of ['combatAct'])payloads[op]=object({...payloads[op].properties,drawWeapon:{type:'boolean'},quantity:{type:'integer',minimum:1,maximum:1000}});
payloads.combatDefend=object({retreat:{type:'boolean'},acrobatic:{type:'boolean'},x:{type:'number'},y:{type:'number'},characterId:s,defense:{type:'string',enum:['dodge','parry','block','none']}});
payloads.mapAction=object({actionId:s,characterId:s,verb:{type:'string',enum:['move','open','close','inspect','resolve','reveal']},targetId:s,x:{type:'number'},y:{type:'number'},success:{type:'boolean'}});
payloads.travelWorldAction=object({actionId:s,placeId:s,placeName:s,minutes:n,mode:{type:'string',enum:['walk','bus','subway','taxi','car']},shopId:s,reason:s});
payloads.arriveWorldPlace=object({actionId:s,minutes:n});
payloads.beginEncounter=object({reason:s});
payloads.offMapPosition=object({actionId:s,mode:{type:'string',enum:['enter','return']},label:s,distanceYards:{type:'number'},seconds:n,canSeeScene:{type:'boolean'},reason:s});
payloads.combatAction=object({retreat:{type:'boolean'},acrobatic:{type:'boolean'},x:{type:'number'},y:{type:'number'},shots:{type:'integer',minimum:1,maximum:100},moveYards:{type:'number',minimum:0,maximum:100},magazineId:s,rapidStrike:{type:'boolean'},deceptiveLevels:{type:'integer',minimum:0,maximum:20},attackModeId:s,maneuver:{type:'string',enum:['attack','stepAttack','moveAttack']},hitLocation:{type:'string',enum:Object.keys(hitLocations)},actionId:s,action:{type:'string',enum:['attack','aim','defend','wait','ready','stand','move','defense','reload']},targetId:s,templateId:{type:'string',enum:['',...combatTemplates.map(t=>t.id)]},distanceYards:{type:'number'},drawWeapon:{type:'boolean'},targetUnaware:{type:'boolean'},defense:{type:'string',enum:['dodge','parry','block','none']},reason:s});
payloads.combatAction=object({...payloads.combatAction.properties,quantity:{type:'integer',minimum:1,maximum:1000}});
for(const op of ['combatAction','combatAct','combatDefend'])payloads[op]=object({...payloads[op].properties,extraEffort:{type:'string',enum:effortOptions}});
payloads.combatAction=object({...payloads.combatAction.properties,effortBasis:{type:'string',enum:['','explicit','beyondNormal']},effortQuote:s,resumeEffortActionId:s,effortConsentQuote:s});
payloads.combatAction.properties.reason={type:'string',minLength:1,maxLength:500,description:'Required concrete intent, distance and adjudication reason, including Extra Effort when selected.'};
payloads.combatReview=object({reason:s,multiplier:{type:'integer',enum:[1,2,3]},dr:{type:'string',enum:['normal','half','ignore']},maximum:{type:'boolean'}});
payloads.adjudicateDialogue=object({reason:s});
payloads.restAction=object({actionIds:{type:'array',items:s},minutes:n});
payloads.careAction=object({actionId:s,characterId:s});
payloads.aquariumAction=object({fishId:s,knowsAbility:{type:'boolean'},thorough:{type:'boolean'},path:{type:'array',items:object({x:{type:'number'},y:{type:'number'}})},actionId:s,power:{type:'string',enum:['summon','dismiss','predator','detect','witness','refraction','moveFish','scout','report']},targetId:s,materialId:s,sense:{type:'string',enum:['','vision','hearing','smell','touch','taste']},distanceYards:{type:'number'},modifier:n,fishNearby:{type:'boolean'},actorSeesTarget:{type:'boolean'},targetSawFish:{type:'boolean'},reason:s});
payloads.aquariumAction=object({...payloads.aquariumAction.properties,
 power:{type:'string',enum:[...payloads.aquariumAction.properties.power.enum,'recall','disbelieve','refractionAim','carryFish','dropCargo']},
 observation:{type:'string',enum:['','automatic','perception','observation']},contradiction:{type:'boolean'},
 scoutAreas:{type:'array',maxItems:16,items:object({label:s,observation:{type:'string',enum:['automatic','perception','observation']},modifier:n,reason:s,path:{type:'array',minItems:1,maxItems:40,items:object({x:{type:'number'},y:{type:'number'}})}})}});
payloads.aquariumAction.properties.scoutAreas.items=object({...payloads.aquariumAction.properties.scoutAreas.items.properties,navigation:object({mode:{type:'string',enum:['guided','autonomous']},modifier:n,seconds:n,criticalFailure:{type:'string',enum:['lost','return']},reason:s})});
payloads.aquariumAction=object({...payloads.aquariumAction.properties,cargo:object({from:{type:'string',enum:['owner','ground','carried']},itemId:s,groundId:s,targetId:s,weightLb:{type:'number'},graspable:{type:'boolean'},handlingSeconds:n,pickupPosition:object({x:{type:'number'},y:{type:'number'}})})});
payloads.aquariumObserve=object({sourceId:s,targetId:s,fishId:s,power:{type:'string',enum:['witness','disbelieve']},knowsAbility:{type:'boolean'},targetSawFish:{type:'boolean'},contradiction:{type:'boolean'},reason:s});
const aquariumStep=structuredClone(payloads.aquariumAction.properties);delete aquariumStep.actionId;
aquariumStep.fishIndex={type:'integer',minimum:0,maximum:2};
aquariumStep.sense={type:'string',enum:['vision','hearing','smell','touch','taste'],description:'For predator choose the edited sense. For other powers this field is ignored.'};
payloads.aquariumSequence=object({actionId:s,steps:{type:'array',minItems:1,maxItems:8,items:object(aquariumStep)},waitForReports:{type:'boolean'}});
payloads.combatAct.properties.action.enum.push('fillMagazine','emptyMagazine');
payloads.combatAct=object({...payloads.combatAct.properties,itemId:s,ammoItemId:s});
for(const key of ['combatAct','combatAction']){
 const old=payloads[key].properties;
 old.maneuver.enum=Object.keys(attackManeuvers);
 old.action.enum.push('stowMagazine','recoverMagazine','tkLift','tkMove','tkDrop','grip','posture','evaluate','disarm','switchWeapon','tkStrike','tkGrapple','tkHold','feint','grapple','breakFree','release','takedown','recover','suppress');
 payloads[key]=object({...old,counterattack:{type:'boolean'},continueUntilDone:{type:'boolean'},reloadMode:{type:'string',enum:['retain','drop']},grip:{type:'string',enum:['','normal','reverse']},posture:{type:'string',enum:['',...Object.keys(postures)]},steps:{type:'integer',minimum:0,maximum:2},defenseChoice:{type:'string',enum:['','dodge','parry','block']},defensiveChoice:{type:'string',enum:['','parry','block']},telegraphic:{type:'boolean'},attackSide:{type:'string',enum:['','front']},weaponId:s,objectId:s,targetObserves:{type:'boolean'},hands:{type:'integer',minimum:1,maximum:2},lootId:s,zoneX:{type:'number'},zoneY:{type:'number'},parryMode:{type:'string',enum:['','weapon','karate','brawling']}});
}
payloads.combatDefend=object({...payloads.combatDefend.properties,parryMode:{type:'string',enum:['','weapon','karate','brawling']}});
payloads.locateWeapon=object({lootId:s,characterId:s,x:{type:'number'},y:{type:'number'},reason:s});
payloads.combatObject=object({objectId:s,name:s,weightLb:{type:'number',exclusiveMinimum:0,maximum:1000},x:{type:'number'},y:{type:'number'},reason:s});
payloads.combatDefend=object({...payloads.combatDefend.properties,counterattack:{type:'boolean'},attackModeId:s});
payloads.combatPlanAction=object({actionId:s,kind:{type:'string',enum:['reload','counterattack','cancel']},magazineId:s,quantity:n,reloadMode:{type:'string',enum:['retain','drop']},targetId:s,attackModeId:s,hitLocation:{type:'string',enum:Object.keys(hitLocations)}});
payloads.inventoryAction=object({actionId:s,ammoItemId:s,continueUntilDone:{type:'boolean'},reloadMode:{type:'string',enum:['retain','drop']},verb:{type:'string',enum:['buy','sell','use','eat','drop','pickup','store','take','give','recover','ready','reload','stowMagazine','recoverMagazine','fillMagazine','emptyMagazine','unload','rest']},itemId:s,quantity:n,targetId:s,shopId:s,lootId:s,expectedUnitPrice:n});
payloads.recruitCompanion=object({actionId:s,characterId:s,playerAgreed:{type:'boolean'},npcAgreed:{type:'boolean'},agreement:s});
const rulingSide=object({field:s,attribute:{type:'string',enum:['ST','DX','IQ','HT','Will','Per']},modifier:n,reason:s,scopes:{type:'array',items:s}});
payloads.sourceRuling=object({actionId:s,mode:{type:'string',enum:['success','quickContest']},sources:{type:'array',minItems:1,maxItems:6,items:object({kind:{type:'string',enum:['source','local_source']},documentId:s,quote:s})},actor:rulingSide,opponentId:s,opponent:rulingSide,scope:s,risk:s,success:s,failure:s,tie:s,seconds:n,costFP:n,transfer:object({fromId:s,itemId:s,quantity:n,propName:s,propDescription:s})});
// The reviewed source is bound by the server; do not ask a model to transcribe
// long quotes or SHA strings. Ordinary rulebook checks still cite exact sources.
payloads.sourceRuling.properties.sources.items.properties.quote={type:'string',minLength:1,maxLength:500,description:'Exact short original excerpt, not the entire skill entry. Never paraphrase.'};
payloads.sourceRuling.properties.sources.items.properties.documentId={type:'string',description:'For local_source: local:<bookId>:<PDF page>. For source: exact room.documents id, never a local bookId.'};
const observerSchema=object({characterId:s,mode:{type:'string',enum:['contest','hidden','exposed']},reason:s,check:rulingSide});
payloads.stealthAction=object({actionId:s,characterId:s,mode:{type:'string',enum:['hide','leave','search']},automatic:{type:'boolean'},actor:rulingSide,observers:{type:'array',maxItems:30,items:observerSchema},sources:payloads.sourceRuling.properties.sources,path:{type:'array',maxItems:40,items:object({x:{type:'number'},y:{type:'number'}})},seconds:n,reason:s});
payloads.possessionAction=object({actionId:s,sourceId:s,mode:{type:'string',enum:['search','loot','pickpocket']},access:{type:'string',enum:['helpless','consent','covert']},automatic:{type:'boolean'},selections:{type:'array',maxItems:60,items:object({kind:{type:'string',enum:['item','money','magazine']},id:s,quantity:n})},seconds:n,reason:s,actor:rulingSide,victimMode:{type:'string',enum:['none','contest']},victim:rulingSide,observers:{type:'array',maxItems:30,items:object({characterId:s,mode:{type:'string',enum:['contest','noticed','unaware']},check:rulingSide,reason:s})},sources:{type:'array',maxItems:6,items:payloads.sourceRuling.properties.sources.items}});
payloads.awarenessUpdate=object({characterId:s,cueId:s,mode:{type:'string',enum:['observe','warn','maintain','end']},speakerId:s,observers:{type:'array',maxItems:30,items:observerSchema},sources:{type:'array',maxItems:6,items:payloads.sourceRuling.properties.sources.items},reason:s});
const encounterMember=object({characterId:s,templateId:{type:'string',enum:['',...combatTemplates.map(t=>t.id)]},distanceYards:{type:'number'},reason:s});
payloads.combatAction=object({...payloads.combatAction.properties,encounterMembers:{type:'array',maxItems:11,items:encounterMember}});
payloads.joinEncounter=object({anchorId:s,members:{type:'array',minItems:1,maxItems:11,items:encounterMember},reason:s});
payloads.controlAction=object({actionId:s,characterId:s,targetId:s,profileId:s,actor:rulingSide,opponent:rulingSide,release:{type:'boolean'},reason:s});
for(const op of ['combatAct','combatAction'])payloads[op]=object({...payloads[op].properties,unseenTarget:{type:'boolean'},perceptionReason:s,visibilityModifier:n});
const planBasis=object({ruleId:s,revision:s,capabilityId:s});
const planBase={id:s,intent:s,basis:planBasis,after:s,when:{type:'string',enum:['always','success','failure','tie']}};
payloads.aquariumSituation=object({characterId:s,fishId:s,eventId:s,relatedEventId:s,mode:{type:'string',enum:['suppress','release','maneuver','resume','rebind']},seconds:n,modifier:n,reason:s,sources:payloads.sourceRuling.properties.sources,connection:object({fromSpace:s,toSpace:s,fromAnchor:object({x:{type:'number'},y:{type:'number'}}),toAnchor:object({x:{type:'number'},y:{type:'number'}}),rotation:n})});
const planCheck=structuredClone(payloads.sourceRuling.properties);delete planCheck.actionId;
payloads.abilityPlan=object({actionId:s,objective:s,waitForReports:{type:'boolean'},steps:{type:'array',minItems:1,maxItems:12,items:{anyOf:[
 object({...planBase,kind:{type:'string',enum:['mechanic']},mechanic:object(aquariumStep)}),
 object({...planBase,kind:{type:'string',enum:['check']},check:object(planCheck)}),
 object({...planBase,kind:{type:'string',enum:['describe']},description:s}),
 object({...planBase,kind:{type:'string',enum:['awaitReports']}})
]}}});
payloads.recordClue=object({id:s,title:s,text:s,usage:s,source:s,knownTo:{type:'array',minItems:1,maxItems:30,items:s},certainty:{type:'string',enum:['confirmed','belief','unknown']}});
payloads.npcIntent=object({characterId:s,targetId:s,stance:{type:'string',enum:['attack','retaliate','defendOnly','endure','withdraw','neutral']},opening:{type:'string',enum:['','ambush','preemptive','retaliation']},templateId:{type:'string',enum:['',...combatTemplates.map(t=>t.id)]},distanceYards:{type:'number'},perceptionReason:s,reason:s,members:{type:'array',maxItems:11,items:encounterMember}});
export const GM_OPS=Object.keys(payloads);
payloads.scenarioDraft=object({title:s,summary:s,secrets:s,startDate:s,startTime:s,locations:{type:'array',items:object({key:s,title:s,description:s,imagePrompt:s,geometry:spatialGeometrySchema})},people:{type:'array',items:object({name:s,description:s,locationKey:s,position:authoredPositionSchema,enemy:{type:'boolean'},imagePrompt:s,inventory:object({reviewed:{type:'boolean'},won:n,items:{type:'array',maxItems:60,items:object({key:s,itemId:s,name:s,description:s,location:s,quantity:n})}})})},beats:{type:'array',items:object({title:s,description:s,dayOffset:n,time:s,duration:n,kind:{type:'string',enum:['scene','activity','deadline']},locationKey:s,visibility:{type:'string',enum:['public','gm']},requiresIndex:n})}});
GM_OPS.push('scenarioDraft');
export function eligibleActions(room){
 const kind=room.gmJob?.kind;if(['dialogue','request','rules','narration','combatReaction'].includes(kind))return [];
 return room.actions.filter(a=>a.status==='pending'&&(!room.gmJob?.actionIds||room.gmJob.actionIds.includes(a.id)));
}
payloads.scheduleActivity=object({actionId:s,label:s,interruptPolicy:{type:'string',enum:['pause','restart','concentrate']},sources:payloads.sourceRuling.properties.sources,steps:{type:'array',minItems:1,maxItems:24,items:{anyOf:['sourceRuling','abilityPlan','careAction','inventoryAction','combatAction'].map(op=>object({op:{type:'string',enum:[op]},seconds:n,maneuver:{type:'string',enum:['ready','concentrate']},payload:payloads[op]}))}}});
payloads.reserveWait=object({actionId:s,trigger:{type:'string',enum:['attack','move','event']},targetId:s,rangeYards:{type:'number'},reason:s,sources:payloads.sourceRuling.properties.sources,response:object({...payloads.combatAct.properties,maneuver:{type:'string',enum:['attack','stepAttack','allOutDetermined','allOutStrong','allOutDouble']},action:{type:'string',enum:['attack','feint','ready']}})});
payloads.triggerWait=object({characterId:s,reason:s});
export function schemaForRoom(room){
 if(room.gmJob?.kind==='combatReaction'){
  const p={narration:structuredClone(payloads.narration)};
  const ids=room.gmJob.reaction?.speakerIds||[];
  if(ids.length){p.npcDialogue=structuredClone(payloads.npcDialogue);p.npcDialogue.properties.speakerId={type:'string',enum:ids};}
  for(const value of Object.values(p))value.properties.text={type:'string',maxLength:400};
  return object({summary:s,commands:{type:'array',maxItems:2,items:{anyOf:Object.entries(p).map(([op,payload])=>object({op:{type:'string',enum:[op]},payload}))}}});
 }
 if(room.gmJob?.kind==='preparation')return object({summary:s,commands:{type:'array',items:{anyOf:[object({op:{type:'string',enum:['scenarioDraft']},payload:payloads.scenarioDraft})]}}});
 if(room.gmJob?.kind==='combatReview')return object({summary:s,commands:{type:'array',items:{anyOf:[object({op:{type:'string',enum:['combatReview']},payload:payloads.combatReview})]}}});
 const p=structuredClone(payloads),pending=eligibleActions(room),rules=room.rules.filter(r=>r.status==='active');
 if(!['individual','turn','combat','narration','awareness'].includes(room.gmJob?.kind)||!room.characters.some(c=>hasAquarium(c)&&c.aquarium))delete p.aquariumObserve;
 if(!['individual','turn'].includes(room.gmJob?.kind)||!pending.length)delete p.recoverEquipment;
 else p.recoverEquipment.properties.actionId={type:'string',enum:pending.map(a=>a.id)};
 if(room.campaign.system!=='gurps4'||!['individual','turn'].includes(room.gmJob?.kind)||!pending.length)delete p.possessionAction;
 else p.possessionAction.properties.actionId={type:'string',enum:pending.map(a=>a.id)};
 const ammoNPCs=room.characters.filter(c=>c.npcAmmoPending===true&&(!room.gmJob?.actorId||room.gmJob.kind!=='combat'||c.id===room.gmJob.actorId));
 if(!['combat','individual','turn','narration'].includes(room.gmJob?.kind)||!ammoNPCs.length)delete p.npcAmmunition;
 else p.npcAmmunition.properties.characterId={type:'string',enum:ammoNPCs.map(c=>c.id)};
 const npcIds=(room.scenarioNPCRoster||scenarioNPCs(room)).map(c=>c.id);
 if(room.campaign.system!=='gurps4'||!npcIds.length||!['dialogue','individual','turn','narration','storyDay','awareness','combat'].includes(room.gmJob?.kind))delete p.npcIntent;
 else p.npcIntent.properties.characterId={type:'string',enum:room.gmJob.kind==='combat'?[room.gmJob.actorId]:npcIds};
 if(npcIds.length){p.npcDialogue.properties.speakerId={type:'string',enum:npcIds};p.observeNPC.properties.characterId={type:'string',enum:npcIds};}else {delete p.npcDialogue;delete p.observeNPC;}
 if(room.combat?.status!=='active'||room.combat.pending||!['individual','turn','narration','combat','awareness'].includes(room.gmJob?.kind))delete p.joinEncounter;
 if(!['individual','turn','combat'].includes(room.gmJob?.kind)||room.gmJob?.kind!=='combat'&&!pending.length){delete p.stealthAction;delete p.controlAction;}
 if(!room.characters.some(c=>c.controlProfiles&&Object.keys(c.controlProfiles).length))delete p.controlAction;
 if(!['individual','turn','narration','combat','awareness'].includes(room.gmJob?.kind)||!room.characters.some(c=>c.stealth?.active))delete p.awarenessUpdate;
 if(room.gmJob?.kind==='awareness')for(const op of Object.keys(p))if(!['awarenessUpdate','narration','joinEncounter','aquariumObserve','npcIntent'].includes(op))delete p[op];
 if(room.campaign.system!=='gurps4'||!['turn','individual'].includes(room.gmJob?.kind)||!pending.length)delete p.sourceRuling;
 else p.sourceRuling.properties.actionId={type:'string',enum:pending.map(a=>a.id)};
 const recruitActions=recruitmentActions(room),recruitNPCs=recruitmentCandidates(room);
 if(!recruitActions.length||!recruitNPCs.length)delete p.recruitCompanion;
 else {p.recruitCompanion.properties.actionId={type:'string',enum:recruitActions.map(a=>a.id)};p.recruitCompanion.properties.characterId={type:'string',enum:recruitNPCs.map(c=>c.id)};}
 if(room.gmJob?.kind==='dialogue')for(const op of Object.keys(p))if(!['narration','npcDialogue','observeNPC','gmQuestion','memory','recordClue','adjudicateDialogue','aquariumObserve','npcIntent'].includes(op))delete p[op];
 if(!['dialogue','individual','turn','narration','storyDay'].includes(room.gmJob?.kind))delete p.recordClue;
 if(room.gmJob?.kind!=='dialogue')delete p.adjudicateDialogue;
 delete p.scenarioDraft;delete p.combatReview;
 for(const op of ['restAction','careAction']){if(!['individual','turn'].includes(room.gmJob?.kind)||!pending.length||room.combat?.status==='active')delete p[op];else if(op==='careAction')p[op].properties.actionId={type:'string',enum:pending.map(a=>a.id)};}
 if(!['individual','turn'].includes(room.gmJob?.kind)||!pending.some(a=>hasAquarium(room.characters.find(c=>c.id===a.actorId)||{})))delete p.aquariumAction;
 else p.aquariumAction.properties.actionId={type:'string',enum:pending.filter(a=>hasAquarium(room.characters.find(c=>c.id===a.actorId)||{})).map(a=>a.id)};
 if(!p.aquariumAction||room.combat?.status==='active')delete p.aquariumSequence;else p.aquariumSequence.properties.actionId=structuredClone(p.aquariumAction.properties.actionId);
 if(!p.aquariumAction||room.campaign.system!=='gurps4')delete p.abilityPlan;else p.abilityPlan.properties.actionId=structuredClone(p.aquariumAction.properties.actionId);
 if(!['individual','turn'].includes(room.gmJob?.kind)||!pending.length)delete p.inventoryAction;else p.inventoryAction.properties.actionId={type:'string',enum:pending.map(a=>a.id)};
 if(room.combat?.status!=='active'||!['individual','turn'].includes(room.gmJob?.kind)||!pending.length)delete p.combatPlanAction;else p.combatPlanAction.properties.actionId={type:'string',enum:pending.map(a=>a.id)};
 if(room.combat?.status!=='active'||!['combat','individual','turn','narration'].includes(room.gmJob?.kind)){delete p.reserveWait;delete p.triggerWait;}else if(!['combat','individual','turn'].includes(room.gmJob?.kind))delete p.reserveWait;
 if(!['individual','turn'].includes(room.gmJob?.kind)||!pending.length){delete p.offMapPosition;delete p.scheduleActivity;}
 if(!['individual','turn'].includes(room.gmJob?.kind)||!pending.length)delete p.combatAction;
 else p.combatAction.properties.actionId={type:'string',enum:pending.map(a=>a.id)};
 if(!room.maps?.find(m=>m.id===room.mapId)?.exploration||!['individual','turn','narration'].includes(room.gmJob?.kind)){delete p.mapAction;delete p.beginEncounter;}
 if(room.gmJob?.kind!=='combat'){delete p.combatAct;delete p.combatDefend;}else{
  for(const op of Object.keys(p))if(!['combatAct','combatDefend','combatObject','locateWeapon','narration','stealthAction','awarenessUpdate','controlAction','joinEncounter','aquariumObserve','npcIntent','npcAmmunition'].includes(op))delete p[op];
  if(room.combat.pending){delete p.combatAct;delete p.stealthAction;delete p.controlAction;}else delete p.combatDefend;
  for(const op of ['combatAct','combatDefend'])if(p[op])p[op].properties.characterId={type:'string',enum:[room.gmJob.actorId]};
 }
 if(!['turn','individual','narration'].includes(room.gmJob?.kind))for(const op of ['finishBeat','advanceActionTime','resolveDeadline','endCase'])delete p[op];
 if(room.gmJob?.kind==='storyDay')for(const op of Object.keys(p))if(!['narration','npcDialogue','observeNPC','note','memory','recordClue','npcIntent'].includes(op))delete p[op];
 if(room.gmJob?.kind==='request'){
  const ownerRequest=room.gmJob.requesterId===room.owner;
  for(const op of Object.keys(p))if(!['adminReply',...(ownerRequest?['rule','sheetTemplate']:[])].includes(op))delete p[op];
 }else delete p.adminReply;
 if(room.gmJob?.kind!=='rules'&&!(room.gmJob?.kind==='request'&&room.gmJob.requesterId===room.owner))delete p.sheetTemplate;
 if(['dialogue','narration'].includes(room.gmJob?.kind))delete p.rule;
 if(['rules','dialogue','request'].includes(room.gmJob?.kind)){delete p.advanceClock;delete p.calendarEvent;delete p.caseFile;}
 if(!room.chronicle?.clock)delete p.advanceClock;
 if(pending.length&&p.automatic){p.automatic.properties.actionId={type:'string',enum:pending.map(a=>a.id)};}else delete p.automatic;
 if(p.plan&&pending.length&&rules.length&&room.characters.length){p.plan.properties.actionId={type:'string',enum:pending.map(a=>a.id)};p.plan.properties.ruleId={type:'string',enum:rules.map(r=>r.id)};p.plan.properties.targetId={type:'string',enum:room.characters.map(c=>c.id)};}else delete p.plan;
 if(!(room.worldLibrary||room.worldContext)||!['turn','individual','narration'].includes(room.gmJob?.kind)||!pending.some(a=>a.worldDestination))delete p.arriveWorldPlace;
 if(!(room.worldLibrary||room.worldContext)||!['turn','individual'].includes(room.gmJob?.kind)||!pending.length)delete p.travelWorldAction;
 else p.travelWorldAction.properties.actionId={type:'string',enum:pending.map(a=>a.id)};
 const result=object({summary:s,commands:{type:'array',items:{anyOf:Object.entries(p).map(([op,payload])=>object({op:{type:'string',enum:[op]},payload}))}}});
 const selected=room.actions.filter(a=>a.storyEventId&&(room.gmJob.actionIds||pending.map(a=>a.id)).includes(a.id));
 const ids=[...new Set(selected.map(a=>a.storyEventId))];
 if(ids.length&&['turn','individual','narration'].includes(room.gmJob.kind)){
  result.properties.storyOutcomes={type:'array',minItems:ids.length,maxItems:ids.length,items:object({eventId:{type:'string',enum:ids},completed:{type:'boolean'},reason:s})};result.required.push('storyOutcomes');
 }
 return result;
}
export function gmSnapshot(original) {
 const admin=original.gmJob?.kind==='request',requester=original.gmJob?.requesterId;
 const r=workspace(admin&&requester!==original.owner?visibleRoom(original,{id:requester}):structuredClone(original));
 delete r.sceneArchive;
 if(admin&&requester!==original.owner){r.campaign.scenarioId='';r.campaign.localScenarioId='';}
 r.possessionContext=possessionContext(r);r.equipmentLootContext=equipmentLootContext(r);r.scenarioNPCRoster=npcRosterContext(r);r.npcAgencyContext=npcAgencyContext(r);
 if(original.gmJob?.requesterId===original.owner)r.ammunitionLedger=ammunitionLedger(r);else delete r.ammunitionLedger;
 r.perceptionContext=perceptionContext(r);r.awarenessContext=awarenessContext(r);
 r.spatialContext=admin&&requester!==original.owner?{status:'unavailable',reason:'player-request-projection'}:spatialContext(r);
 projectContentForGM(r);
 worldGMContext(r);
 r.combatTemplates=combatTemplates; r.scenarioCombatIndex=scenarioCombatIndex.filter(e=>r.characters.some(c=>c.contentRef?.packId===e.packId&&c.contentRef.actorId===e.actorId));
 for(const c of r.characters){const ability=aquariumSummary(c);if(ability){c.availableAbilities=ability;c.abilityRuleContext=abilityRules(c);}}
 r.chronicle.events=r.chronicle.events.map(e=>({...e,timing:eventTiming(e,r.chronicle.clock),availability:storyState(e,r.chronicle)}));
 if(r.economy)r.economy.ledger=r.economy.ledger.slice(-30);
 if(r.chronicle.preparation)for(const item of [...r.chronicle.preparation.locations,...r.chronicle.preparation.people])delete item.image;
 delete r.scenarioStarts;delete r.scenarioResetBackup;delete r._pendingScenarioStart;
 delete r.travelRollbacks;delete r.receipts;delete r.checkpoints;delete r.bridgeHash;delete r.creationSignature;delete r.joinCode;delete r.gmHistory;if(r.chronicle)delete r.chronicle.startCorrections;if(r.gmJob){delete r.gmJob.lease;delete r.gmJob.steps;}
 r.documents=r.documents.filter(d=>[...(r.campaign.rulebookIds||[]),r.campaign.rulebookId,r.campaign.scenarioId,...(r.campaign.characterReferenceIds||[])].includes(d.id));
 delete r.campaign.caseScenario;delete r.campaign.caseTitle;delete r.bridgeParentId;
 if(r.gmJob?.kind==='preparation')r.documents=r.documents.map(d=>({...d,content:d.id===r.campaign.scenarioId?d.content:'[Rulebook registered; retrieve rules when a check is needed.]'}));
 const adminMessage=m=>m.channel==='admin'||['request','adminReply'].includes(m.type);
 const play=r.messages.filter(m=>!adminMessage(m)).slice(-60);
 r.messages=admin?[...play,...r.messages.filter(m=>adminMessage(m)&&(m.recipient||m.author)===requester).slice(-30)]:play;r.rolls=r.rolls.slice(-20);
 // Party chat is remembered on later requests, not an NPC instruction or evidence of overhearing.
 r.messages=r.messages.map(presentMessage).map(m=>m.audience==='party'?{...m,text:'[일행끼리 나눈 대화 · 이후 GM 참고용. NPC에게 전달되거나 NPC가 들은 것으로 자동 간주하지 말 것] '+m.text}:m);
 // Do not send large raster data to the language model. Positions and descriptions remain.
 for(const c of [...r.characters,...(r.cast||[])])c.portraits=(c.portraits||[]).map(({id,label})=>({id,label}));
 for(const m of r.maps)m.image='[map image omitted; use tokens, pins and grid coordinates]';
 r.scene.background='[background omitted]';delete r.scenePresets;return r;
}
export async function claimJob(store,roomId) {
 const before=await store.get(roomId);if(!before)return null;
 const r=structuredClone(before);if(r.gmJob?.status!=='queued'&&!queueAquariumReports(r))return null;r.gmJob={...r.gmJob,status:'running',progressRevisions:0,conversationRevisions:0,startedAt:new Date().toISOString(),lease:crypto.randomUUID()};
 stageProgress(r.gmJob,'sources');r.version++;
 if(!await store.save(r,before.version))return null;
 return {room:gmSnapshot(r),lease:r.gmJob.lease,version:r.version};
}
export async function finishJob(store,roomId,lease,version,proposal,error,attempt=0) {
 const original=await store.get(roomId);if(original?.gmJob?.lease!==lease||original.gmJob.status!=='running')return {ignored:true};
 let r=structuredClone(original),problem=error;
 if(original.version!==version+(original.gmJob.progressRevisions||0)+(original.gmJob.conversationRevisions||0))problem='처리 중 게임 상태가 변경됐습니다. 최신 상태에서 다시 진행하세요.';
 if(!problem)try {
  if(!proposal||!Array.isArray(proposal.commands)||proposal.commands.length>30||typeof proposal.summary!=='string'||proposal.summary.length>2000)throw Error('GM 응답 형식이 올바르지 않습니다.');
  const user={id:r.owner,name:'Codex GM'};
  let dialogueJob=null;
  if(proposal.commands.some(c=>['reserveWait','triggerWait','scheduleActivity','offMapPosition','possessionAction','sourceRuling','abilityPlan','stealthAction','controlAction'].includes(c.op))&&(proposal.commands.length!==1))throw Error('원문 재정은 한 번에 하나만 실행하고 서버 결과를 받은 뒤 서술하세요.');
  if(proposal.commands.some(c=>c.op==='adjudicateDialogue')&&proposal.commands.length!==1)throw Error('대화 판정 연결과 결과 서술을 동시에 실행할 수 없습니다.');
  if(original.gmJob.kind==='combat'){
   const actor=r.characters.find(c=>c.id===original.gmJob.actorId);
   const observing=proposal.commands.some(c=>c.op==='aquariumObserve');
   const turns=proposal.commands.filter(c=>['combatAct','combatDefend','stealthAction','controlAction'].includes(c.op)).length;
   if(r.combat?.status!=='active'||r.combat.id!==original.gmJob.combatId||!actor?.isNPC||actor.controllers?.length||(observing?turns!==0:turns!==1))throw Error('AI 전투 차례와 조작권을 확인하세요. 관찰 판정 결과를 받은 다음 행동을 정하세요.');
   if(proposal.commands.some(c=>['combatAct','combatDefend','stealthAction','controlAction'].includes(c.op)&&c.payload?.characterId!==actor.id))throw Error('다른 인물을 조작할 수 없습니다.');
  }
  if(original.gmJob.kind==='combatReview'&&(r.combat?.pending?.kind!=='critical'||r.combat.id!==original.gmJob.combatId||proposal.commands.length!==1||proposal.commands[0].op!=='combatReview'))throw Error('대기 중인 특수 판정만 처리할 수 있습니다.');
  if(original.gmJob.kind==='combatReaction')validateCombatReaction(r,proposal);
  initializeConditions(r);
  r.gmJob.status='applying';
  const allowedOps=schemaForRoom(original).properties.commands.items.anyOf.map(v=>v.properties.op.enum[0]);
  const previousMessages=new Set(r.messages.map(m=>m.id));
  if(original.gmJob.kind==='storyDay')beginStoryDay(r,user);
  validateContainers(r);syncCarrying(r);attributePlay(r,original);
  captureScenes(r,original.messages.length);
  for(const item of proposal.commands){
   const sceneStart=r.messages.length;try{
   if(!allowedOps.includes(item.op))throw Error('허용하지 않은 GM 명령입니다.');
   const p=item.payload??JSON.parse(item.payloadJSON);if(!p||Array.isArray(p)||typeof p!=='object')throw Error('GM 명령 본문이 잘못됐습니다.');
   validateNPCReferences(r,item.op,p);
   const declared=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'),declaredActor=r.characters.find(c=>c.id===declared?.actorId);
   if(declaredActor&&controlFlags(declaredActor).noAction&&!['narration','gmQuestion','awarenessUpdate'].includes(item.op)&&!(item.op==='combatAction'&&p.action==='wait')&&!(item.op==='combatPlanAction'&&p.kind==='cancel'))throw Error('행동 제한 중인 인물은 먼저 대기/회복을 처리하세요.');
   if(item.op==='npcIntent'){applyNPCIntent(r,original,p,randomDie);continue;}
   if(item.op==='adjudicateDialogue'){dialogueJob=promoteDialogue(r,original,p);continue;}
   if(item.op==='joinEncounter'){const anchor=r.characters.find(c=>c.id===p.anchorId&&r.combat?.fighters[c.id]);if(!anchor)throw Error('현재 교전의 인물이 필요합니다.');const members=prepareEncounterMembers(r,anchor,p.members);r=mutateRoom(r,user,{op:'combatJoin',payload:{fighters:members.map(x=>({id:x.character.id,team:'enemy',position:(r.combat.theater?.positions[anchor.id]||0)+x.distance})),reason:p.reason},requestId:crypto.randomUUID(),expectedVersion:r.version}).room;continue;}
   if(item.op==='stealthAction'){applyStealthAction(r,original,p,proposal.localCitations||[],randomDie);continue;}
   if(item.op==='awarenessUpdate'){applyAwarenessUpdate(r,original,p,proposal.localCitations||[],randomDie);continue;}
   if(item.op==='controlAction'){applyControlAction(r,original,p,proposal.localCitations||[],randomDie);continue;}
   if(item.op==='aquariumSituation'){applyAquariumSituation(r,original,p,proposal.localCitations||[],randomDie);continue;}
   if(item.op==='aquariumObserve'){applyAquariumObservation(r,original,p,randomDie);continue;}
   if(item.op==='abilityPlan'){applyAbilityPlan(r,original,p,proposal.localCitations||[],randomDie);continue;}
   if(item.op==='sourceRuling'){applySourceRuling(r,original,p,proposal.localCitations||[],randomDie);continue;}
   if(item.op==='recruitCompanion'){recruitCompanion(r,original,p);continue;}
   if(item.op==='aquariumSequence'){applyAquariumSequence(r,original,p,randomDie);continue;}
   if(item.op==='aquariumAction'){applyAquarium(r,original,p,randomDie);continue;}
   if(item.op==='restAction'){restAction(r,original,p,randomDie);continue;}
   if(item.op==='careAction'){careAction(r,original,p,randomDie);continue;}
   if(item.op==='inventoryAction'){applyInventoryDeclaration(r,original,p,randomDie);continue;}
   if(item.op==='possessionAction'){applyPossessionAction(r,original,p,proposal.localCitations||[],randomDie);continue;}
   if(item.op==='recoverEquipment'){recoverEquipment(r,original,p);continue;}
   if(item.op==='npcAmmunition'){configureNPCAmmunition(r,original,p);continue;}
   if(item.op==='combatPlanAction'){const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending');if(!a||!original.gmJob.actionIds?.includes(a.id)||a.author!==original.gmJob.requesterId)throw Error('이번 요청의 실제 선언만 예약하세요.');combatCommand(r,{id:a.author},'combatPlan',{...p,characterId:a.actorId},randomDie);a.status='resolved';a.combatPlanHandled=true;continue;}
   if(item.op==='reserveWait'){reserveWait(r,original,p,proposal.localCitations||[]);continue;}
   if(item.op==='triggerWait'){triggerWait(r,original,p,randomDie);continue;}
   if(item.op==='scheduleActivity'){scheduleActivity(r,original,p,proposal.localCitations||[]);continue;}
   if(item.op==='offMapPosition'){applyOffMapPosition(r,original,p);continue;}
   if(item.op==='combatAction'){if(applyCombatDeclaration(r,original,p,randomDie)?.waitingForFP)break;continue;}
   if(item.op==='travelWorldAction'){applyWorldTravel(r,original,user,p);continue;}
   if(item.op==='arriveWorldPlace'){applyWorldArrival(r,original,user,p);continue;}
   if(item.op==='mapAction'){applyExplorationGM(r,original,p,randomDie);continue;}
   if(item.op==='beginEncounter'){
    if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)throw Error('전투가 시작되는 이유가 필요합니다.');
    if(r.actions.some(a=>a.status!=='resolved'))throw Error('현재 행동을 먼저 처리하세요.');
    const map=r.maps.find(m=>m.id===r.mapId),seen=visibleCells(r,map);
    const fighters=map.tokens.filter(t=>!t.hidden&&seen.has(index(map,t))).map(t=>r.characters.find(c=>c.id===t.characterId)).filter(c=>c&&(r.partyCharacterIds.includes(c.id)||c.contentRole==='enemy')).map(c=>({id:c.id,team:r.partyCharacterIds.includes(c.id)?'party':'enemy'}));
    r=mutateRoom(r,user,{op:'combatStart',payload:{fighters},requestId:crypto.randomUUID(),expectedVersion:r.version}).room;continue;
   }
   if(item.op==='scenarioDraft'){p.assets=proposal.assets||[];p.assetErrors=proposal.assetErrors||[];}
   if(item.op==='sheetTemplate'&&original.gmJob.kind!=='rules'&&!(original.gmJob.kind==='request'&&original.gmJob.requesterId===original.owner))throw Error('시트 항목은 룰 준비 작업에서만 제안할 수 있습니다.');
   if(['automatic','plan'].includes(item.op)&&!eligibleActions(original).some(a=>a.id===p.actionId))throw Error('이번 GM 요청에 포함되지 않은 행동입니다.');
   if(item.op==='calendarEvent'&&(p.status!=='scheduled'||p.id&&original.chronicle.events.some(e=>e.id===p.id&&e.status!=='scheduled')))throw Error('완료와 마감은 전용 명령으로 처리하세요.');
   if(item.op==='caseFile'&&p.status!=='open')throw Error('케이스 종료는 endCase로 처리하세요.');
   if(storyGMCommand(r,original,user,item.op,p))continue;
   if(item.op==='memory'){updateMemory(r,p);continue;}
   if(item.op==='recordClue'){recordClue(r,p);continue;}
   if(item.op==='rule')p.activate=false;
   r=mutateRoom(r,user,{op:item.op,payload:p,requestId:crypto.randomUUID(),expectedVersion:r.version},undefined,proposal.localCitations||[]).room;
   }finally{syncConditions(r,randomDie);captureScenes(r,sceneStart);}
  }
  const scopeIds=original.gmJob.actionIds||eligibleActions(original).map(a=>a.id);
  if(r.actions.some(a=>scopeIds.includes(a.id)&&a.mapIntent?.kind==='investigate'&&a.status==='resolved'&&!a.mapHandled))throw Error('지도 조사 결과를 mapAction resolve로 반영하세요.');
  const linked=r.actions.filter(a=>a.storyEventId&&scopeIds.includes(a.id));
  const outcomes=proposal.storyOutcomes||[];
  if(proposal.commands.some(c=>['sourceRuling','abilityPlan'].includes(c.op))&&outcomes.some(o=>o.completed))throw Error('사건 완료는 원문 판정의 서버 결과를 받은 다음 서술 작업에서 결정하세요.');
  if(!Array.isArray(outcomes)||new Set(outcomes.map(o=>o.eventId)).size!==outcomes.length)throw Error('사건 완료 응답을 확인하세요.');
  for(const outcome of outcomes){
   if(!linked.some(a=>a.storyEventId===outcome.eventId)||typeof outcome.completed!=='boolean'||typeof outcome.reason!=='string'||!outcome.reason.trim()||outcome.reason.length>2000)throw Error('사건 결과 근거가 필요합니다.');
   const event=r.chronicle.events.find(e=>e.id===outcome.eventId);
   if(outcome.completed&&event?.status==='scheduled')storyGMCommand(r,original,user,'finishBeat',{id:event.id,actionIds:linked.filter(a=>a.storyEventId===event.id).map(a=>a.id)});
   if(event)event.lastOutcome={completed:outcome.completed,reason:outcome.reason};
  }
  for(const action of linked)if(action.status==='resolved'&&r.chronicle.events.find(e=>e.id===action.storyEventId)?.status==='scheduled'&&!outcomes.some(o=>o.eventId===action.storyEventId))throw Error('달력 사건의 완료 여부가 누락됐습니다.');
  if(linked.length&&r.chronicle.activeCaseId&&!r.actions.some(a=>a.status!=='resolved')&&!r.chronicle.events.some(e=>e.caseId===r.chronicle.activeCaseId&&e.status==='scheduled')){
   storyGMCommand(r,original,user,'endCase',{recap:proposal.summary});
  }
  if(original.gmJob.kind==='request'&&!r.messages.some(m=>!previousMessages.has(m.id)&&m.type==='adminReply'))throw Error('관리자 답변이 없습니다. 다시 요청하세요.');
  if(original.gmJob.kind==='preparation'&&proposal.commands.length!==1)throw Error('하나의 준비 초안이 필요합니다.');
  if(original.gmJob.kind==='preparation'&&original.gmJob.autoApply){
   preparationCommand(r,user,'applyPreparation',{id:r.chronicle.preparation.id});
  }
  if(original.gmJob.kind==='storyDay'&&!r.messages.some(m=>!previousMessages.has(m.id)&&['narration','npcDialogue'].includes(m.type)))throw Error('도입 장면이 없습니다. 다시 시작하세요.');
  syncAwareness(r,original);if(original.gmJob.kind==='awareness'&&r.characters.some(c=>original.gmJob.actorIds.includes(c.id)&&c.stealth?.pending))throw Error('관찰 대기 단서를 모두 처리하세요.');
  if(original.gmJob.kind!=='combatReaction'&&!proposal.commands.some(c=>c.op==='aquariumObserve'))settlePreparedCombat(r,randomDie);
  syncConditions(r,randomDie);
  validateContainers(r);syncCarrying(r);attributePlay(r,original);
  captureScenes(r,original.messages.length);
  if(JSON.stringify(r).length>4000000)throw Error('세션 저장 한도에 도달했습니다.');
  let sequence=0;
  for(const m of r.messages)if(!previousMessages.has(m.id)){m.gmResponseId=original.gmJob.id;m.gmSequence=sequence++;}
  r.gmJob={...original.gmJob,status:'done',message:proposal.summary,finishedAt:new Date().toISOString()};
  endProgress(r,'done');
  if(dialogueJob)r.gmJob=dialogueJob;
  const stateFollowup=r.actions.filter(a=>scopeIds.includes(a.id)&&a.stateResult&&a.status==='resolved'&&!a.stateNarrated);
  if(stateFollowup.length&&original.gmJob.kind!=='narration'){for(const a of stateFollowup)a.stateNarrated=true;r.gmJob={id:crypto.randomUUID(),kind:'narration',status:'queued',actionIds:stateFollowup.map(a=>a.id),requesterId:original.gmJob.requesterId,advanceTurn:false,at:new Date().toISOString(),requestText:'stateResult와 실제 은신/CC 상태에 근거해 결과를 서술하세요. 발견자의 경고 가능 여부와 청자를 판단해 awarenessUpdate warn으로 전파하세요. 주사위·효과를 재적용하지 마세요.'};}
  const possessionFollowup=r.actions.filter(a=>scopeIds.includes(a.id)&&a.possessionResult?.needsNarration&&a.status==='resolved'&&!a.possessionNarrated);
  if(possessionFollowup.length&&original.gmJob.kind!=='narration'){for(const a of possessionFollowup)a.possessionNarrated=true;r.gmJob={id:crypto.randomUUID(),kind:'narration',status:'queued',actionIds:possessionFollowup.map(a=>a.id),requesterId:original.gmJob.requesterId,advanceTurn:false,at:new Date().toISOString(),requestText:'possessionResult의 실제 수색/획득/목격 결과만 서술하세요. complete=false는 진행 중이며 아직 물품을 얻지 않았습니다. 미판정 발각은 실패만으로 단정하지 마세요. 발견된 소지품만 공개하고 NPC 응수·경고·추격은 성격과 상황에 따라 npcIntent 등으로 판단하세요. 물품·현금·시간·주사위를 다시 적용하지 마세요.'};}
  const rulingFollowup=r.actions.filter(a=>scopeIds.includes(a.id)&&!a.abilityPlan&&a.sourceRuling&&a.status==='resolved'&&!a.sourceRulingNarrated);
  if(rulingFollowup.length&&original.gmJob.kind!=='narration'){
   for(const a of rulingFollowup)a.sourceRulingNarrated=true;
   r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'narration',actionIds:rulingFollowup.map(a=>a.id),advanceTurn:false,requesterId:original.gmJob.requesterId,at:new Date().toISOString(),requestText:'sourceRuling.resultText와 서버 roll 결과에 한정하여 관찰 가능한 결과를 서술하세요. 확정된 scope 밖의 이동·물품·돈·HP를 변경하거나 재굴림하지 마세요.'};
  }
  const powerFollowup=r.actions.filter(a=>scopeIds.includes(a.id)&&!a.abilityPlan&&[a.powerResult,...(a.powerResults||[])].some(p=>['detect','predator','report'].includes(p?.power))&&a.status==='resolved'&&!a.powerNarrated);
  if(powerFollowup.length&&original.gmJob.kind!=='narration'){
   for(const a of powerFollowup)a.powerNarrated=true;
   r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'narration',actionIds:powerFollowup.map(a=>a.id),advanceTurn:false,requesterId:original.gmJob.requesterId,at:new Date().toISOString(),requestText:'서버가 확정한 powerResult와 지속 상태를 바탕으로 관찰 가능한 결과만 짧게 서술. 재판정·추가 행동 금지.'};
  }
  if(original.gmJob.abilityResults){
   if(!r.messages.some(m=>!previousMessages.has(m.id)&&m.type==='narration'))throw Error('능력 행동의 실제 결과 서술이 필요합니다.');
   for(const a of r.actions)if(scopeIds.includes(a.id)&&a.abilityPlan){a.abilityPlan.narrated=true;a.powerNarrated=true;if(a.sourceRuling)a.sourceRulingNarrated=true;a.powerReportsNarrated=original.gmJob.reportCounts?.[a.id]||0;}
  }
  if(original.gmJob.kind!=='narration')queueAbilityNarration(r,scopeIds);
  if(original.gmJob.aquariumReports){
   if(!r.messages.some(m=>!previousMessages.has(m.id)&&m.type==='narration'))throw Error('유영어의 관찰 결과 서술이 필요합니다.');
   for(const a of r.actions)if(original.gmJob.reportCounts?.[a.id])a.powerReportsNarrated=original.gmJob.reportCounts[a.id];
  }
  queueAquariumReports(r);
  queueAwareness(r);r.gmUpdatedAt=new Date().toISOString();
  advanceActivities(r,randomDie);advanceCombatPlans(r,randomDie);queueDeclarations(r);queueCombatAI(r);resumeInterruptedActions(r);
  if(['turn','narration'].includes(original.gmJob.kind)&&original.gmJob.advanceTurn!==false&&!r.actions.some(a=>a.status!=='resolved')){r.turn.ready=[];r.turn.number++;}
  if(original.gmJob.kind==='preparation'&&original.gmJob.autoApply)markScenarioStart(r,'prepared');
  if(original.gmJob.kind==='storyDay'&&!(original.chronicle.playedDays||[]).some(day=>day.startsWith(original.gmJob.caseId+'/')))markScenarioStart(r,'opening');
 }catch(e){problem=e.message;}
 if(problem){r=structuredClone(original);for(const a of r.actions)if(original.gmJob.actionIds?.includes(a.id)&&a.status==='pending')(r.actionErrors??={})[a.id]={jobId:original.gmJob.id,message:String(problem).slice(0,1000)};r.gmJob={...r.gmJob,message:String(problem).slice(0,1000)};endProgress(r,'error');}
 delete r.gmJob.lease;r.version=Math.max(r.version,original.version)+1;
 if(!await store.save(r,original.version))return attempt<3?finishJob(store,roomId,lease,version,proposal,error,attempt+1):{ignored:true};
 // Report completion of this lease even when a separate follow-up is queued.
 return {status:r.gmJob.id!==original.gmJob.id?'done':r.gmJob.status,message:r.gmJob.id!==original.gmJob.id?proposal?.summary:r.gmJob.message,jobId:original.gmJob.id,appliedVersion:r.version,appliedState:gmSnapshot(r)};
}
export async function recoverJobs(store) {
 for(const r of await store.list())if(r.gmJob?.status==='running'){
  const copy=structuredClone(r);copy.version++;copy.gmJob.message='GM 실행기가 재시작되었습니다. 다시 시도해 주세요.';endProgress(copy,'error');await store.save(copy,r.version);
 }
}
export async function configureBridge(store,user,roomId,token) {
 const r=await store.get(roomId);if(!r)throw new TableError('테이블을 찾을 수 없습니다.',404);requireOwner(r,user);
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new TableError('연결 키 형식이 올바르지 않습니다.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const copy=structuredClone(r);copy.bridgeHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');copy.version++;
 if(!await store.save(copy,r.version))throw new TableError('다시 시도하세요.',409);return {ok:true};
}
export async function relayRequest(store,roomId,token,input) {
 const r=await store.get(roomId);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(token)));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(!r?.bridgeHash||hash!==r.bridgeHash)throw new TableError('연결 키를 확인하세요.',403);
 if(input.op==='backup'){
  if(['queued','running'].includes(r.gmJob?.status))throw new TableError('GM 작업이 끝난 뒤 백업하세요.',409);
  return {room:structuredClone(r)};
 }
 if(['saveScenarioStart','resetScenario'].includes(input.op)){
  const result=await scenarioCheckpointRequest(store,{id:r.owner,name:'세션 관리'},input,r);
  return {version:result.room.version,duplicate:result.duplicate,result:result.result};
 }
 if(['syncAquariumSheet','grantPredatorVisual','reconcileActions','rollbackTravel','restoreClue','resumeAquariumScout'].includes(input.op)){
  const mutation=mutateRoom(r,{id:r.owner,name:'세션 관리'},{op:input.op,payload:input.payload,requestId:input.requestId,expectedVersion:input.expectedVersion});
  if(!mutation.duplicate&&!await store.save(mutation.room,r.version))throw new TableError('세션이 변경되었습니다. 백업과 연결 상태를 다시 확인하세요.',409);
  return {version:mutation.room.version,duplicate:mutation.duplicate,result:mutation.result};
 }
 if(input.op==='heartbeat'){
  if(r.deletedAt||r.archivedAt)throw new TableError('진행 중인 테이블이 아닙니다.',409);
  await store.connectionWrite(roomId,new Date().toISOString());return {ok:true};
 }
 if(input.op==='campaigns')return {roomIds:(await store.list()).filter(x=>!x.deletedAt&&!x.archivedAt&&x.owner===r.owner&&x.bridgeHash===hash&&(x.id===r.id||x.bridgeParentId===r.id)).map(x=>x.id)};
 if(input.op==='progress')return progressJob(store,roomId,input.lease,input.stage);
 if(input.op==='library'){
  if(r.deletedAt||r.archivedAt)throw new TableError('진행 중인 세션에만 자료를 연결할 수 있습니다.',409);
  if(!Array.isArray(input.books)||input.books.length>100)throw new TableError('자료 목록을 확인하세요.');
  const books=input.books.map(b=>{
   if(!/^[a-f0-9]{24}$/.test(b.id)||typeof b.title!=='string'||b.title.length>150||!['rule','scenario','reference'].includes(b.kind)||!Number.isSafeInteger(b.pages)||b.pages<1||!Number.isSafeInteger(b.emptyPages)||b.emptyPages<0||b.emptyPages>b.pages||!/^[a-f0-9]{64}$/.test(b.digest)||!['pdf','text'].includes(b.format))throw new TableError('자료 정보를 확인하세요.');
   return {id:b.id,title:b.title,kind:b.kind,pages:b.pages,emptyPages:b.emptyPages,digest:b.digest,format:b.format};
  });
  if(new Set(books.map(b=>b.id)).size!==books.length)throw new TableError('중복된 자료입니다.');
  if(JSON.stringify(r.localLibrary?.books)===JSON.stringify(books))return {ok:true};
  if(r.gmJob?.status==='running')throw new TableError('GM 작업이 끝난 뒤 자료를 갱신하세요.',409);
  const copy=structuredClone(r);extendLocalSelection(copy,books);copy.localLibrary={books,updatedAt:new Date().toISOString()};copy.version++;
  if(!await store.save(copy,r.version))throw new TableError('다시 시도하세요.',409);
  return {ok:true};
 }
 if(input.op==='claim')return await claimJob(store,roomId)||{idle:true};
 if(input.op==='status')return {running:r.gmJob?.status==='running'&&r.gmJob?.lease===input.lease};
 if(input.op==='finish')return finishJob(store,roomId,input.lease,input.version,input.proposal,input.error);
 throw new TableError('지원하지 않는 GM 통신입니다.');
}
