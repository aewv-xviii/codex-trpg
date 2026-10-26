import {offMapPosition} from '../public/play/off-map-state.js';
import {yards,clearLine,lineBlockers,findPaths,insideBounds} from '../public/play/exploration-geometry.js';
import {actorMapId} from './location-presentation.mjs';

const round=n=>Math.round(n*100)/100;
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const midpoint=b=>({x:(b.min.x+b.max.x)/2,y:(b.min.y+b.max.y)/2});
// Read-only GM evidence. Clear geometry is not successful perception or permission to attack.
export function spatialContext(r){
 const actorId=r.gmJob?.actorId||r.actions?.find(a=>(r.gmJob?.actionIds||[]).includes(a.id))?.actorId||r.partyCharacterIds?.[0];
 const mapId=actorId?actorMapId(r,actorId):r.mapId,m=r.maps?.find(m=>m.id===mapId);
 const detached=offMapPosition(r,actorId);
 const base={version:1,actorId:actorId||null,mapId:mapId||null,stateVersion:r.version,notice:'Server geometry only. Clear sight line does not reveal identity or defeat stealth. Do not invent coordinates, paths, cover bonuses or missing geometry. Paths are grid routes to cell centers, not automatic movement. Recompute after movement or door changes.'};
 if(detached)return {...base,status:'off-map-approximate',position:detached,notice:'GM-adjudicated approximate distance to the scene. Detailed wall/window LOS is deferred; no local path or precise target coordinates. Same scene is not physical reach.'};
 if(!m)return {...base,status:'unavailable',reason:'no-current-map'};
 if(m.distanceUnit!=='yd'||!Number.isFinite(m.unit)||m.unit<=0||!Number.isSafeInteger(m.columns)||!Number.isSafeInteger(m.rows))return {...base,status:'unavailable',reason:'unverified-scale'};
 const e=m.exploration,origin=m.tokens?.find(t=>t.characterId===actorId&&t.positionReviewed!==false&&valid(t));
 const result={...base,status:e?'structured':'coordinates-only',title:m.title,scale:{unit:'yd',yardsPerCell:m.unit,widthYards:m.columns*m.unit,heightYards:m.rows*m.unit},areas:e?.areas||[],walls:e?.walls||[],covers:e?.covers||[],origin:origin?{x:origin.x,y:origin.y}:null};
 if(r.combat?.status==='active'&&r.combat.theater)return {...result,status:'abstract-combat',reason:'Map tokens are not the current theater positions; do not use these map distances for combat.',relations:[],routes:[]};
 if(!origin)return {...result,status:'unavailable',reason:'missing-actor-position',relations:[],routes:[]};
 result.unplacedCharacterIds=(m.tokens||[]).filter(t=>t.positionReviewed===false||!valid(t)).map(t=>t.characterId);
 const candidates=(m.tokens||[]).filter(t=>t.characterId!==actorId&&!t.offMap&&t.positionReviewed!==false&&valid(t)&&(!r.worldLibrary||actorMapId(r,t.characterId)===m.id));
 const targets=candidates.slice(0,60);
 result.truncated=candidates.length>targets.length;
 result.origin.areaIds=(e?.areas||[]).filter(a=>insideBounds(origin,a.bounds)).map(a=>a.id);
 result.relations=targets.map(t=>({targetId:t.characterId,distanceYards:round(yards(m,origin,t)),areaIds:(e?.areas||[]).filter(a=>insideBounds(t,a.bounds)).map(a=>a.id),lineOfSight:e?{clear:clearLine(m,origin,t),blockedBy:lineBlockers(m,origin,t),withinExplorationSight:yards(m,origin,t)<=e.sight}:null}));
 result.routes=[];
 if(!e||m.columns>40||m.rows>40)return result;
 const destinationId=r.gmJob?.targetId;
 const destinations=[...targets.slice().sort((a,b)=>(b.characterId===destinationId)-(a.characterId===destinationId)).slice(0,6).map(t=>({kind:'character',id:t.characterId,point:t})),...(e.areas||[]).slice(0,6).map(a=>({kind:'area',id:a.id,point:midpoint(a.bounds)}))];
 result.routeLimit=12;
 const paths=findPaths(m,origin,destinations.map(d=>d.point));
 for(const [i,d] of destinations.entries()){
  const path=paths[i];
  result.routes.push({kind:d.kind,targetId:d.id,reachable:path!==null,...(path?{distanceYards:round(path.reduce((sum,p,i)=>sum+yards(m,i?path[i-1]:origin,p),0)),steps:path.length,explorationSeconds:path.length*e.secondsPerCell,destination:path.at(-1)||{x:origin.x,y:origin.y},waypoints:path.slice(0,40),waypointsTruncated:path.length>40}:{reason:'blocked-in-authored-grid'})});
 }
 return result;
}
