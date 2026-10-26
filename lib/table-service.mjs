import {validatePortraitReferences} from './portrait-assets.mjs';
import {partyDialogue} from '../public/play/dialogue-flow.js';
import {quickStart} from './quick-start.mjs';
import {workspace} from './workspace.mjs';
import {assetFingerprint,persistContentAssets} from './content-assets.mjs';
import {campaignSetup} from './campaign-setup.mjs';
import {motionRequest,visibleMotions} from './token-motion.mjs';
import { createRoom, mutateRoom, visibleRoom, requireOwner, requireRequestId, TableError } from './table-engine.mjs';
import { gmPolicy } from './gm-policy.mjs';
import {replayRequest} from './campaign-replay.mjs';
import {replacePackArt} from './replace-pack-art.mjs';
import {scenarioCheckpointRequest} from './scenario-checkpoints.mjs';
import { accountRequest, ensureOriginal } from './account-characters.mjs';
export async function readContentAsset(store,user,roomId,assetId){
 const r=await store.get(roomId);if(!r||r.deletedAt)throw new TableError('자료를 찾을 수 없습니다.',404);
 const view=visibleRoom(r,user),data=r.contentAssets?.[assetId];
 // Authorize against immutable templates, not user-editable chat or image URLs.
 const allowed=new Set();
 for(const snapshot of Object.values(view.sceneArchive?.snapshots||{}))for(const id of snapshot.contentAssets||[])allowed.add(id);
 for(const p of r.contentPacks||[]){
  for(const m of view.maps.filter(m=>m.contentRef?.packId===p.id)){const source=p.maps.find(s=>s.id===m.contentRef.mapId);for(const key of [source?.image,source?.background])if(key)allowed.add(p.assets[key]);}
  for(const c of view.characters.filter(c=>c.contentRef?.packId===p.id)){const source=p.actors.find(a=>a.id===c.contentRef.actorId);if(source?.portrait)allowed.add(p.assets[source.portrait]);}
 }
 if(!data||r.owner!==user.id&&!allowed.has(assetId))throw new TableError('공개되지 않은 자료입니다.',404);
 return typeof data==='string'?data:await store.assetGet(assetId,roomId)||Promise.reject(new TableError('자료를 찾을 수 없습니다.',404));
}

export async function tableRequest(store, user, input, mode = 'browser') {
  if (!user?.id) throw new TableError('로그인이 필요합니다.', 401);
  if (!input || typeof input !== 'object' || Array.isArray(input) || (input.payload !== undefined && (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)))) throw new TableError('올바른 명령 객체가 필요합니다.');
  const { op, roomId, payload = {} } = input;
  if(typeof op!=='string')throw new TableError('작업 이름이 필요합니다.');
  if(op==='get'&&mode==='browser'&&Number.isSafeInteger(input.since)&&store.revision){
    const revision=await store.revision(roomId);
    if(!revision||revision.deletedAt)throw new TableError('테이블을 찾을 수 없습니다.',404);
    if(!revision.members.some(m=>m.id===user.id))throw new TableError('테이블 참가 권한이 필요합니다.',403);
    if(revision.version===input.since){
      const rows=await store.motionList(roomId,Date.now());
      const motions=rows.length?await visibleMotions(store,await store.get(roomId),user,rows):[];
      return {unchanged:true,version:revision.version,me:user,motions,gmConnection:await store.connectionGet?.(roomId)||null};
    }
  }
  if(op.startsWith('account')){
    if(mode!=='browser')throw new TableError('화면에서 보관함을 관리하세요.',403);
    return accountRequest(store,user,input);
  }
  if (op === 'list') return { rooms: (await store.list()).filter(r => !r.deletedAt && r.members.some(m => m.id === user.id)).map(r => ({
    id:r.id,title:r.title,version:r.version,role:r.owner===user.id?'owner':'player',
    archived:!!r.archivedAt,createdAt:r.createdAt,quickStart:r.campaign?.quickStart||'',
    updatedAt:[r.updatedAt,r.gmUpdatedAt,r.messages?.at(-1)?.at,r.createdAt].filter(Boolean).sort().at(-1),
    session:r.session||{},system:r.campaign?.system||'generic',
    members:r.members.map(m=>({name:m.name,role:m.id===r.owner?'GM':'플레이어',
      characters:r.characters.filter(c=>c.owner===m.id).map(c=>c.name)})),
    characterCount:r.characters.length,messageCount:r.messages.filter(m=>m.type!=='whisper').length,
  })).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')), me: user };
  if (op === 'create') {
    requireRequestId(input.requestId);
    const room = workspace(createRoom(user, payload.title || '새로운 이야기'));
    if(payload.sourceRoomId){
      const source=await store.get(payload.sourceRoomId);if(!source||source.deletedAt)throw new TableError('기존 캠페인을 찾을 수 없습니다.');requireOwner(source,user);
      room.campaign={...room.campaign,...structuredClone(source.campaign),caseTitle:'',caseScenario:'',openingPrompt:'',ready:false};
      if(room.campaign.sourceFiles)for(const slot of ['caseScenario','openingPrompt'])delete room.campaign.sourceFiles[slot];
      room.documents=structuredClone(source.documents.filter(d=>(source.campaign.rulebookIds||[source.campaign.rulebookId]).includes(d.id)));
      if(source.localLibrary)room.localLibrary=structuredClone(source.localLibrary);
      if(source.bridgeHash){room.bridgeHash=source.bridgeHash;room.bridgeParentId=source.bridgeParentId||source.id;}
    }
    delete room.campaign.quickStart;
    if(payload.setup)campaignSetup(room,user,payload.setup);
    if(payload.quickStart)quickStart(room,user,payload.quickStart);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([user.id, input.requestId])));
    room.id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    room.creationSignature = JSON.stringify({ title: room.title, user: user.id, setup:payload.setup, sourceRoomId:payload.sourceRoomId, quickStart:payload.quickStart });
    const created = await store.create(room);
    const saved = await store.get(room.id);
    if(saved.deletedAt)throw new TableError('삭제된 세션의 생성 요청입니다. 새 요청으로 세션을 만드세요.',410);
    if (saved.creationSignature !== room.creationSignature) throw new TableError('이미 다른 내용에 사용한 요청 ID입니다.', 409);
    return { room: visibleRoom(saved, user), me: user, duplicate: !created };
  }
  let room = op === 'join' ? await store.byCode(payload.code) : await store.get(roomId);
  if (!room) throw new TableError('테이블을 찾을 수 없습니다.', 404);
  if(op==='deleteSession'){
    if(room.owner!==user.id)throw new TableError('방장 권한이 필요합니다.',403);
    requireRequestId(input.requestId);
    const signature=JSON.stringify({op,payload,user:user.id});
    if(room.deletedAt){
      if(room.deletionRequestId!==input.requestId||room.deletionSignature!==signature)throw new TableError('이미 삭제된 세션입니다.',404);
      return {deletedRoomId:room.id,me:user,duplicate:true};
    }
    if(Object.hasOwn(room.receipts,input.requestId))throw new TableError('이미 사용한 요청 ID입니다.',409);
    if(input.expectedVersion!==room.version)throw new TableError('세션이 갱신되었습니다. 최신 정보를 확인한 뒤 다시 삭제하세요.',409);
    if(payload.confirmName!==room.title)throw new TableError('삭제할 세션 이름을 정확히 입력하세요.');
    if(['queued','running'].includes(room.gmJob?.status))throw new TableError('GM 진행을 완료하거나 중단한 뒤 삭제하세요.',409);
    for(const c of room.characters)await ensureOriginal(store,c);
    // Retain only a deletion receipt: lost-response retries and old create requests
    // must never recreate the deleted campaign or expose its previous contents.
    const deleted={id:room.id,joinCode:room.joinCode,owner:room.owner,version:room.version+1,
      deletedAt:new Date().toISOString(),deletionRequestId:input.requestId,deletionSignature:signature};
    if(!await store.save(deleted,room.version))throw new TableError('세션이 갱신되었습니다. 최신 정보를 확인한 뒤 다시 삭제하세요.',409);
    return {deletedRoomId:room.id,me:user,duplicate:false};
  }
  if(room.deletedAt)throw new TableError('삭제된 세션입니다.',404);
  if(['saveScenarioStart','resetScenario'].includes(op)){
    const result=await scenarioCheckpointRequest(store,user,input,room);
    return {...result,room:visibleRoom(result.room,user),me:user};
  }
  if(op==='replacePackArt'){
    if(mode!=='browser')throw new TableError('방장 이미지 화면에서 변경하세요.',403);
    const result=await replacePackArt(store,user,input,room);
    return {...result,room:visibleRoom(result.room,user),me:user};
  }
  if(op==='resetCampaign'){
    if(mode!=='browser')throw new TableError('방장 준비 화면에서 다시 시작하세요.',403);
    const result=await replayRequest(store,user,input,room);
    return {...result,room:visibleRoom(result.room,user),me:user};
  }
  if (mode === 'agent') {
    requireOwner(room, user);
    if (op === 'approveRule' || (op === 'rule' && payload.activate)) throw new TableError('새 규칙의 활성화는 화면에서 방장이 승인해야 합니다.', 403);
  }
  if (op === 'get') return { room: visibleRoom(room, user), me: user, motions:await visibleMotions(store,room,user),gmConnection:await store.connectionGet?.(roomId)||null };
  if(['motionBegin','motionUpdate','motionEnd'].includes(op)){
    if(mode!=='browser')throw new TableError('화면에서만 이동할 수 있습니다.',403);
    return motionRequest(store,room,user,op,payload);
  }
  let source=null;
  if(op==='deployCharacter'&&!room.receipts[input.requestId]){
    source=await store.accountGet(payload.id);
    if(!source||source.owner!==user.id||source.deletedAt)throw new TableError('내 보관함의 원본을 찾을 수 없습니다.',404);
    if(source.version!==payload.version)throw new TableError('원본이 변경되었습니다. 보관함을 다시 열어주세요.',409);
  }
  // Only independent messages and a token whose starting position is unchanged
  // may be rebased. Rolls, edits and GM operations retain strict version checks.
  const canRebase=current=>{
    if(mode!=='browser'||current.deletedAt||current.archivedAt)return false;
    if(current.scenarioReset&&input.expectedVersion<current.scenarioReset.version)return false;
    if(op==='message')return !!payload.characterId&&partyDialogue(current,payload);
    if(op!=='moveToken'||!payload.from)return false;
    const map=current.maps?.find(m=>m.id===current.mapId),token=map?.tokens.find(t=>t.id===payload.id);
    return map?.id===payload.from.mapId&&!!token&&token.x===payload.from.x&&token.y===payload.from.y;
  };
  let mutation,saved=false;
  for(let attempt=0;attempt<3;attempt++){
    const command=canRebase(room)?{...input,expectedVersion:room.version}:input;
    const effective=op==='uploadPackAsset'?{...command,payload:{...command.payload,fingerprint:typeof command.payload.image==='string'?await assetFingerprint(command.payload.image):''}}:command;
    const signature=['uploadPackAsset','installContentPack'].includes(op)?await assetFingerprint(JSON.stringify({op,payload,user:user.id})):null;
    mutation=mutateRoom(room,user,effective,undefined,[],source,signature);
    if(!mutation.duplicate&&['portraits','cast','deployCharacter'].includes(op)){
      for(const key of ['characters','cast'])for(const character of mutation.room[key]||[]){
        const previous=room[key]?.find(c=>c.id===character.id);
        await validatePortraitReferences(store,user,character.portraits,previous?.portraits);
      }
    }
    if(op==='deleteCharacter'){
      const c=room.characters.find(c=>c.id===payload.characterId);if(c)await ensureOriginal(store,c);
    }
    if(!mutation.duplicate&&op==='uploadPackAsset')await persistContentAssets(store,mutation.room);
    if(['uploadPackAsset','installContentPack'].includes(op)&&new TextEncoder().encode(JSON.stringify(mutation.room)).length>1800000)throw new TableError('캠페인 자료·기록 저장 한도입니다. 자료를 나누거나 새 캠페인을 사용하세요.');
    if(mutation.duplicate||await store.save(mutation.room,room.version)){saved=true;break;}
    if(!canRebase(room))break;
    room=await store.get(roomId);
    if(!room||room.deletedAt)throw new TableError('테이블을 찾을 수 없습니다.',404);
  }
  if(!saved)throw new TableError('상태가 갱신되었습니다. 최신 상태를 확인하세요.',409);
  if(['createCharacter','character','setupCharacter'].includes(op)){
    const c=mutation.room.characters.find(c=>c.id===mutation.result.characterId);if(c)await ensureOriginal(store,c);
  }
  return { room: visibleRoom(mutation.room, user), me: user, result: mutation.result, duplicate: mutation.duplicate };
}

export const mcpTools = [
  {name:'manage_scenario_checkpoint',description:'방장이 명시적으로 요청했을 때만 시나리오 시작 지점을 저장하거나 하드 리셋합니다. 생성된 시나리오는 시작 지점이 자동 저장됩니다. read_table의 scenarioStarts에서 실제 checkpointId를 선택하고 최신 expectedVersion을 사용하세요. resetScenario는 플레이 대화·GM 기억·시간·자원·전투를 저장된 시점으로 복원하고 진행 중 GM 결과를 무효화합니다. 모델 호출은 없습니다. scenarioResetBackup.id로 직전 초기화를 되돌릴 수 있습니다. saveScenarioStart는 자동 지점이 없는 기존 시나리오의 현재 상태를 시작 지점으로 지정합니다. 요청 ID는 재전송 시 유지하세요.',inputSchema:{type:'object',properties:{roomId:{type:'string'},op:{type:'string',enum:['saveScenarioStart','resetScenario']},expectedVersion:{type:'integer'},requestId:{type:'string'},payload:{type:'object',properties:{checkpointId:{type:'string'}},additionalProperties:false}},required:['roomId','op','expectedVersion','requestId','payload'],additionalProperties:false}},
  {name:'run_player_command',description:'로그인한 참가자의 캐릭터 선택, 토큰 이동, 대사·행동 선언, 시트 판정을 실행합니다. read_table의 최신 버전과 실제 캐릭터 ID를 사용하세요. 조작권은 서버에서 검사합니다. GM 작업은 이 도구로 실행할 수 없습니다.',inputSchema:{type:'object',properties:{roomId:{type:'string'},op:{type:'string',enum:['selectCharacter','moveToken','exploreMove','exploreInteract','message','sheetRoll','roll']},expectedVersion:{type:'integer'},requestId:{type:'string'},payload:{type:'object'}},required:['roomId','op','expectedVersion','requestId','payload'],additionalProperties:false}},
  { name: 'read_gm_policy', description: '밤의 테이블 GM 운영 지침을 읽습니다. 세션 진행 전에 반드시 읽고 규칙 근거, 플레이어 선택권, 비밀 분리, 실행기 판정을 지키세요.', inputSchema: { type:'object', properties:{}, additionalProperties:false } },
  { name: 'list_tables', description: '내가 참가한 밤의 테이블 목록을 읽습니다.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'read_table', description: '로그인한 참가자가 접근할 수 있는 테이블의 상태와 시트를 읽습니다. 일반 참가자에게 GM 비밀과 타인의 관리자 대화는 제공하지 않습니다.', inputSchema: { type: 'object', properties: { roomId: { type: 'string' } }, required: ['roomId'], additionalProperties: false } },
  { name: 'run_table_command', description: 'GM이 장면(scene), 자동 처리(automatic), 규칙 초안(rule), 판정 계획(plan), 판정 실행(resolve), 비밀 기록(secrets), 귓속말(whisper)을 적용합니다. 실제 주사위와 비용·HP는 서버가 계산합니다. rule 활성화는 방장이 화면에서 승인합니다. requestId는 고유값이며 재전송 때 유지하세요. expectedVersion은 read_table의 version입니다. plan에는 actionId, ruleId, scope, risk, targetId가 필요합니다. scene에는 title,narration,speaker. automatic에는 actionId,reason. secrets에는 text. whisper에는 recipient,text. 규칙 초안에는 name,kind(house_rule/source),source 또는 documentId와 quote,formula,comparator(lte/gte),target,costFP,successHpDelta,failureHpDelta. resolve에는 actionId.',
    inputSchema: { type: 'object', properties: { roomId: { type: 'string' }, op: { type: 'string', enum: ['scene', 'automatic', 'rule', 'plan', 'resolve', 'secrets', 'whisper'] }, requestId: { type: 'string' }, expectedVersion: { type: 'integer' }, payload: { type: 'object' } }, required: ['roomId', 'op', 'requestId', 'expectedVersion', 'payload'], additionalProperties: false } }
];
export async function mcpRequest(store, user, request) {
  const { id, method, params = {} } = request;
  const reply = result => ({ jsonrpc: '2.0', id: id ?? null, result });
  if (method === 'server/discover') return reply({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} } });
  if (method === 'initialize') return reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'night-table', version: '0.1.0' } });
  if (method === 'tools/list') return reply({ tools: mcpTools });
  if (method?.startsWith('notifications/')) return null;
  if (method !== 'tools/call') return { jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: 'Method not found' } };
  try {
    if (params.name === 'read_gm_policy') return reply({ content:[{type:'text',text:gmPolicy}] });
    let input;
    if (params.name === 'list_tables') input = { op: 'list' };
    else if (params.name === 'read_table') {
      const result=await tableRequest(store,user,{op:'get',roomId:params.arguments?.roomId},'browser');
      return reply({content:[{type:'text',text:JSON.stringify(result)}]});
    }
    else if(params.name==='run_player_command'){
      input=params.arguments||{};
      if(!['selectCharacter','moveToken','exploreMove','exploreInteract','message','sheetRoll','roll'].includes(input.op))throw new TableError('허용되지 않은 플레이어 작업입니다.',403);
      const result=await tableRequest(store,user,input,'browser');
      return reply({content:[{type:'text',text:JSON.stringify(result)}]});
    }
    else if(params.name==='manage_scenario_checkpoint'){
      input=params.arguments||{};
      if(!['saveScenarioStart','resetScenario'].includes(input.op))throw new TableError('허용되지 않은 시작 지점 작업입니다.',403);
    }
    else if (params.name === 'run_table_command') {
      input = params.arguments || {};
      if (!['scene', 'automatic', 'rule', 'plan', 'resolve', 'secrets', 'whisper'].includes(input.op)) throw new TableError('허용되지 않은 GM 작업입니다.', 403);
    } else throw new TableError('Unknown tool');
    const result = await tableRequest(store, user, input, 'agent');
    return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
  } catch (e) { return reply({ isError: true, content: [{ type: 'text', text: e.message }] }); }
}
