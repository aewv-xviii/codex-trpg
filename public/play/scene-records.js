import {displayMessages} from './message-presentation.js';
import {isGMQuestion} from './message-purpose.js';
import {periods} from './story-state.js';
import {sceneCast} from './scene-cast.js';
export const scenic=m=>!m.recipient&&m.channel!=='admin'&&!isGMQuestion(m)&&['narration','npcDialogue','dialogue','gm'].includes(m.type);
export const recordable=m=>!m.recipient&&m.channel!=='admin'&&!['request','adminReply','adjudication','system','whisper','gmQuestion'].includes(m.type)&&!isGMQuestion(m);
export function sceneRecords(room){
 let place='',title='',visit='legacy',lastScope='';
 return displayMessages(room).filter(recordable).map(m=>{
  const s=room.sceneArchive?.snapshots?.[m.sceneSnapshotId];
  const scope=(m.caseId||'')+'/'+(m.gameClock?.date||'');
  if(scope!==lastScope){place='';title='';visit=m.id;lastScope=scope;}
  if(s){place=s.placeId;title=s.title;visit=m.sceneVisitId||visit;}
  else if(m.placeId||m.sceneTitle){const next=m.placeId||m.sceneTitle;if(next!==(place||title)||m.locationArrival)visit=m.id;place=m.placeId||'';title=m.sceneTitle||room.worldLibrary?.definition?.places?.find(p=>p.id===place)?.name||place;}
  const time=m.gameClock?.time||'',phase=time?periods.filter(p=>p.hour<=Number(time.slice(0,2))).at(-1)?.name:'';
  return {...m,recordPlaceId:place,recordTitle:title||'장소 미기록',recordVisit:m.sceneVisitId||visit,recordPhase:phase};
 });
}
export function sceneSegments(room,filter={}){
 const groups=[];
 // Replay shows the performed scene, not the player's instructions or rolls.
 // Derive location metadata first, so filtering cannot shift later dialogue.
 for(const m of sceneRecords(room).filter(scenic)){
  // Older logs lack arrival metadata. Keep different game times separate until
  // the GM assigns their historical places, avoiding a mixed arrival segment.
  const key=[m.caseId||'',m.gameClock?.date||'',m.recordPhase,m.recordPlaceId||m.recordTitle,m.recordVisit,m.sceneSnapshotId?'':m.gameClock?.time||''].join('/');
  let g=groups.at(-1);
  if(!g||g.key!==key){g={key,id:m.id,caseId:m.caseId||'',date:m.gameClock?.date||'',time:m.gameClock?.time||'',phase:m.recordPhase,placeId:m.recordPlaceId,title:m.recordTitle,messages:[]};groups.push(g);}
  g.messages.push(m);g.endTime=m.gameClock?.time||g.time;
 }
 return groups.filter(g=>(filter.date===undefined||g.date===filter.date)&&(filter.caseId===undefined||g.caseId===filter.caseId)&&(!filter.place||g.title===filter.place)&&(!filter.phase||g.phase===filter.phase));
}
export function recordedScene(room,beat){
 const archive=room.sceneArchive,s=archive?.snapshots?.[beat.sceneSnapshotId];
 const scene={placeId:s?.placeId||beat.recordPlaceId||beat.placeId||'historical',title:s?.title||beat.recordTitle||beat.sceneTitle||'장소 미기록',background:s?archive.assets[s.background]||'':'',speaker:beat.name,speakerId:beat.speakerId||'',expressionId:beat.expressionId||'',narration:beat.text};
 let cast=['left','right'].map(side=>{const c=s?.cast?.find(c=>c.side===side);return c?{...c,portrait:c.portrait?{...c.portrait,image:archive.assets[c.portrait.image]||''}:null}:{side,person:null,portrait:null};});
 // Legacy background-only reconstruction never captured portraits. Use the
 // registered portraits for speakers already encountered in this location.
 // A complete historical snapshot (including an intentionally empty cast) wins.
 if(!s||s.reconstructed){
  const records=sceneRecords(room),end=records.findIndex(m=>m.id===beat.id);
  let start=Math.max(0,end);
  const samePlace=m=>(m.caseId||'')===(beat.caseId||'')&&m.gameClock?.date===beat.gameClock?.date&&(m.recordPlaceId||m.recordTitle)===(beat.recordPlaceId||beat.recordTitle);
  while(start>0&&samePlace(records[start-1]))start--;
  const history=end>=0?records.slice(start,end+1):[beat];
  cast=sceneCast({...room,scene,messages:history,_historical:true,_recordedCast:undefined,_combatView:undefined});
 }
 return {...room,scene,_recordedCast:cast,_historical:true,_recordedClock:beat.gameClock,_missingScene:!s};
}
