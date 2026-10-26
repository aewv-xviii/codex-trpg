import {offMapPosition} from '../public/play/off-map-state.js';
import {clearLine} from '../public/play/exploration-geometry.js';
const fail=m=>{throw Error(m);};
export function sceneKey(r){const key=[r.chronicle?.activeCaseId,r.mapId,r.worldLibrary?.placeId,r.scene?.title].join('|');if(r.aquariumScene?.key!==key)r.aquariumScene={key,epoch:(r.aquariumScene?.epoch||0)+1};return key+'|'+r.aquariumScene.epoch;}
// Ending an abstract encounter must not erase its still-running summons' frame.
// A changed scene or moved map token invalidates the old actor location.
export function retainAquariumSpace(r){
 const b=r.combat;if(!b?.theater)return;
 const referenced=r.characters.some(c=>(c.aquarium?.fish||[]).some(f=>f.position?.space==='combat:'+b.id));
 if(!referenced)return;
 b.aquariumFrame={scene:sceneKey(r),mapPositions:Object.fromEntries(Object.keys(b.theater.positions).map(id=>[id,position(r,id,'map:'+r.mapId)]))};
}
export function position(r,id,space=null){
 const detached=offMapPosition(r,id);if(detached)return {space:'offmap:'+id,characterId:id,x:0,y:0};
 // A fish may retain its map position when abstract combat begins. Resolve
 // command distance in that same space; never compare it to theater offsets.
 if(space?.startsWith('map:')){
  const map=r.maps.find(m=>m.id===r.mapId&&'map:'+m.id===space),t=map?.tokens.find(t=>t.characterId===id&&!t.hidden);
  return t&&map.distanceUnit==='yd'?{space,x:t.x*map.columns*map.unit,y:t.y*map.rows*map.unit}:null;
 }
 if(space?.startsWith('combat:')){
  const b=r.combat;
  if(space!=='combat:'+b?.id||!Number.isFinite(b.theater?.positions[id]))return null;
  if(b.status!=='active'){
   const frame=b.aquariumFrame;if(!frame||frame.scene!==sceneKey(r))return null;
   const before=frame.mapPositions[id],now=position(r,id,'map:'+r.mapId);
   if(before||now){if(!before||!now||yards(before,now)!==0)return null;}
  }
  return {space,x:b.theater.positions[id],y:0};
 }
 if(r.combat?.status==='active'&&r.combat.theater&&Number.isFinite(r.combat.theater.positions[id]))return {space:'combat:'+r.combat.id,x:r.combat.theater.positions[id],y:0};
 const map=r.maps.find(m=>m.id===r.mapId),t=map?.tokens.find(t=>t.characterId===id&&!t.hidden);
 if(t&&map.distanceUnit==='yd')return {space:'map:'+map.id,x:t.x*map.columns*map.unit,y:t.y*map.rows*map.unit};
 const fish=r.characters.flatMap(c=>c.aquarium?.fish||[]).find(f=>f.id===id);return fish?.position||null;
}
export const yards=(a,b)=>a&&b&&a.space===b.space?Math.hypot(a.x-b.x,a.y-b.y):Infinity;
export function commandDistance(r,actorId,fish,declared){
 const origin=position(r,actorId,fish.position?.space);
 if(origin&&fish.position){const distance=yards(origin,fish.position);if(Number.isFinite(distance))return distance;}
 // Narrative distance is acceptable only without contradictory measured frames.
 if(fish.position&&(position(r,actorId)||fish.position.space?.startsWith('combat:')))throw Error('물고기와 주인의 위치 좌표계가 연결되지 않았습니다. 명령 판정·시간 소모 없이 중단했습니다. 현재 장면의 실제 위치를 먼저 연결하세요.');
 if(!Number.isFinite(declared)||declared<0)throw Error('유한한 명령 거리 근거가 필요합니다.');
 return declared;
}
export function visibleLine(r,a,b){
 if(!a||!b||a.space!==b.space)return false;if(a.space.startsWith('offmap:'))return true;if(a.space.startsWith('combat:'))return true;
 const map=r.maps.find(m=>'map:'+m.id===a.space);return !!map&&clearLine(map,{x:a.x/(map.columns*map.unit),y:a.y/(map.rows*map.unit)},{x:b.x/(map.columns*map.unit),y:b.y/(map.rows*map.unit)});
}
export function fishPath(r,fish,path){
 if(!fish.position||!Array.isArray(path)||!path.length||path.length>40)fail('물고기의 현재 위치와 이동 경로가 필요합니다.');
 const out=[{...fish.position}],map=r.maps.find(m=>'map:'+m.id===fish.position.space);
 for(const p of path){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10000||Math.abs(p.y)>10000)fail('이동 좌표를 확인하세요.');const next={...fish.position,x:p.x,y:p.y};if(map&&(p.x<0||p.y<0||p.x>map.columns*map.unit||p.y>map.rows*map.unit))fail('지도 밖으로 이동할 수 없습니다.');if(!visibleLine(r,out.at(-1),next))fail('물고기는 벽·닫힌 문을 통과할 수 없습니다.');out.push(next);}
 return out;
}
export const pathLength=path=>path.slice(1).reduce((n,p,i)=>n+yards(path[i],p),0);
export function along(path,distance){for(let i=1;i<path.length;i++){const d=yards(path[i-1],path[i]);if(distance<=d){const t=d?distance/d:1;return {...path[i],x:path[i-1].x+(path[i].x-path[i-1].x)*t,y:path[i-1].y+(path[i].y-path[i-1].y)*t};}distance-=d;}return {...path.at(-1)};}
export function zoneVision(r,fromId,toId){
 const a=position(r,fromId),b=position(r,toId);if(!a||!b||a.space!==b.space)return 0;
 return (r.aquariumZones||[]).some(z=>{if(z.scene!==sceneKey(r)||z.position.space!==a.space||z.remainingSeconds<=0)return false;const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((z.position.x-a.x)*dx+(z.position.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(a.x+t*dx-z.position.x,a.y+t*dy-z.position.y)<=z.radius;})?-2:0;
}
