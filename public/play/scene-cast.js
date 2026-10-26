import {npcPresent} from './npc-presence.js';
import {battlePair} from './combat-view.js';
function sceneHistory(room){
 const scene=room?.scene||{},placeId=scene.placeId||room?.location?.placeId||'',title=scene.title||room?.location?.title||'';
 const publicMessages=(room?.messages||[]).filter(m=>!m.recipient&&m.channel!=='admin'&&(!room?.chronicle||room._historical||(m.caseId||'')===(room.chronicle.activeCaseId||'')));
 const scoped=!!placeId||!!title&&publicMessages.some(m=>m.placeId||m.recordPlaceId||m.sceneTitle||m.sceneSnapshotId);
 if(!scoped)return {history:publicMessages,placeId,scoped};
 let history=[],place='',placeTitle='',lastVisit='';
 for(const m of publicMessages){
  const snapshot=room.sceneArchive?.snapshots?.[m.sceneSnapshotId];
  const nextPlace=m.recordPlaceId||m.placeId||snapshot?.placeId,nextTitle=m.recordTitle||m.sceneTitle||snapshot?.title;
  if(nextPlace||nextTitle){place=nextPlace||'';placeTitle=nextTitle||'';}
  if(placeId?place!==placeId:placeTitle!==title)continue;
  const visit=m.sceneVisitId||m.recordVisit;
  if(m.locationArrival||(visit&&lastVisit&&visit!==lastVisit))history=[];
  if(visit)lastVisit=visit;
  history.push(m);
 }
 return {history,placeId,scoped};
}
// Derive positions from shared history so reconnecting clients agree.
export function sceneCast(room,focusId){
 if(room?._recordedCast&&!room._combatView)return room._recordedCast;
 const slots={left:null,right:null};let last='',side='left';
 const people=[...(room?.characters||[]),...(room?.cast||[])];
 const portraitFor=(id,expressionId)=>{
  const portraits=people.find(person=>person.id===id)?.portraits||[];
  return portraits.find(p=>p.id===expressionId&&p.image?.trim())||portraits.find(p=>p.image?.trim());
 };
 const visit=(id,expressionId,presentation)=>{
  if(presentation?.identified===false)return;
  // Speech without an image must not displace either visible portrait.
  if(!id||!portraitFor(id,expressionId)||!room?._historical&&!npcPresent(room,people.find(p=>p.id===id)))return;
  if(id!==last){side=side==='left'?'right':'left';last=id;}
  // A returning speaker always occupies the opposite side of the last speaker.
  for(const key of ['left','right'])if(key!==side&&slots[key]?.id===id)slots[key]=null;
  slots[side]={id,expressionId};
 };
 const {history,placeId,scoped}=sceneHistory(room);
 for(const m of history)if(['dialogue','gm','npcDialogue'].includes(m.type))visit(m.speakerId,m.expressionId,m.speakerPresentation);
 const scene=room?.scene||{};
 const latest=history.findLast(m=>m.speakerId===scene.speakerId);
 visit(scene.speakerId,scene.expressionId,latest?.speakerPresentation);
 // Local conversation preview adds the selected listener without inventing dialogue.
 const localFocus=!scoped||history.some(m=>m.speakerId===focusId)||scene.speakerId===focusId||
  !!placeId&&(room?.worldLibrary?.characterPlaces?.[focusId]===placeId||
   (scene.npcIds||[]).some(id=>id===focusId||`world:${room?.worldLibrary?.definition?.id}:${id}`===focusId)||
   (room?.maps||[]).some(map=>(map.placeId===placeId||map.id===scene.mapId)&&map.tokens?.some(t=>t.characterId===focusId&&!t.hidden)));
 if(localFocus&&npcPresent(room,people.find(p=>p.id===focusId))&&portraitFor(focusId)&&!Object.values(slots).some(v=>v?.id===focusId)){
  const available=['left','right'].find(key=>!slots[key])||(['left','right'].find(key=>slots[key]?.id!==scene.speakerId))||'left';
  slots[available]={id:focusId};
 }
 if(room?._combatView){
  const pair=battlePair(room._combatView);
  if(pair){slots.left=null;slots.right=null;for(const id of pair){const side=room._combatView.combat.fighters[id]?.team==='party'?'left':'right';if(!slots[side]&&portraitFor(id))slots[side]={id};}}
 }
 return Object.entries(slots).map(([side,entry])=>{
  const person=people.find(p=>p.id===entry?.id);
  const portrait=portraitFor(entry?.id,entry?.expressionId);
  return {side,person,portrait,active:!!person&&person.id===(room?._combatView?battlePair(room._combatView)?.[0]:scene.speakerId)};
 });
}
