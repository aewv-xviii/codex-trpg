// Execution telemetry contains fixed stage IDs and timestamps, never model thoughts.
export const GM_STAGES=['sources','compose','validate','apply'];
export const connectionDDL='CREATE TABLE IF NOT EXISTS gm_connection (room_id TEXT PRIMARY KEY, last_seen TEXT NOT NULL);';
export const connectionSQL={
 write:'INSERT INTO gm_connection (room_id,last_seen) VALUES (?,?) ON CONFLICT(room_id) DO UPDATE SET last_seen=excluded.last_seen',
 read:'SELECT last_seen AS lastSeen FROM gm_connection WHERE room_id=?',
};
export function stageProgress(job,stage,at=new Date().toISOString()){
 if(!GM_STAGES.includes(stage))throw Error('작업 단계를 확인하세요.');
 const steps=job.steps||=[];
 if(steps.some(s=>s.stage===stage)||GM_STAGES.indexOf(stage)<GM_STAGES.indexOf(job.stage))return false;
 for(const step of steps)if(step.status==='running'){step.status='done';step.finishedAt=at;}
 steps.push({stage,status:'running',startedAt:at});
 job.steps=steps;job.stage=stage;job.stageAt=at;return true;
}
export function endProgress(room,status,at=new Date().toISOString()){
 const job=room.gmJob;job.status=status;job.finishedAt=at;
 for(const step of job.steps||[])if(step.status==='running'){
  step.status=status==='done'?'done':status;step.finishedAt=at;
 }
 room.gmHistory=(room.gmHistory||[]).filter(x=>x.id!==job.id);
 if(job.id)room.gmHistory.push({
  id:job.id,kind:job.kind,status,at:job.at,startedAt:job.startedAt,finishedAt:at,
  stage:job.stage,steps:structuredClone(job.steps||[]),attempt:job.attempt||1,
 });
 room.gmHistory=room.gmHistory.slice(-20);
 delete job.lease;
}
export async function progressJob(store,roomId,lease,stage){
 for(let attempt=0;attempt<3;attempt++){
  const r=await store.get(roomId);
  if(r?.gmJob?.status!=='running'||r.gmJob.lease!==lease)return {ignored:true};
  const copy=structuredClone(r);
  if(!stageProgress(copy.gmJob,stage))return {ok:true};
  copy.gmJob.progressRevisions=(copy.gmJob.progressRevisions||0)+1;copy.version++;
  if(await store.save(copy,r.version))return {ok:true};
 }
 throw Error('작업 상태 갱신을 다시 시도하세요.');
}
export function retryJob(room){
 const previous=room.gmJob;
 if(previous?.kind==='turn')throw Error('공동 진행 요청은 종료되었습니다. 미처리 개인 행동을 선택하세요.');
 if(!(['error','cancelled'].includes(previous?.status)||(previous?.status==='done'&&previous.actionIds?.some(id=>room.actions.some(a=>a.id===id&&a.status==='pending'))))||!previous.id)throw Error('실패하거나 중단된 요청만 다시 시도할 수 있습니다.');
 if(previous.actionIds?.length&&!previous.actionIds.some(id=>room.actions.some(a=>a.id===id&&a.status==='pending')))throw Error('이미 처리된 행동입니다. 현재 상태에서 새 행동을 선언하세요.');
 const job=structuredClone(previous);
 for(const key of ['lease','stage','stageAt','steps','startedAt','finishedAt','message','progressRevisions','proposal'])delete job[key];
 Object.assign(job,{id:crypto.randomUUID(),status:'queued',at:new Date().toISOString(),attempt:(previous.attempt||1)+1,retryOf:previous.id});
 // Re-evaluate against the latest state; never replay a stale, partially valid proposal.
 room.gmJob=job;
}
