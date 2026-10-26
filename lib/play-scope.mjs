import {requireAccess} from './factions.mjs';
// A play segment is historical attribution, never a snapshot to restore.
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export function playScope(r){
 const caseId=r.chronicle?.activeCaseId||'';
 return {caseId,segmentId:r.playScope?.caseId===caseId?r.playScope.id:'',mode:caseId?'case':'free'};
}
export function syncPlayScope(r,before){
 const caseId=r.chronicle?.activeCaseId||'';
 if(r.playScope?.caseId===caseId)return;
 r.playScope={id:crypto.randomUUID(),caseId,mode:caseId?'case':'free',participantIds:[...(r.partyCharacterIds||[])],startedClock:structuredClone(r.chronicle?.clock||null)};
}
export function requireScopeIdle(r){
 if(r.combat?.status==='active'||['queued','running','applying'].includes(r.gmJob?.status)||r.actions.some(a=>!['resolved','cancelled','superseded'].includes(a.status)))fail('전투·대기 선언·GM 처리를 마친 뒤 활동을 전환하세요.');
}
export function scopeCommand(r,u,op,p){
 if(!['beginFreePlay','resumeCase'].includes(op))return null;
 if(r.owner!==u.id)throw Object.assign(Error('일행 활동 전환은 방장이 진행합니다.'),{status:403});
 requireScopeIdle(r);
 const chronicle=r.chronicle,current=chronicle.cases.find(c=>c.id===chronicle.activeCaseId);
 if(op==='beginFreePlay'){
  if(current){current.pausedAt=new Date().toISOString();current.resumeMapId=r.mapId;current.resumePlaceId=r.worldLibrary?.placeId||r.location?.placeId||'';}
  const episode=chronicle.episodes.find(e=>e.id===chronicle.activeEpisodeId);if(episode){episode.endedAt=new Date().toISOString();episode.endClock=structuredClone(chronicle.clock);}
  chronicle.activeCaseId='';chronicle.activeEpisodeId='';
 }else{
  const entry=chronicle.cases.find(c=>c.id===p.id&&c.visibility==='public'&&c.status==='open');
  requireAccess(r,entry?.accessRequirements);
  if(!entry?.startedAt||!entry.pausedAt)fail('중단한 임무를 선택하세요.');
  if(current)fail('현재 임무를 중단한 뒤 재개하세요.');
  const place=r.worldLibrary?.placeId||r.location?.placeId||'';
  if(entry.resumeMapId!==r.mapId||entry.resumePlaceId&&entry.resumePlaceId!==place)fail('임무를 중단했던 장소로 이동한 뒤 재개하세요.');
  chronicle.activeCaseId=entry.id;delete entry.pausedAt;
 }
 if(r.economy){r.economy.visit=null;r.economy.visits={};}
 syncPlayScope(r);
 r.messages.push({id:crypto.randomUUID(),type:'system',name:u.name,author:u.id,text:op==='beginFreePlay'?(current?`${current.title} 중단 · 자유행동 시작`:'자유행동 시작'):'임무 재개 · '+chronicle.cases.find(c=>c.id===p.id).title,...playScope(r),gameClock:structuredClone(chronicle.clock),at:new Date().toISOString()});
 return {};
}
export function attributePlay(r,before){
 syncPlayScope(r,before);
 for(const a of r.actions||[])if(!(before.actions||[]).some(old=>old.id===a.id))Object.assign(a,playScope(r));
 for(const m of r.messages.slice(before.messages.length)){
  if(m.channel==='admin'||['request','adminReply'].includes(m.type))continue;
  const action=r.actions.find(a=>a.id===m.actionId),scope=action?.segmentId?action:playScope(r);
  m.caseId??=scope.caseId;m.segmentId??=m.caseId===scope.caseId?scope.segmentId:'';
  m.playMode??=m.caseId?'case':m.segmentId?'free':'legacy';
  m.gameClock??=structuredClone(r.chronicle?.clock||null);
  m.placeId??=r.worldLibrary?.placeId||r.location?.placeId||'';m.sceneTitle??=r.scene?.title||'';
 }
}
