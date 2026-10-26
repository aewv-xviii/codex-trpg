// Immutable gameplay snapshots live in the existing private asset store, not in
// the frequently fetched room JSON. Only metadata is exposed to the owner.
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const retained=new Set(['id','version','owner','title','joinCode','createdAt','updatedAt','members','bridgeHash','bridgeParentId','creationSignature','receipts','localLibrary','documents','scenarioStarts','scenarioResetBackup','scenarioReset','playEpoch','_pendingScenarioStart','checkpoints','travelRollbacks','actionRepairs','gmJob','gmHistory','gmUpdatedAt']);
const bookSettings=['rulebookId','rulebookIds','localBookIds','scenarioId','localScenarioId'];
function stateOf(room){
 const state=Object.fromEntries(Object.entries(room).filter(([key])=>!retained.has(key)));
 return structuredClone(state);
}
function envelope(room){return {format:'night-table-scenario-checkpoint/v1',roomId:room.id,state:stateOf(room),selections:room.members.map(m=>({id:m.id,activeCharacterId:m.activeCharacterId||''}))};}
export function markScenarioStart(room,phase='prepared'){
 const caseId=room.chronicle?.activeCaseId,entry=room.chronicle?.cases.find(c=>c.id===caseId);
 if(!entry)return;
 const prior=room.scenarioStarts?.[caseId];
 if(prior&&(prior.phase==='opening'||phase!=='opening'))return;
 const point={id:'scenario-start-'+crypto.randomUUID(),caseId,title:entry.title,at:new Date().toISOString(),clock:structuredClone(room.chronicle.clock),phase};
 (room.scenarioStarts||={})[caseId]=point;room._pendingScenarioStart=point.id;
}
// Called at the storage boundary, after every setup edit/scene/asset is final.
export function pendingScenarioSnapshot(room){
 const id=room._pendingScenarioStart;if(!id)return null;
 if(!Object.values(room.scenarioStarts||{}).some(p=>p.id===id))fail('시작 지점 저장 정보를 확인하세요.');
 return {id,body:JSON.stringify(envelope(room))};
}
export function publicScenarioCheckpoints(room,user){
 delete room._pendingScenarioStart;
 if(room.owner!==user.id){delete room.scenarioStarts;delete room.scenarioResetBackup;}
}
export async function scenarioCheckpointRequest(store,user,input,original){
 if(original.owner!==user.id)fail('방장 권한이 필요합니다.',403);
 const {requireRequestId}=await import('./table-engine.mjs');requireRequestId(input.requestId);
 const payload=input.payload||{},signature=JSON.stringify({op:input.op,payload,user:user.id});
 const prior=original.receipts[input.requestId];
 if(prior){if(prior.signature!==signature)fail('이미 사용한 요청 ID입니다.');return {room:original,result:prior.result,duplicate:true};}
 if(original.version!==input.expectedVersion)fail('상태가 갱신되었습니다. 최신 상태를 확인하세요.');
 if(original.archivedAt||original.deletedAt)fail('진행 중인 캠페인에서 사용하세요.');
 let next,result;
 if(input.op==='saveScenarioStart'){
  if(['queued','running','applying'].includes(original.gmJob?.status)||original.combat?.status==='active')fail('GM과 전투가 끝난 뒤 시작 지점을 저장하세요.');
  const caseId=original.chronicle?.activeCaseId;
  if(!caseId)fail('진행 중인 시나리오가 없습니다.');
  if(original.scenarioStarts?.[caseId])fail('이 시나리오의 시작 지점은 이미 저장되어 있습니다.');
  next=structuredClone(original);markScenarioStart(next,'opening');
  if(!next._pendingScenarioStart)fail('시나리오 정보를 확인하세요.');
  result={checkpointId:next.scenarioStarts[caseId].id};
 }else if(input.op==='resetScenario'){
  const point=[...Object.values(original.scenarioStarts||{}),original.scenarioResetBackup].find(p=>p&&p.id===payload.checkpointId);
  if(!point)fail('저장된 시나리오 시작 지점을 선택하세요.');
  const raw=await store.assetGet(point.id,original.id);if(!raw)fail('시작 지점 보관본을 읽을 수 없습니다.');
  let saved;try{saved=JSON.parse(raw);}catch{fail('시작 지점 보관본이 손상되었습니다.');}
  if(saved.format!=='night-table-scenario-checkpoint/v1'||saved.roomId!==original.id||!Array.isArray(saved.state?.characters)||!Array.isArray(saved.state?.messages)||!saved.state?.chronicle)fail('시작 지점 보관본을 확인하세요.');
  const backup={id:'scenario-backup-'+crypto.randomUUID(),title:'초기화 직전',caseId:original.chronicle.activeCaseId||'',clock:structuredClone(original.chronicle.clock),at:new Date().toISOString()};
  // A failed CAS may leave an unreachable immutable backup; it never publishes
  // a reset or modifies the fixed starting point.
  await store.assetPut(backup.id,original.id,JSON.stringify(envelope(original)));
  next=structuredClone(original);
  for(const key of Object.keys(next))if(!retained.has(key))delete next[key];
  for(const [key,value] of Object.entries(saved.state))if(!retained.has(key))next[key]=structuredClone(value);
  next.campaign||={};for(const key of bookSettings){delete next.campaign[key];if(Object.hasOwn(original.campaign||{},key))next.campaign[key]=structuredClone(original.campaign[key]);}
  next.members=original.members.map(m=>{const preferred=saved.selections?.find(x=>x.id===m.id)?.activeCharacterId;const valid=id=>next.characters.some(c=>c.id===id&&(c.owner===m.id&&!c.isNPC||c.controllers?.[0]===m.id));return {...m,activeCharacterId:valid(preferred)?preferred:valid(m.activeCharacterId)?m.activeCharacterId:next.characters.find(c=>c.owner===m.id&&!c.isNPC)?.id||''};});
  next.gmJob={status:'idle',message:'저장된 시작 지점으로 복원했습니다. 새 행동을 선언하세요.'};next.gmHistory=[];next.gmUpdatedAt='';
  next.checkpoints=[];delete next.travelRollbacks;delete next.actionRepairs;delete next._pendingScenarioStart;
  next.playEpoch=(original.playEpoch||0)+1;next.scenarioResetBackup=backup;
  next.scenarioReset={at:new Date().toISOString(),checkpointId:point.id,version:original.version+1};
  result={checkpointId:point.id,backupId:backup.id,caseId:next.chronicle.activeCaseId,clock:structuredClone(next.chronicle.clock)};
 }else fail('지원하지 않는 시작 지점 명령입니다.',400);
 next.version=original.version+1;next.updatedAt=new Date().toISOString();next.receipts[input.requestId]={signature,result};
 if(!await store.save(next,original.version))fail('상태가 갱신되어 초기화하지 않았습니다. 최신 상태를 확인하세요.');
 return {room:next,result,duplicate:false};
}
