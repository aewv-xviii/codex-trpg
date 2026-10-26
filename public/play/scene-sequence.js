import {isGMQuestion} from './message-purpose.js';
import {sceneRecords,recordedScene} from './scene-records.js';
const scenic=m=>!isGMQuestion(m)&&['narration','npcDialogue','dialogue','gm'].includes(m.type)&&!m.recipient&&m.channel!=='admin';
// Keep the whole current case readable, including player lines between GM batches.
export function sceneSequence(room,cursor){
 const messages=sceneRecords(room),caseId=room?.chronicle?.activeCaseId||'';
 const beats=messages.filter(m=>scenic(m)&&(m.caseId||'')===caseId);
 if(!beats.length)return {room:isGMQuestion({type:'narration',text:room?.scene?.narration})?{...room,scene:{...room.scene,narration:''}}:room,beats:[],index:0,key:''};
 const local=beats.filter(m=>!room.location||m.recordPlaceId===room.location.placeId||m.recordTitle===room.location.title),latest=local.at(-1)||beats.at(-1),key=room.id+'/case/'+caseId;
 const current=cursor?.messageId?beats.findIndex(m=>m.id===cursor.messageId):-1;
 // Remember the last available local line separately from the selected line.
 // New dialogue wins over an old manual/unread/restored reading position.
 const updated=typeof cursor?.latestId==='string'&&cursor.latestId!==latest.id;
 const held=current>=0&&(cursor.manual||cursor.hasUnread||cursor.restored||cursor.messageId===latest.id);
 let index=updated?beats.indexOf(latest):held?current:cursor?.key===key&&!cursor.messageId?Math.max(0,Math.min(cursor.index||0,beats.length-1)):
  latest.gmResponseId?beats.findIndex(m=>m.gmResponseId===latest.gmResponseId):beats.indexOf(latest);
 const beat=beats[index],end=messages.indexOf(beat);
 const atLive=beat.id===latest.id&&(!room.location||beat.recordPlaceId===room.location.placeId||beat.recordTitle===room.location.title);
 const view=atLive?{...room,scene:{...room.scene,speaker:beat.name,speakerId:beat.speakerId||'',expressionId:beat.expressionId||'',narration:beat.text}}:recordedScene(room,beat);
 // A new, empty location must not borrow the last location's dialogue.
 if(!local.length&&room.location&&!cursor?.messageId)return {key,index:0,beats:[],room};
 return {key,index,beats,latestId:latest.id,updated,room:{...view,messages:messages.slice(0,end+1)}};
}
