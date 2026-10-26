// A player character belongs to its account. A companion has one controller.
export const isCompanion=c=>c?.isNPC===true&&c.companion?.status==='recruited';
export const rosterEligible=c=>!!c&&(!c.isNPC||isCompanion(c));
export const controllerId=c=>c?.isNPC?(c.controllers?.[0]||c.owner):c?.owner;
export const canControl=(c,user)=>!!c&&!!user?.id&&controllerId(c)===user.id;
export const partyCharacters=room=>{
 const ids=room?.partyCharacterIds??room?.characters?.slice(0,4).map(c=>c.id)??[];
 return ids.map(id=>room.characters.find(c=>c.id===id)).filter(rosterEligible);
};
