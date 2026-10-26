import {npcPresent} from './npc-presence.js';
export const playerCharacter=c=>!!c&&(!c.isNPC||!!c.controllers?.length);
export function partyDialogue(room,p){
 if(p.kind!=='dialogue')return false;
 if(p.targetId)return (room?.characters||[]).some(c=>c.id===p.targetId&&playerCharacter(c));
 return p.askGM!==true;
}
export function normalizeDialogueTarget(room,target){
 if((room?.characters||[]).some(c=>c.id===target&&playerCharacter(c)))return '';
 return target&&target!=='@gm'&&!dialogueTargets(room).some(c=>c.id===target)?'@gm':target;
}
// Input is the server-filtered public room; token position is not a dialogue prerequisite.
export function dialogueTargets(room,actorId){
 const hidden=new Set((room?.maps||[]).flatMap(m=>(m.tokens||[]).filter(t=>t.hidden).map(t=>t.characterId)));
 return [...(room?.characters||[]).filter(c=>!playerCharacter(c)),...(room?.cast||[])].filter(c=>c.id!==actorId&&npcPresent(room,c)&&(!hidden.has(c.id)||c.contentRevealed));
}
