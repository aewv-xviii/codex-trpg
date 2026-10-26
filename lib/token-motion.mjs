import {actorMapId,viewerActorId} from './location-presentation.mjs';
import {combatMove} from './combat.mjs';
import {TableError} from './table-engine.mjs';
import {canControl} from '../public/play/character-control.js';
export const motionDDL='CREATE TABLE IF NOT EXISTS token_motion (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, lease TEXT NOT NULL, seq INTEGER NOT NULL, expires INTEGER NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS token_motion_room_idx ON token_motion(room_id);';
export const motionSQL={
 begin:'INSERT INTO token_motion(id,room_id,lease,seq,expires,data) VALUES(?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET lease=excluded.lease,seq=0,expires=excluded.expires,data=excluded.data WHERE token_motion.expires<=?',
 update:'UPDATE token_motion SET seq=?,expires=?,data=? WHERE id=? AND lease=? AND seq<? AND expires>?',
 end:'UPDATE token_motion SET expires=0 WHERE id=? AND lease=?',
 list:'SELECT data,lease,expires FROM token_motion WHERE room_id=? AND expires>?',
};
const key=(r,p)=>`${r.id}/${r.playEpoch||0}/${p.id}`;
function token(r,p){
 const m=r.maps?.find(m=>m.id===(r.worldLibrary?(p.from?.mapId||p.mapId||r.mapId):r.mapId)),t=m?.tokens.find(t=>t.id===p.id);
 return {m,t,c:r.characters.find(c=>c.id===t?.characterId)};
}
function permitted(r,u,t,c){return !!t&&(c?canControl(c,u):r.owner===u.id);}
export async function motionRequest(store,r,u,op,p,now=Date.now()){
 if(!r.members.some(m=>m.id===u.id))throw new TableError('참가 권한이 필요합니다.',403);
 const {m,t,c}=token(r,p);
 if(r.worldLibrary&&r.combat?.status!=='active'&&m?.id!==actorMapId(r,c?.id))throw new TableError('현재 장소에서만 이동할 수 있습니다.',409);
 if(!permitted(r,u,t,c))throw new TableError('토큰 조작 권한이 없습니다.',403);
 if(op==='motionEnd'){
  if(typeof p.lease!=='string')throw new TableError('이동 연결이 필요합니다.');
  await store.motionWrite('end',[key(r,p),p.lease]);return {ok:true};
 }
 if(m.exploration)throw new TableError('탐색 이동은 경로 확정 후 공유합니다.',409);
 if(r.archivedAt||['queued','running'].includes(r.gmJob?.status))throw new TableError('현재 이동할 수 없습니다.',409);
 if(!p.from||p.from.mapId!==m.id||p.from.x!==t.x||p.from.y!==t.y)throw new TableError('토큰 위치가 변경되었습니다.',409);
 if(![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new TableError('잘못된 위치입니다.');
 if(r.combat?.status==='active'&&r.combat.fighters[c?.id])combatMove(structuredClone(r),u,c.id,p.x,p.y);
 const data=JSON.stringify({id:p.id,mapId:m.id,from:p.from,x:p.x,y:p.y,mover:u.id,epoch:r.playEpoch||0});
 const expires=now+2500;
 if(op==='motionBegin'){
  const lease=crypto.randomUUID();
  if(!await store.motionWrite('begin',[key(r,p),r.id,lease,expires,data,now]))throw new TableError('다른 창에서 이동 중입니다.',409);
  return {lease};
 }
 if(typeof p.lease!=='string'||!Number.isSafeInteger(p.seq)||p.seq<1)throw new TableError('잘못된 이동 순서입니다.');
 if(!await store.motionWrite('update',[p.seq,expires,data,key(r,p),p.lease,p.seq,now]))throw new TableError('이동 연결이 만료되었습니다.',409);
 return {ok:true};
}
export async function visibleMotions(store,r,u,rows,now=Date.now()){
 if(r.deletedAt||r.archivedAt||!r.members?.some(m=>m.id===u.id))return [];
 rows??=await store.motionList(r.id,now);
 return rows.flatMap(row=>{
  const p=JSON.parse(row.data),{m,t,c}=token(r,p);
  if((p.epoch||0)!==(r.playEpoch||0))return [];
  if(r.worldLibrary&&r.combat?.status!=='active'&&(m?.id!==actorMapId(r,c?.id)||m?.id!==actorMapId(r,viewerActorId(r,u))))return [];
  if(row.expires<=now||m?.exploration||!permitted(r,{id:p.mover},t,c)||m.id!==p.mapId||t.x!==p.from.x||t.y!==p.from.y||(t.hidden&&r.owner!==u.id))return [];
  return [{id:p.id,mapId:p.mapId,from:p.from,x:p.x,y:p.y,lease:row.lease,ttl:row.expires-now}];
 });
}
