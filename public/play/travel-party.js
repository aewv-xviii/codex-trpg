// Travel membership is independent from whose action/turn initiates it.
export function travelScope(action){
 if(action.travelScope)return action.travelScope;
 return /^(?:나는\s+|나만\s+)?혼자(?:서)?\s+(?!아니|말고)/.test(action.text||'')?'solo':'party';
}
export function travelActorIds(room,action){
 if(travelScope(action)==='solo'||!room.partyCharacterIds.includes(action.actorId))return [action.actorId];
 return room.partyCharacterIds.filter(id=>room.characters.some(c=>c.id===id));
}
