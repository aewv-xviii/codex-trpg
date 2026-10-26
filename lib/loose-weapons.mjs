import {combatLog} from './combat-log.mjs';
import {advanceGameSeconds} from './conditions.mjs';
import {canControl} from '../public/play/character-control.js';
// Missed-weapon location/retrievability is a GM fact; inventory arithmetic is server-owned.
export function locateWeapon(r,u,p){
 if(u.id!==r.owner)throw Error('투척 무기의 위치 확인은 GM 권한이 필요합니다.');
 const loose=r.looseWeapons?.find(w=>w.id===p.lootId&&!w.recovered),c=r.characters.find(c=>c.id===p.characterId);
 if(!loose||!c||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)throw Error('미회수 무기와 발견 근거를 확인하세요.');
 if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('발견 좌표가 필요합니다.');
 if(r.combat?.status==='active'){
  if(loose.combatId!==r.combat.id||r.combat.pending)throw Error('현재 전투의 미처리 공격을 먼저 마치세요.');
  if(r.combat.theater){if(Math.abs(p.x)>10000||p.y!==0)throw Error('텍스트 전투 위치를 확인하세요.');loose.position=p.x;}
  else{if(p.x<0||p.x>1||p.y<0||p.y>1)throw Error('지도 좌표를 확인하세요.');loose.position={x:p.x,y:p.y};}
 }else{
  if(loose.placeId!==(r.worldLibrary?.placeId||'')||loose.mapId&&loose.mapId!==r.mapId)throw Error('무기를 떨어뜨린 장소에서 확인하세요.');
  loose.retrievableBy=c.id; // Explicit GM confirmation of physical access outside a measured battle.
 }
 loose.located=true;loose.locationReason=p.reason;
 r.messages.push({id:crypto.randomUUID(),type:'combat',name:'전투',author:r.owner,text:`투척 무기 위치 확인 · ${p.reason}`,at:new Date().toISOString()});return {};
}
export function recoverOutside(r,u,p){
 const c=r.characters.find(c=>c.id===p.characterId),loose=r.looseWeapons?.find(w=>w.id===p.lootId&&!w.recovered);
 if(r.combat?.status==='active'||!c||!canControl(c,u)||!loose||!loose.located||loose.retrievableBy!==c.id||loose.placeId!==(r.worldLibrary?.placeId||'')||loose.mapId&&loose.mapId!==r.mapId)throw Error('GM이 현재 위치에서 회수 가능하다고 확인한 무기를 선택하세요.');
 c.assets.items[loose.itemId]=(c.assets.items[loose.itemId]||0)+1;loose.recovered=true;advanceGameSeconds(r,2);
 combatLog(r,`${c.name} · 투척 무기 1개 회수 · 2초`,undefined,c.id);return {};
}
