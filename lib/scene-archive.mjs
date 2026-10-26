import {sceneCast} from '../public/play/scene-cast.js';
import {recordable} from '../public/play/scene-records.js';
import {placePresentation,actorPlaceId} from './location-presentation.mjs';
import {imageSource} from './presentation.mjs';
// Only presentation data: never retain sheets, secrets, world sources or commands.
export function captureScenes(room,start=0,override=null){
 const archive=room.sceneArchive||={version:1,assets:{},snapshots:{}};
 const images=new Map(Object.entries(archive.assets).map(([id,value])=>[value,id]));
 const states=new Map(Object.entries(archive.snapshots).map(([id,value])=>[JSON.stringify(value),id]));
 const asset=value=>{if(!value)return '';if(value==='alley')value='/play/alley.png';if(!images.has(value)){const id=crypto.randomUUID();images.set(value,id);archive.assets[id]=value;}return images.get(value);};
 const previous=new Map();
 for(let i=0;i<room.messages.length;i++){
  const m=room.messages[i];if(!recordable(m))continue;
  if(override&&(i<override.from||i>override.to))continue;
  const person=room.characters.find(c=>c.id===m.speakerId),actor=person&&!person.isNPC?person.id:room.gmJob?.actorId;
  const placeId=override?.placeId||m.placeId||actorPlaceId(room,actor)||room.scene.placeId||'';
  const p=room.worldLibrary?.definition?.places?.find(p=>p.id===placeId);
  const source=override||(!placeId||room.scene.placeId===placeId?room.scene:room.worldLibrary?.presentations?.[placeId]||placePresentation(room,p))||room.scene;
  const title=source.title||m.sceneTitle||p?.name||'장소 미기록';
  const key=[m.caseId||'',m.gameClock?.date||'',placeId||title].join('/');
  let visit=previous.get(key);
  if(m.sceneVisitId)visit=m.sceneVisitId;
  if(!visit||m.locationArrival)visit=m.id;
  previous.set(key,visit);
  if(i<start||m.sceneSnapshotId)continue;
  const history=room.messages.slice(0,i+1).filter(x=>recordable(x)&&(x.sceneVisitId===visit||x.id===m.id));
  const scene={...source,speaker:m.name,speakerId:m.speakerId||'',expressionId:m.expressionId||''};
  const cast=override?[]:sceneCast({...room,messages:history,scene}).map(c=>({side:c.side,active:c.active,person:c.person?{id:c.person.id,name:c.person.name}:null,portrait:c.portrait?{id:c.portrait.id,label:c.portrait.label,image:asset(c.portrait.image)}:null}));
  // Pack assets get historical access only when tied to an immutable template,
  // never merely because an arbitrary image URL was typed into a scene.
  const contentAssets=[];
  const map=room.maps.find(m=>m.id===(source.mapId||room.mapId));
  for(const pack of room.contentPacks||[]){
   if(map?.contentRef?.packId===pack.id){const template=pack.maps.find(x=>x.id===map.contentRef.mapId);const id=pack.assets[template?.background];if(id&&source.background===`/api/table?room=${room.id}&asset=${id}`)contentAssets.push(id);}
   for(const entry of cast){const person=room.characters.find(c=>c.id===entry.person?.id);if(person?.contentRef?.packId!==pack.id)continue;const template=pack.actors.find(x=>x.id===person.contentRef.actorId),id=pack.assets[template?.portrait];if(id&&archive.assets[entry.portrait?.image]===`/api/table?room=${room.id}&asset=${id}`)contentAssets.push(id);}
  }
  const snapshot={placeId,title,background:asset(source.background),cast,contentAssets,...(override?{reconstructed:true}:{})};
  const encoded=JSON.stringify(snapshot);let id=states.get(encoded);
  if(!id){id=crypto.randomUUID();states.set(encoded,id);archive.snapshots[id]=snapshot;}
  m.sceneSnapshotId=id;m.sceneVisitId=visit;m.placeId=placeId;m.sceneTitle=title;
 }
}
export function projectSceneArchive(room){
 if(!room.sceneArchive)return;
 const source=room.sceneArchive,snapshots={},assets={};
 for(const m of room.messages){if(!recordable(m))continue;const s=source.snapshots[m.sceneSnapshotId];if(!s)continue;snapshots[m.sceneSnapshotId]=s;
  for(const id of [s.background,...s.cast.map(c=>c.portrait?.image)])if(id&&Object.hasOwn(source.assets,id))assets[id]=source.assets[id];
 }
 room.sceneArchive={version:1,snapshots,assets};
}
export function linkLegacyScene(room,p){
 const from=room.messages.findIndex(m=>m.id===p.from),to=room.messages.findIndex(m=>m.id===p.to);
 const place=room.worldLibrary?.definition?.places?.find(x=>x.id===p.placeId);
 if(from<0||to<from||!place)throw Error('기록 범위와 장소를 확인하세요.');
 const background=imageSource(p.background||'');
 captureScenes(room,from,{from,to,placeId:place.id,title:place.name,background});
}
