import {travelScope} from '../public/play/travel-party.js';
// Explicit maintenance only. Never infer that an unrelated pending action ran.
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
export function samePendingIntent(a,b){
 return travelScope(a)===travelScope(b)&&a.actorId===b.actorId&&a.author===b.author&&a.text===b.text&&
  (a.worldFrom||'')===(b.worldFrom||'')&&(a.worldDestination||'')===(b.worldDestination||'')&&
  (a.storyEventId||'')===(b.storyEventId||'');
}
export function reconcileActions(room,user,payload){
 if(user.id!==room.owner)throw Object.assign(new Error('방장 권한이 필요합니다.'),{status:403});
 if(['queued','running','applying'].includes(room.gmJob?.status))fail('GM 작업이 끝난 뒤 선언을 정리하세요.');
 const {links,reason}=payload;
 if(!Array.isArray(links)||!links.length||links.length>20||typeof reason!=='string'||!reason.trim()||reason.length>1000)fail('선언 연결과 정리 사유가 필요합니다.');
 const sources=new Set(links.map(x=>x.actionId));
 if(sources.size!==links.length)fail('정리할 선언이 중복되었습니다.');
 const changes=links.map(link=>{
  const action=room.actions.find(a=>a.id===link.actionId),target=room.actions.find(a=>a.id===link.targetId);
  if(!action||!target||sources.has(target.id)||action.status!=='pending'||action.actorId!==target.actorId||action.author!==target.author||(action.worldFrom||'')!==(target.worldFrom||''))fail('연결할 선언의 상태와 인물이 일치하지 않습니다.');
  if(link.kind==='duplicate'){
   if(!['pending','planned','resolved'].includes(target.status)||target.reconciliation||!samePendingIntent(action,target))fail('동일 내용의 원본 선언만 중복으로 연결할 수 있습니다.');
  }else if(link.kind==='superseded'){
   if(target.status!=='resolved'||target.reconciliation)fail('이미 처리된 구체적인 선언을 선택하세요.');
  }else fail('지원하지 않는 선언 연결입니다.');
  return {action,target,kind:link.kind};
 });
 const at=new Date().toISOString(),id=crypto.randomUUID();
 // Preserve original action objects separately from their closure metadata.
 room.actionRepairs||=[];
 room.actionRepairs.push({id,at,author:user.id,reason:reason.trim(),beforeVersion:room.version,actions:changes.map(x=>structuredClone(x.action))});
 for(const {action,target,kind} of changes){
  action.status='resolved';
  action.reconciliation={kind,targetId:target.id,repairId:id,at,executed:false};
  action.reason=`${kind==='duplicate'?'중복 선언':'구체화된 선언'} 연결 정리. 이 선언은 별도로 실행하지 않음. ${reason.trim()}`;
 }
 room.messages.push({id:crypto.randomUUID(),type:'system',author:user.id,name:user.name,at,text:`선언 ${changes.length}건의 연결을 정리했습니다. 판정·시간·자원 변화 없음. ${reason.trim()}`});
 return {repairId:id,actionIds:changes.map(x=>x.action.id)};
}
