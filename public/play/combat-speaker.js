// Legacy structured attack logs only. Never guess a speaker from the current turn.
export function combatSpeaker(room,message){
 if(message.type!=='combat'||message.speakerId)return message.speakerId||'';
 const e=message.combatDetails?.event;if(!e)return '';
 const candidates=(room.characters||[]).filter(c=>[e.actorId,e.targetId].includes(c.id)&&[c.name+' · ',c.name+' → '].some(prefix=>message.text?.startsWith(prefix)));
 return candidates.length===1?candidates[0].id:'';
}
