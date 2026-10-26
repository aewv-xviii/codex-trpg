import {combatIdentityText,npcPresentation} from './npc-identity.mjs';
export function combatLog(r,body,combatDetails,actorId){
 const actor=[...(r.characters||[]),...(r.characters||[]).flatMap(c=>c.aquarium?.fish||[])].find(c=>c.id===actorId);
 const presentation=actor?npcPresentation(actor):null;
 r.messages.push({gameClock:structuredClone(r.chronicle?.clock||null),id:crypto.randomUUID(),type:'combat',name:presentation?.name||'전투',author:r.owner,text:combatIdentityText(r,body),at:new Date().toISOString(),caseId:r.chronicle?.activeCaseId,combatId:r.combat?.id,
  ...(actor?{speakerId:actor.id,expressionId:actor.expressionId||'',speakerPresentation:presentation}:{}),...(combatDetails?{combatDetails}:{})});
}
