import {offMapPosition} from '../public/play/off-map-state.js';
import {canControl} from '../public/play/character-control.js';
import {advanceGameSeconds} from './conditions.mjs';
import {requireControlAction} from './control-state.mjs';
import {actorMapId} from './location-presentation.mjs';
export function applyOffMapPosition(r,original,p){
 const action=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'),actor=r.characters.find(c=>c.id===action?.actorId);
 if(!['individual','turn'].includes(original.gmJob?.kind)||!(original.gmJob.actionIds||[]).includes(p.actionId)||!actor||actor.isNPC&&!actor.controllers?.length||!canControl(actor,{id:action.author})||!r.partyCharacterIds.includes(actor.id))throw Error('본인이 선언한 플레이어의 지도 밖 이동만 처리할 수 있습니다.');
 if(r.combat?.status==='active')throw Error('교전 중 지도 밖 자리 변경의 이동 예약은 아직 지원하지 않습니다. 현재 위치의 전투 행동은 계속 사용할 수 있습니다.');
 requireControlAction(actor,'move');
 if(actor.hp<=0||actor.fp<=0||['dead','unconscious','dying'].includes(actor.combatState?.status))throw Error('스스로 이동할 수 있는 상태가 필요합니다.');
 if(!['enter','return'].includes(p.mode)||!p.reason?.trim()||p.reason.length>1000||!Number.isInteger(p.seconds)||p.seconds<1||p.seconds>86400)throw Error('이동 방식·소요 시간·근거를 확인하세요.');
 const previous=offMapPosition(r,actor.id),map=r.maps.find(m=>m.id===actorMapId(r,actor.id)),token=map?.tokens.find(t=>t.characterId===actor.id);
 if(!map||!token||token.hidden)throw Error('현재 장소에 공개된 캐릭터 위치가 필요합니다.');
 if(p.mode==='return'&&!previous||p.mode==='enter'&&previous)throw Error('현재 지도 밖 위치를 확인하세요. 자리 변경은 먼저 복귀한 뒤 선언하세요.');
 if(p.mode==='enter'&&(!p.label?.trim()||p.label.length>100||!Number.isFinite(p.distanceYards)||p.distanceYards<10||p.distanceYards>1500||typeof p.canSeeScene!=='boolean'))throw Error('주변 위치 이름과 10~1500야드의 유한한 거리·관측 가능 여부가 필요합니다.');
 const distance=previous?.distanceYards||p.distanceYards,move=Math.max(1,actor.combatProfile?.move||1);
 if(p.seconds<Math.ceil(distance/move))throw Error('확정한 거리보다 지나치게 짧은 이동시간입니다. 실제 접근 경로와 시간을 재정하세요.');
 advanceGameSeconds(r,p.seconds);
 if(p.mode==='enter'){
  actor.offMapPosition={label:p.label.trim(),distanceYards:p.distanceYards,canSeeScene:p.canSeeScene,reason:p.reason,mapId:map.id,placeId:r.worldLibrary?.characterPlaces?.[actor.id]||r.worldLibrary?.placeId||'',caseId:r.chronicle?.activeCaseId||'',anchor:{x:token.x,y:token.y},approximate:true};token.offMap=true;
 }else{Object.assign(token,previous.anchor);delete token.offMap;delete actor.offMapPosition;}
 action.status='resolved';action.timeCharged=true;action.offMapHandled=true;
 r.messages.push({id:crypto.randomUUID(),type:'exploration',caseId:r.chronicle.activeCaseId||'',actionId:action.id,author:action.author,name:actor.name,speakerId:actor.id,text:p.mode==='enter'?`${actor.name} · ${p.label} · 지도 밖 약 ${p.distanceYards}yd · 이동 ${p.seconds}초`:`${actor.name} · 현장 복귀 · 이동 ${p.seconds}초`,at:new Date().toISOString(),gameClock:structuredClone(r.chronicle.clock)});
}
export function syncOffMapPositions(r){
 for(const c of r.characters){if(!c.offMapPosition||offMapPosition(r,c.id))continue;delete c.offMapPosition;for(const m of r.maps)for(const t of m.tokens)if(t.characterId===c.id)delete t.offMap;}
}
