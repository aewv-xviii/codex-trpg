// Location evidence wins over old portraits, dialogue, and stale map tokens.
export function npcPresent(room,person,placeId=room?.location?.placeId||room?.scene?.placeId||room?.worldLibrary?.placeId,mapId=room?.location?.mapId||room?.scene?.mapId||room?.mapId){
 if(!person)return false;
 if((room?.characters||[]).some(c=>c.id===person.id&&!c.isNPC))return true;
 const w=room?.worldLibrary,known=w?.characterPlaces?.[person.id]||person.placeId;
 if(known&&placeId)return known===placeId;
 if(person.companion?.status==='recruited'&&room?.partyCharacterIds?.includes(person.id)&&room?.maps?.some(m=>m.id===mapId&&m.tokens?.some(t=>t.characterId===person.id&&!t.hidden)))return true;
 if(person.mapId&&mapId)return person.mapId===mapId;
 const home=(w?.definition?.places||[]).filter(p=>(p.npcIds||[]).some(id=>id===person.id||`world:${w.definition.id}:${id}`===person.id));
 if(home.length&&placeId)return home.some(p=>p.id===placeId);
 const maps=(room?.maps||[]).filter(m=>m.tokens?.some(t=>t.characterId===person.id));
 if(maps.length&&mapId)return maps.some(m=>m.id===mapId&&m.tokens.some(t=>t.characterId===person.id&&!t.hidden));
 // Legacy cast-only NPCs stay at their first recorded appearance until moved
 // by an explicit location update or confirmed party membership/travel.
 for(const m of room?.messages||[]){
  if(m.speakerId!==person.id||!['npcDialogue','dialogue','gm'].includes(m.type))continue;
  const snapshot=room.sceneArchive?.snapshots?.[m.sceneSnapshotId];
  const recorded=m.recordPlaceId||m.placeId||snapshot?.placeId;
  if(recorded&&placeId)return recorded===placeId;
  const recordedMap=snapshot?.mapId;
  if(recordedMap&&mapId)return recordedMap===mapId;
 }
 return true;
}
