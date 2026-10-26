import {offMapPosition} from '../public/play/off-map-state.js';
import {controlFlags} from './control-state.mjs';
// Observer knowledge is distinct from token visibility and NPC identity.
export const awarenessOf=(c,id)=>c.stealth?.active?(c.stealth.observers?.[id]?.state||'unknown'):'exposed';
export const concealedFrom=(c,id)=>['hidden','unknown','alerted'].includes(awarenessOf(c,id));
export function sameScene(r,a,b){
 const place=id=>r.worldLibrary?.characterPlaces?.[id]||[...r.characters,...(r.cast||[])].find(c=>c.id===id)?.placeId||r.worldLibrary?.placeId;
 if(r.worldLibrary)return !!place(a)&&place(a)===place(b);
 const maps=id=>(r.maps||[]).filter(m=>m.tokens?.some(t=>t.characterId===id)).map(m=>m.id);
 const am=maps(a),bm=maps(b);return am.length&&bm.length?am.some(x=>bm.includes(x)):true;
}
export function actorPosition(r,id){
 const detached=offMapPosition(r,id);if(detached)return {placeId:detached.placeId,mapId:detached.mapId,x:null,y:null,offMap:true,label:detached.label,distanceYards:detached.distanceYards};
 const placeId=r.worldLibrary?.characterPlaces?.[id]||r.worldLibrary?.placeId||'';
 if(r.combat?.status==='active'&&r.combat.theater&&id in r.combat.theater.positions)return {placeId,mapId:r.combat.mapId,x:r.combat.theater.positions[id],y:0,theater:true};
 const m=r.maps?.find(m=>m.tokens?.some(t=>t.characterId===id)),t=m?.tokens.find(t=>t.characterId===id);
 return {placeId,mapId:m?.id||'',x:t?.x??null,y:t?.y??null};
}
export function refreshStealthEffect(c){
 c.effects=(c.effects||[]).filter(e=>e.key!=='stealth');const s=c.stealth;if(!s?.active)return;
 const states=Object.values(s.observers||{}).map(x=>x.state),seen=states.filter(x=>x==='exposed').length,alerted=states.filter(x=>x==='alerted').length;
 const label=seen?(states.every(x=>x==='exposed')?'노출':'일부 발각'):alerted?'위치 경고됨':'은신 중';
 c.effects.push({id:s.id,key:'stealth',kind:seen?'debuff':'buff',label,source:s.reason,description:(seen?'직접 발견한 상대가 있음. ':'')+(alerted?'경고를 들은 상대가 수색할 수 있음. ':'')+'관찰자별 상태이며 투명화·자동 방어 불가가 아님.'+(s.pending?' 상황 변화로 발각 여부 확인 중.':'')});
}
export function markStealthCue(r,c,reason){
 if(!c.stealth?.active)return;c.stealth.pending={id:crypto.randomUUID(),reason,position:actorPosition(r,c.id)};refreshStealthEffect(c);
}
export function syncAwareness(r,old){
 // Entering/leaving theater combat changes coordinate frames, not physical position.
 const positions=id=>{let before=actorPosition(old,id),after=actorPosition(r,id);if(!!before.theater!==!!after.theater){before=actorPosition({...old,combat:null},id);after=actorPosition({...r,combat:null},id);}return {before,after};};
 for(const c of old.characters){const {before,after}=positions(c.id);if(controlFlags(c).noMove&&r.characters.some(x=>x.id===c.id)&&JSON.stringify(before)!==JSON.stringify(after))throw Error('이동 제한 상태입니다. 강제 이동은 별도의 근거 있는 절차가 필요합니다.');}
 for(const c of r.characters){if(!c.stealth?.active)continue;const prior=old.characters.find(x=>x.id===c.id);if(!prior?.stealth?.active)continue;
  const {before,after}=positions(c.id);
  if(before.placeId!==after.placeId||before.mapId!==after.mapId){c.stealth.active=false;c.stealth.endedReason='장소 이동 · 새 장면에서 은신을 다시 확인';refreshStealthEffect(c);}
  else if(JSON.stringify(before)!==JSON.stringify(after)&&c.stealth.reviewedPosition!==JSON.stringify(after))markStealthCue(r,c,'이동 경로·엄폐·소음 변화');
 }
}
export function queueAwareness(r){
 if(['queued','running','applying','error'].includes(r.gmJob?.status)||r.combat?.pending)return;
 const ids=r.characters.filter(c=>c.stealth?.active&&c.stealth.pending).map(c=>c.id);if(!ids.length)return;
 r.gmJob={id:crypto.randomUUID(),kind:'awareness',status:'queued',at:new Date().toISOString(),actorIds:ids,requesterId:r.owner,advanceTurn:false,requestText:'은신 중 실제 이동/공격의 관찰 가능성을 재정하세요. awarenessUpdate로 각 pending 단서를 처리하세요. 기존 성공을 무조건 재굴림하지 말고, 새 노출/소음/경계 변화가 있을 때만 원문에 따른 관찰 판정. 발견자의 경고 가능 여부와 실제 청자를 고려해 warn으로 경고를 전파하세요. 경고는 직접 시각 확인이 아닙니다.'};
}
export function awarenessContext(r){return r.characters.filter(c=>c.stealth?.active).map(c=>({characterId:c.id,...structuredClone(c.stealth)}));}
