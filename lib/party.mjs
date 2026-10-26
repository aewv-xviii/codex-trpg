import {canControl,partyCharacters,rosterEligible} from '../public/play/character-control.js';
const bad=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function normalizeParty(room){
 room.partyCharacterIds=[...new Set(room.partyCharacterIds??room.characters.filter(rosterEligible).slice(0,4).map(c=>c.id))].filter(id=>room.characters.some(c=>c.id===id&&rosterEligible(c))).slice(0,4);
 for(const m of room.members){
  if(!partyCharacters(room).some(c=>c.id===m.activeCharacterId&&canControl(c,m)))m.activeCharacterId=partyCharacters(room).find(c=>canControl(c,m))?.id||'';
 }
}
export function addPartyCharacter(room,c){
 if(rosterEligible(c)&&room.partyCharacterIds.length<4){room.partyCharacterIds.push(c.id);room.members.find(m=>m.id===c.owner).activeCharacterId=c.id;}
}
export function setPartyCharacter(room,user,p){
 const c=room.characters.find(c=>c.id===p.characterId);
 if(!c)bad('캐릭터를 찾을 수 없습니다.');
 if(!rosterEligible(c))bad('GM이 영입을 확정한 동료만 파티에 참가할 수 있습니다.');
 if(c.isNPC&&['queued','running'].includes(room.gmJob?.status))bad('진행 중인 GM 처리를 마친 뒤 동료 편성을 변경하세요.',409);
 if(!canControl(c,user)&&!(c.isNPC&&room.owner===user.id))bad('본인 또는 맡은 동료의 파티 참가만 변경할 수 있습니다.',403);
 if(typeof p.inParty!=='boolean')bad('파티 참가 여부를 확인하세요.');
 const included=room.partyCharacterIds.includes(c.id);
 if(p.inParty&&!included){
  if(room.partyCharacterIds.length>=4)bad('파티는 최대 4명입니다. 먼저 다른 캐릭터를 대기시켜 주세요.');
  room.partyCharacterIds.push(c.id);
 }else if(!p.inParty&&included){
  if(room.actions.some(a=>a.actorId===c.id&&a.status!=='resolved'))bad('이 캐릭터의 대기 행동을 마친 뒤 대기시키세요.');
  room.partyCharacterIds=room.partyCharacterIds.filter(id=>id!==c.id);
 }
 room.turn.ready=[];normalizeParty(room);return {};
}
