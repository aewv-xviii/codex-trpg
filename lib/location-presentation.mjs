import {placeLabel} from '../public/play/world-format.js';
import {canControl} from '../public/play/character-control.js';
import {center,clearLine,index} from '../public/play/exploration-geometry.js';
const unique=(list,predicate)=>{const found=(list||[]).filter(predicate);return found.length===1?found[0]:null;};
export function placePresentation(r,place){
 if(!place)return null;
 const preset=(place.sceneId&&(r.scenePresets||[]).find(s=>s.id===place.sceneId))||unique(r.scenePresets,s=>s.placeId===place.id)||unique(r.scenePresets,s=>s.title===place.name);
 const map=(place.mapId&&r.maps.find(m=>m.id===place.mapId))||unique(r.maps,m=>m.placeId===place.id)||unique(r.maps,m=>m.title===place.name);
 return {placeId:place.id,title:placeLabel(place.name),description:place.description||'',mapId:map?.id||'',background:preset?.background||map?.sceneBackground||'',speaker:'GM',speakerId:'',expressionId:'',narration:place.description||'',npcIds:place.npcIds||[]};
}
export function actorPlaceId(r,id){return r.worldLibrary?.characterPlaces?.[id]||r.worldLibrary?.placeId;}
export function viewerActorId(r,u){return r.members.find(m=>m.id===u?.id)?.activeCharacterId||r.characters.find(c=>canControl(c,u))?.id;}
export function actorMapId(r,id){
 if(!r.worldLibrary)return r.mapId;
 return placePresentation(r,r.worldLibrary.definition.places.find(p=>p.id===actorPlaceId(r,id)))?.mapId||'';
}
export function withActorMap(r,id,run){
 const mapId=actorMapId(r,id);if(!mapId)throw Object.assign(Error('현재 장소에는 준비된 지도가 없습니다.'),{status:400});
 const previous=r.mapId;r.mapId=mapId;try{return run();}finally{r.mapId=previous;}
}
export function placeArrivingTokens(r,mapId,actorIds){
 const map=r.maps.find(m=>m.id===mapId);if(!map)return;
 for(const id of actorIds){
  const character=r.characters.find(c=>c.id===id);if(!character||map.tokens.some(t=>t.characterId===id))continue;
  if(map.tokens.length>=40)throw Object.assign(Error('도착 지도의 토큰 한도입니다.'),{status:400});
  let point={x:.25+actorIds.indexOf(id)*.15,y:.8};
  if(map.exploration){const entry=map.exploration.entry;point=Array.from({length:map.columns*map.rows},(_,i)=>center(map,i)).sort((a,b)=>Math.hypot(a.x-entry.x,a.y-entry.y)-Math.hypot(b.x-entry.x,b.y-entry.y)).find(p=>clearLine(map,entry,p)&&!map.tokens.some(t=>index(map,t)===index(map,p)));if(!point)throw Error('출입구 근처에 인물을 배치할 공간이 없습니다.');}
  map.tokens.push({id:crypto.randomUUID(),characterId:id,name:character.name,...point,hidden:false});
 }
}
