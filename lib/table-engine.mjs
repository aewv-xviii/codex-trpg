import {syncCarrying} from '../public/play/carrying.js';
import {validateContainers} from './containers.mjs';
import {attributePlay} from './play-scope.mjs';
import {declarationEligible,queueDeclarations} from './declaration-queue.mjs';
import {activityCommand,advanceActivities} from './activities.mjs';
import {classifyDocument} from './document-references.mjs';
import {offMapPosition} from '../public/play/off-map-state.js';
import {syncOffMapPositions} from './off-map-position.mjs';
import {ammunitionLedger} from '../public/play/ammo-ledger.js';
import {queueNPCSituation,resumeInterruptedActions} from './npc-agency.mjs';
import {syncAwareness,queueAwareness} from './awareness.mjs';
import {requireScenarioNPC,npcPresentation,observeNPC,maskUnidentifiedNPCs} from './npc-identity.mjs';
import {grantPredatorVisual} from './predator-upgrade.mjs';
import {syncAquariumSheet} from './aquarium-sheet.mjs';
import {resumeAquariumScout} from './aquarium-recovery.mjs';
import {fishRecord} from './aquarium-targets.mjs';
import {npcPresent} from '../public/play/npc-presence.js';
import {shockModifier} from './injury.mjs';
import {initializeConditions,syncConditions,conditionCommand,trySimpleRest,applyInjury,modifier as conditionModifier} from './conditions.mjs';
import {captureScenes,projectSceneArchive,linkLegacyScene} from './scene-archive.mjs';
import {projectPortraitAssets} from './portrait-assets.mjs';
import {inventoryCommand,tryDirectInventory} from './inventory-actions.mjs';
import {rollbackTravel} from './travel-rollback.mjs';
import {markScenarioStart} from './scenario-checkpoints.mjs';
import {samePendingIntent,reconcileActions} from './action-maintenance.mjs';
import {characterPlace,tryDirectWorldTravel} from './world-library.mjs';
import {sceneMessageParts} from '../public/play/message-presentation.js';
import {isGMQuestion} from '../public/play/message-purpose.js';
import {partyDialogue} from '../public/play/dialogue-flow.js';
import {combatCommand,queueCombatAI,settlePreparedCombat,advanceCombatPlans} from './combat.mjs';
import {explorationCommand,spatiallyVisible,refreshExploration} from './exploration.mjs';
import {storyState} from '../public/play/story-state.js';
import {actionSpeech} from './action-speech.mjs';
import {canControl,partyCharacters} from '../public/play/character-control.js';
import {addPartyCharacter,normalizeParty} from './party.mjs';
export {canControl};
// Shared game engine. No model-generated code is executed.
import { portraitSet, presentationFields } from './presentation.mjs';
import { workspace, workspaceCommand, publicWorkspace } from './workspace.mjs';
import { gurpsSuccessRoll, validateGurpsRule, gurpsSheetFields, outcomeLabel } from './gurps.mjs';
export class TableError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function requireRequestId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TableError('유효한 UUID 요청 ID가 필요합니다.');
}
const fail = (message, status) => { throw new TableError(message, status); };
const text = (value, max = 2000, optional = false) => {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) fail(`텍스트는 ${max}자 이내로 입력하세요.`);
  return value.trim();
};
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${min}~${max} 범위의 정수가 필요합니다.`);
  return value;
};
export function parseDice(formula) {
  const match = /^(\d{1,2})d(\d{1,4})([+-]\d{1,4})?$/i.exec(String(formula).replace(/\s/g, ''));
  if (!match) fail('주사위는 3d6 또는 1d20+2 형식으로 입력하세요.');
  const count = integer(Number(match[1]), 1, 30), sides = integer(Number(match[2]), 2, 1000), modifier = integer(Number(match[3] || 0), -1000, 1000);
  return { count, sides, modifier, formula: `${count}d${sides}${modifier > 0 ? '+' + modifier : modifier < 0 ? modifier : ''}` };
}
export function randomDie(sides) {
  const buf = new Uint32Array(1), limit = Math.floor(4294967296 / sides) * sides;
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % sides + 1;
}
export function rollDice(formula, die = randomDie) {
  const spec = parseDice(formula), dice = Array.from({ length: spec.count }, () => die(spec.sides));
  if (dice.some(n => !Number.isInteger(n) || n < 1 || n > spec.sides)) fail('난수 생성 오류', 500);
  return { formula: spec.formula, dice, modifier: spec.modifier, total: dice.reduce((a, b) => a + b, spec.modifier) };
}
export function createRoom(user, title = '새로운 이야기') {
  return { id: crypto.randomUUID(), version: 0, title: text(title, 80), owner: user.id,
    joinCode: crypto.randomUUID().replaceAll('-', ''), createdAt: new Date().toISOString(),
    members: [{ id: user.id, name: text(user.name || '플레이어 1', 60), joinedAt: new Date().toISOString() }],
    scene: { title: '첫 장면', narration: '', background: 'alley', speaker: 'GM' },
    campaign: { system:'gurps4',edition:'GURPS 4판',rulebookId:'',scenarioId:'',sheetTemplate:gurpsSheetFields() },
    characters: [], messages: [], actions: [], rolls: [], rules: [], documents: [], secrets: '', receipts: {}, gmUpdatedAt: null };
}
export function isMember(room, user) { return !!user && room.members.some(m => m.id === user.id); }
export function requireMember(room, user) { if (!isMember(room, user)) fail('이 테이블의 참가자만 접근할 수 있습니다.', 403); }
export function requireOwner(room, user) { requireMember(room, user); if (room.owner !== user.id) fail('방장 권한이 필요합니다.', 403); }
export function visibleRoom(room, user) {
  requireMember(room, user);
  const owner = room.owner === user.id;
  const result = workspace(structuredClone(room));
  publicWorkspace(result,user);
  delete result.receipts;
  delete result.creationSignature;
  if(!owner)delete result.actionErrors;
  if (!owner) { delete result.joinCode; delete result.secrets; }
  result.documents = result.documents.filter(d => owner || d.visibility === 'public');
  result.messages = result.messages.filter(m => !m.recipient || owner || m.recipient === user.id);
  const hiddenCases=new Set((room.chronicle?.cases||[]).filter(c=>c.visibility==='gm').map(c=>c.id));
  if(!owner)result.messages=result.messages.filter(m=>!hiddenCases.has(m.caseId));
  for(const c of [...result.characters,...(result.cast||[])]){if(c.stealth&&!owner)c.stealth={active:c.stealth.active};delete c.npcIntent;}
  if(result.combat?.initiatedBy){delete result.combat.initiatedBy.reason;delete result.combat.initiatedBy.perceptionReason;}
  result.groundMagazines=(result.groundMagazines||[]).filter(g=>owner||room.characters.some(c=>c.id===g.ownerId&&canControl(c,user)));
  if(owner)result.ammunitionLedger=ammunitionLedger(room);else{delete result.ammunitionLedger;for(const c of result.characters)if(!canControl(c,user))delete c.heldMagazine;}
  for(const c of result.characters){if(c.activity){if(!canControl(c,user))delete c.activity;else {c.activity.steps=c.activity.steps.map(s=>({seconds:s.seconds,maneuver:s.maneuver}));delete c.activity.proofs;delete c.activity.sources;}}}
  if(!owner)for(const [id,f] of Object.entries(result.combat?.fighters||{}))if(!canControl(room.characters.find(c=>c.id===id),user)){delete f.plan;delete f.wait;delete f.counterattackTargets;}
  for(const c of [...result.characters,...(result.cast||[])]){delete c.possessionWork;if(c.isNPC&&!canControl(c,user)&&!owner){delete c.assets;delete c.npcPossessions;}}
  if(!owner){
    const held=new Set(result.characters.flatMap(c=>canControl(c,user)?Object.keys(c.assets?.items||{}):[]));
    if(result.economy)result.economy.items=result.economy.items.filter(i=>!i.scenarioPossession||held.has(i.id));
    for(const a of result.actions)if(a.possessionResult){const v=a.possessionResult;delete v.reason;delete v.observers;delete v.victimRoll;delete v.victimNotice;delete v.sources;}
  }
  maskUnidentifiedNPCs(result);projectSceneArchive(result);projectPortraitAssets(result);
  return result;
}
function event(room, type, body, user, extra = {}) {
  const message={id:crypto.randomUUID(),type,text:body,author:user.id,name:user.name,at:new Date().toISOString(),gameClock:structuredClone(room.chronicle?.clock||null),...(room.worldLibrary?{placeId:characterPlace(room,extra.speakerId||room.gmJob?.actorId),sceneTitle:room.scene.title}:{}),...extra};
  const parts=sceneMessageParts(room,message);room.messages.push(...parts);
  if(['gm','narration','npcDialogue'].includes(type)&&parts.at(-1).type!=='gmQuestion'){
    const last=parts.at(-1);Object.assign(room.scene,{speaker:last.name,speakerId:last.speakerId||'',expressionId:last.expressionId||'',narration:last.text});
  }
}
function ownCharacter(room, user, id) {
  if(id){const c=character(room,id);if(!canControl(c,user))fail('이 캐릭터의 조작 권한이 없습니다.',403);return c;}
  const active=room.members.find(m=>m.id===user.id)?.activeCharacterId;
  const c = partyCharacters(room).find(c => c.id===active&&canControl(c,user))||partyCharacters(room).find(c => canControl(c,user));
  if (!c) fail('캐릭터를 먼저 등록하세요.');
  return c;
}
function character(room, id) { return room.characters.find(c => c.id === id) || fail('캐릭터를 찾을 수 없습니다.'); }
function action(room, id) { return room.actions.find(a => a.id === id) || fail('행동을 찾을 수 없습니다.'); }
function sourceRef(room, rule, localEvidence=[]) {
  if(rule.kind==='local_source'){
    const match=/^local:([a-f0-9]{24}):(\d+)$/.exec(rule.documentId||'');
    const book=room.localLibrary?.books?.find(b=>b.id===match?.[1]&&b.kind==='rule');
    const allowed=room.campaign?.localBookIds??room.localLibrary?.books?.filter(b=>b.kind==='rule').map(b=>b.id)??[];
    const proof=localEvidence.find(p=>p.bookId===book?.id&&p.page===Number(match?.[2])&&p.quote===rule.quote?.trim()&&p.digest===book?.digest);
    if(!book||!allowed.includes(book.id)||!proof)fail('연결된 로컬 GM이 확인한 룰북 근거가 필요합니다.',403);
    return `${book.title} · ${book.format==='pdf'?'PDF 페이지':'텍스트 구간'} ${proof.page} (로컬 원문 확인): ${text(proof.quote,500)}`;
  }
  if (rule.kind === 'house_rule') return text(rule.source, 500);
  if (rule.kind !== 'source') fail('규칙 종류를 선택하세요.');
  const doc = room.documents.find(d => d.id === rule.documentId && d.visibility === 'public'&&(!d.role||['rulebook','houseRule'].includes(d.role)));
  if (!doc) fail('공개된 규칙 자료를 먼저 등록하세요.');
  const quote = text(rule.quote, 500);
  if (!doc.content.includes(quote)) fail('인용 문장을 원문에서 찾을 수 없습니다.');
  return `${doc.title}: ${quote}`;
}
export function mutateRoom(original, user, command, die = randomDie, localEvidence = [], accountSource = null, trustedSignature = null) {
  const { op, payload: p = {}, requestId, expectedVersion } = command;
  if (op !== 'join') requireMember(original, user);
  requireRequestId(requestId);
  const signature = trustedSignature ?? JSON.stringify({ op, payload: p, user: user.id });
  const existing = Object.hasOwn(original.receipts, requestId) ? original.receipts[requestId] : null;
  if (existing) {
    if (existing.signature !== signature) fail('이미 사용한 요청 ID입니다.', 409);
    return { room: original, duplicate: true, result: existing.result };
  }
  if (op !== 'join' && expectedVersion !== original.version) fail('다른 참가자가 상태를 갱신했습니다. 새 상태를 확인한 뒤 다시 시도하세요.', 409);
  if(original.archivedAt && op!=='archiveSession')fail('보관한 세션입니다. GM이 재개한 뒤 진행할 수 있습니다.',409);
  const partyMessage=op==='message'&&partyDialogue(original,p);
  if(original.gmJob?.status==='running'&&!partyMessage&&!(op==='message'&&p.kind==='action')&&!['cancelGM'].includes(op))fail('GM이 현재 턴을 처리 중입니다. 잠시 기다리거나 진행을 중단하세요.',409);
  const maintenance=['syncAquariumSheet','grantPredatorVisual','reconcileActions','rollbackTravel','resumeAquariumScout'].includes(op);
  const room = maintenance?structuredClone(original):workspace(structuredClone(original));
  initializeConditions(room);
  let result = {};
  if(room.combat?.status==='active'&&['deleteCharacter','resource','sheet','mapSelect','removeToken','partyCharacter','restore','campaign','startCase','endCase','setClock','advanceClock','finishBeat','playStoryDay','prepareScenario','controlCharacter'].includes(op))fail('전투 종료 후 변경하세요.',409);

  switch (op) {
    case 'join': {
      if (p.code !== room.joinCode) fail('초대 코드가 올바르지 않습니다.', 403);
      if (!isMember(room, user)) {
        if (room.members.length >= 2) fail('두 명의 참가자가 이미 등록되어 있습니다.', 409);
        room.members.push({ id: user.id, name: text(p.name || user.name, 60), joinedAt: new Date().toISOString() });
        event(room, 'system', '새 참가자가 테이블에 합류했습니다.', user);
      }
      break;
    }
    case 'deployCharacter': {
      if(!accountSource||accountSource.owner!==user.id||accountSource.deletedAt)fail('내 보관함의 원본이 필요합니다.',403);
      if(room.characters.length>=20)fail('캐릭터는 테이블당 20명까지 등록할 수 있습니다.');
      if(room.characters.some(c=>(c.accountId||c.id)===accountSource.id))fail('이미 이 세션에 참가한 캐릭터입니다.',409);
      const c={...structuredClone(accountSource.profile),id:crypto.randomUUID(),owner:user.id,controllers:[],accountId:accountSource.id,accountVersion:accountSource.version};
      room.characters.push(c);addPartyCharacter(room,c);
      event(room,'system',`${c.name}이 세션에 합류했습니다.`,user);result={characterId:c.id};break;
    }
    case 'controlCharacter': {
      requireOwner(room,user);
      const c=character(room,p.characterId);
      if(!c.isNPC)fail('플레이어 캐릭터는 본인 계정만 조작합니다. 동료 NPC만 맡길 수 있습니다.',403);
      if(!Array.isArray(p.controllerIds)||p.controllerIds.length>1||p.controllerIds.some(id=>!room.members.some(m=>m.id===id)))fail('세션 참가자를 선택하세요.');
      c.controllers=[...new Set(p.controllerIds)].filter(id=>id!==c.owner);
      for(const m of room.members)if(m.activeCharacterId===c.id&&!canControl(c,m))m.activeCharacterId=room.characters.find(ch=>canControl(ch,m))?.id||'';
      if(room.turn)room.turn.ready=[];
      event(room,'system',`${c.name}의 임시 조작 권한을 ${c.controllers.length?'변경':'회수'}했습니다.`,user);break;
    }
    case 'createNPC':
    case 'createCharacter':
    case 'character': {
      let c = null;
      if(op==='createNPC')requireOwner(room,user);
      if(op==='character')c=p.characterId?character(room,p.characterId):room.characters.find(c=>c.id===room.members.find(m=>m.id===user.id)?.activeCharacterId&&c.owner===user.id)||room.characters.find(c=>c.owner===user.id);
      if(c&&c.owner!==user.id)requireOwner(room,user);
      if (!c) {
        if(room.characters.length>=20)fail('캐릭터는 테이블당 20명까지 등록할 수 있습니다.');
        c = { id: crypto.randomUUID(), owner: user.id, hp: 10, maxHp: 10, fp: 10, maxFp: 10 };
        if(op==='createNPC'){c.isNPC=true;c.controllers=[];if(room.worldLibrary)c.placeId=characterPlace(room,room.members.find(m=>m.id===user.id)?.activeCharacterId);else c.mapId=room.mapId;}
        room.characters.push(c);addPartyCharacter(room,c);
      }
      c.name = text(p.name, 60); c.description = text(p.description || '', 2000, true);
      for(const m of room.maps||[])for(const t of m.tokens)if(t.characterId===c.id)t.name=c.name;
      if(room.scene.speakerId===c.id)room.scene.speaker=c.name;
      if (p.maxHp !== undefined || p.maxFp !== undefined) {
        requireOwner(room, user);
        c.maxHp = integer(p.maxHp, 1, 999); c.maxFp = integer(p.maxFp, 1, 999);
        c.hp = Math.min(c.hp, c.maxHp); c.fp = Math.min(c.fp, c.maxFp);
      }
      event(room, 'system', `${c.name}의 캐릭터 시트를 저장했습니다.`, user);
      result={characterId:c.id};break;
    }
    case 'selectCharacter': {
      const c=character(room,p.characterId);
      if(!canControl(c,user))fail('조작 권한이 있는 캐릭터만 선택할 수 있습니다.',403);
      if(!room.partyCharacterIds.includes(c.id))fail('파티에 참가한 캐릭터만 선택할 수 있습니다.');
      room.members.find(m=>m.id===user.id).activeCharacterId=c.id;
      if(room.turn)room.turn.ready=room.turn.ready.filter(id=>id!==user.id);
      break;
    }
    case 'deleteCharacter': {
      const c=character(room,p.characterId);
      if(c.owner!==user.id)requireOwner(room,user);
      if(p.confirmName!==c.name)fail('삭제할 캐릭터를 다시 확인하세요.',409);
      if(room.gmJob?.status==='queued')fail('GM 요청을 중단한 뒤 캐릭터를 삭제하세요.',409);
      if(room.actions.some(a=>a.status!=='resolved'&&(a.actorId===c.id||a.plan?.targetId===c.id)))
        fail('이 캐릭터와 관련된 대기 행동·판정을 먼저 완료하세요.',409);
      // Historical messages and rolls remain; live references are detached.
      for(const a of room.actions){
        if(a.actorId===c.id)a.actorName=c.name;
        if(a.plan?.targetId===c.id)a.targetName=c.name;
      }
      room.characters=room.characters.filter(ch=>ch.id!==c.id);
      for(const m of room.maps||[])m.tokens=m.tokens.filter(t=>t.characterId!==c.id);
      for(const scene of [room.scene,...(room.scenePresets||[])])if(scene.speakerId===c.id){scene.speakerId='';scene.expressionId='';}
      for(const member of room.members)if(member.activeCharacterId===c.id)member.activeCharacterId=room.characters.find(ch=>canControl(ch,member))?.id||'';
      if(room.turn)room.turn.ready=room.turn.ready.filter(id=>!canControl(c,{id}));
      event(room,'system',`${c.name}의 캐릭터와 연결 토큰을 삭제했습니다. 이전 대화와 판정 기록은 유지됩니다.`,user);
      break;
    }
    case 'portraits': {
      const c = p.characterId?character(room,p.characterId):ownCharacter(room, user);
      if(c.owner!==user.id)requireOwner(room,user);
      c.portraits = portraitSet(p.portraits);
      c.expressionId = c.portraits.some(v => v.id === p.expressionId) ? p.expressionId : (c.portraits[0]?.id || '');
      event(room, 'system', `${c.name}의 초상화를 저장했습니다.`, user);
      break;
    }
    case 'cast': {
      requireOwner(room, user);
      room.cast ||= [];
      if (room.cast.length >= 12 && !p.id) fail('NPC는 12명까지 등록할 수 있습니다.');
      let c = p.id ? room.cast.find(c => c.id === p.id) : null;
      if (p.id && !c) fail('NPC를 찾을 수 없습니다.');
      if (!c) { c = { id: crypto.randomUUID(),...(room.worldLibrary?{placeId:characterPlace(room,room.members.find(m=>m.id===user.id)?.activeCharacterId)}:{mapId:room.mapId}) }; room.cast.push(c); }
      c.name = text(p.name, 60); c.portraits = portraitSet(p.portraits || []);
      event(room, 'system', `${c.name}의 연출 정보를 저장했습니다.`, user);
      result = { characterId: c.id }; break;
    }
    case 'saveScene': {
      requireOwner(room, user); room.scenePresets ||= [];
      if (room.scenePresets.length >= 12) fail('장면은 12개까지 저장할 수 있습니다.');
      const preset = { id: crypto.randomUUID(), title: text(p.title || room.scene.title, 100),
        narration: room.scene.narration, speaker: room.scene.speaker,
        ...presentationFields(room, room.scene) };
      room.scenePresets.push(preset); result = { sceneId: preset.id }; break;
    }
    case 'loadScene': {
      requireOwner(room, user);
      const preset = (room.scenePresets || []).find(s => s.id === p.sceneId);
      if (!preset) fail('저장한 장면을 찾을 수 없습니다.');
      const { id, ...scene } = preset;
      // A scene preset deliberately contains no character resources or rolls.
      room.scene = { ...scene, ...presentationFields(room, scene) };
      event(room, 'gm', scene.narration || scene.title, { id: user.id, name: scene.speaker || 'GM' }, { speakerId: scene.speakerId, expressionId: scene.expressionId });
      break;
    }
    case 'rollbackTravel': result=rollbackTravel(room,user,p);break;
    case 'activityControl': result=activityCommand(room,user,op,p);break;
    case 'classifyDocument': result=classifyDocument(room,user,p);break;
    case 'syncAquariumSheet': result=syncAquariumSheet(room,user,p);break;
    case 'grantPredatorVisual': result=grantPredatorVisual(room,user,p);break;
    case 'resumeAquariumScout': result=resumeAquariumScout(room,user,p);break;
    case 'reconcileActions': result=reconcileActions(room,user,p);break;
    case 'message': {
      const body = text(p.text, 4000), kind = p.kind;
      if (!['action', 'dialogue', 'chat', 'request'].includes(kind)) fail('입력 유형이 올바르지 않습니다.');
      const c = ['chat','request'].includes(kind) ? null : ownCharacter(room, user,p.characterId);
      const deferred=kind==='action'&&(!declarationEligible(room,c.id)||['queued','running','applying','error'].includes(room.gmJob?.status));
      if(p.storyEventId){
        const chronicle=room.chronicle,e=chronicle?.events.find(e=>e.id===p.storyEventId);
        if(kind!=='action'||!e||e.visibility!=='public'||e.kind==='deadline'||(e.caseId&&e.caseId!==chronicle.activeCaseId))fail('선택할 수 없는 사건입니다.',403);
        if(storyState(e,chronicle)!=='available')fail('아직 진행할 수 없는 사건입니다.',409);
        if(e.contentMapId&&room.mapId!==e.mapId)fail('달력에서 해당 장소로 먼저 이동하세요.',409);
        if(room.actions.some(a=>a.storyEventId===e.id&&a.author===user.id&&a.status!=='resolved'))fail('이미 선택한 행동이 진행 중입니다.',409);
      }
      if(p.worldDestination&&(kind!=='action'||user.id!==room.owner||!room.worldLibrary?.definition.places.some(x=>x.id===p.worldDestination)))fail('등록된 장소로의 파티 이동은 방장이 선언하세요.');
      if(kind==='action'&&p.scope!==undefined&&p.scope!=='individual')fail('공동선언 기능이 종료되었습니다. 화면을 새로고침한 뒤 개인 행동으로 보내세요.',410);
      if(p.travelScope!==undefined&&!['party','solo'].includes(p.travelScope))fail('이동 대상을 확인하세요.');
      const id = crypto.randomUUID(), scope='individual';
      if(kind==='action'){
        const candidate={actorId:c.id,author:user.id,text:body,travelScope:p.travelScope,worldFrom:room.worldLibrary?characterPlace(room,c.id):'',worldDestination:p.worldDestination,storyEventId:p.storyEventId};
        const existing=room.actions.find(a=>a.scope==='individual'&&['pending','planned'].includes(a.status)&&samePendingIntent(a,candidate));
        if(existing){if(room.actionErrors?.[existing.id])fail('이 선언은 처리 중 오류가 났습니다. AI GM의 미처리 선언에서 재시도하거나 취소하세요.',409);result={actionId:existing.id,existingAction:true};break;}
        if(room.actions.some(a=>a.actorId===c.id&&a.author===user.id&&a.status==='pending'&&room.actionErrors?.[a.id]))fail('이전 선언의 처리 오류를 확인하세요. AI GM에서 재시도하거나 취소한 뒤 새 행동을 보낼 수 있습니다.',409);
      }
      const targetId=kind==='dialogue'&&!partyMessage?(p.targetId||''):'';
      const target=targetId?[...room.characters,...(room.cast||[])].find(c=>c.id===targetId):null;
      if(targetId&&!target)fail('대화 상대를 찾을 수 없습니다.');
      if(targetId&&!npcPresent(room,target,characterPlace(room,c.id)||room.scene?.placeId))fail('현재 장소에 없는 NPC와는 대화할 수 없습니다.',403);
      if(targetId){const view=visibleRoom(room,user),known=[...view.characters,...(view.cast||[])].some(c=>c.id===targetId);const hidden=room.maps.some(m=>m.tokens.some(t=>t.characterId===targetId&&t.hidden));if(!known||(hidden&&!target.contentRevealed&&!['heard','detected'].includes(target.npcIdentity?.state)))fail('공개된 인물에게 말을 걸어주세요.',403);}
      const npcTarget=target&&!room.characters.some(c=>c.id===targetId&&(!c.isNPC||c.controllers?.length));
      const immediate=!partyMessage&&(kind==='request'||npcTarget||(kind==='dialogue'&&p.askGM===true)||(kind==='action'&&scope==='individual'));
      if(immediate&&kind!=='action'&&['queued','running'].includes(room.gmJob?.status))fail('앞선 GM 응답이 끝난 뒤 요청하세요.',409);
      if(kind==='action'&&room.actions.some(a=>a.actorId===c.id&&['pending','planned'].includes(a.status)&&(a.deferred!==undefined||['queued','running'].includes(room.gmJob?.status)&&room.gmJob?.actionIds?.includes(a.id))))fail('이 인물의 기존 선언을 마치거나 취소하세요.',409);
      if (kind === 'action') room.actions.push({ deferred, id, actorId: c.id, author: user.id, text: body, scope, ...(p.travelScope?{travelScope:p.travelScope}:{}), ...(room.worldLibrary?{worldFrom:characterPlace(room,c.id)}:{}), ...(p.worldDestination?{worldDestination:p.worldDestination}:{}), ...(p.storyEventId?{storyEventId:p.storyEventId}:{}), status: 'pending', at: new Date().toISOString() });
      const expressionId = p.expressionId || c?.expressionId || '';
      if (expressionId && !c?.portraits?.some(v => v.id === expressionId)) fail('등록한 초상화을 선택하세요.');
      event(room, kind, body, user, { name: c?.name || user.name, actionId: kind === 'action' ? id : null, speakerId: c?.id || '', expressionId, targetId,...(partyMessage?{audience:'party'}:{}),...(kind==='request'?{channel:'admin',recipient:user.id}:{}) });
              const declarationMessageId=room.messages.at(-1).id;
        if(kind==='action'){
          const speech=actionSpeech(body,[...room.characters,...(room.cast||[])].filter(person=>person.id!==c.id).map(person=>person.name));
          for(const line of speech)event(room,'dialogue',line,user,{name:c.name,speakerId:c.id,expressionId,actionId:id,actionSpeech:true,sourceMessageId:declarationMessageId});
          if(speech.length&&!deferred){c.expressionId=expressionId;room.scene={...room.scene,speaker:c.name,speakerId:c.id,expressionId,narration:speech.at(-1)};}
        }
if((partyMessage||deferred)&&room.gmJob?.status==='running')room.gmJob.conversationRevisions=(room.gmJob.conversationRevisions||0)+1;
      if (kind === 'dialogue'&&!partyMessage) { c.expressionId=expressionId;room.scene = { ...room.scene, speaker: c.name, speakerId: c.id, expressionId, narration: body }; }
      const directTravel=kind==='action'&&!deferred&&(tryDirectInventory(room,user,room.actions.find(a=>a.id===id),die)||trySimpleRest(room,room.actions.find(a=>a.id===id),die)||tryDirectWorldTravel(room,user,room.actions.find(a=>a.id===id)));
      if(immediate&&!deferred&&!directTravel)room.gmJob={id:crypto.randomUUID(),status:'queued',kind:kind==='action'?'individual':kind,at:new Date().toISOString(),requesterId:user.id,actorId:c?.id||'',targetId,messageId:declarationMessageId,requestText:body,...(kind==='action'?{actionIds:[id]}:{})};
      result = { actionId: kind === 'action' ? id : null };
      break;
    }
    case 'roll': {
      const c=ownCharacter(room,user,p.characterId);
      const roll = { id: crypto.randomUUID(), author: user.id, actorId:c.id,name:c.name, ...rollDice(p.formula, die), at: new Date().toISOString(), free: true };
      room.rolls.push(roll); event(room, 'roll', `${roll.formula} → ${roll.total}`, user, { rollId: roll.id }); result = { roll }; break;
    }
    case 'document': {
      requireOwner(room, user);
      if (!['public', 'gm'].includes(p.visibility)) fail('공개 범위를 선택하세요.');
      const doc = { id: crypto.randomUUID(), title: text(p.title, 100), content: text(p.content, 200000), visibility: p.visibility, at: new Date().toISOString() };
      if (room.documents.length >= 30) fail('자료는 최대 30개까지 등록할 수 있습니다.');
      room.documents.push(doc); result = { documentId: doc.id }; break;
    }
    case 'rule': {
      requireOwner(room, user);
      const rule = { id: crypto.randomUUID(), name: text(p.name, 100), kind: p.kind, source: sourceRef(room, p, localEvidence),
        formula: parseDice(p.formula).formula, comparator: p.comparator,
        target: integer(p.target, -1000, 31000), costFP: integer(p.costFP ?? 0, 0, 100),
        successHpDelta: integer(p.successHpDelta ?? 0, -100, 100), failureHpDelta: integer(p.failureHpDelta ?? 0, -100, 100),
        attribute:['ST','DX','IQ','HT','Will','Per'].includes(p.attribute)?p.attribute:'',reactive:p.reactive===true, status: p.activate === true ? 'active' : 'draft', version: room.rules.length + 1 };
      if (!['lte', 'gte'].includes(rule.comparator)) fail('성공 기준을 선택하세요.');
      rule.resolution = room.campaign.system || 'generic';
      if (rule.resolution === 'gurps4') { try { validateGurpsRule(rule); } catch(e) { fail(e.message); } }
      if (room.rules.length >= 100) fail('규칙은 최대 100개까지 등록할 수 있습니다.');
      room.rules.push(rule); event(room, 'system', `규칙 ${rule.name}: ${rule.status === 'active' ? '활성화' : '승인 대기'}`, user); result = { ruleId: rule.id }; break;
    }
    case 'approveRule': {
      requireOwner(room, user); const rule = room.rules.find(r => r.id === p.ruleId); if (!rule) fail('규칙을 찾을 수 없습니다.');
      rule.resolution = room.campaign.system || 'generic';
      if (rule.resolution === 'gurps4') { try { validateGurpsRule(rule); } catch(e) { fail(e.message); } }
      rule.status = 'active'; event(room, 'system', `규칙 ${rule.name}을 승인했습니다.`, user); break;
    }
    case 'plan': {
      requireOwner(room, user);
      const a = action(room, p.actionId), rule = room.rules.find(r => r.id === p.ruleId && r.status === 'active');
      if (a.status !== 'pending') fail('이미 처리 중이거나 완료된 행동입니다.', 409);
      if (!rule) fail('승인된 규칙을 선택하세요.');
      if(p.conditionContext&&!['concentration','approachDetection'].includes(p.conditionContext))fail('상태 보정 맥락을 확인하세요.');
      if(p.conditionContext==='approachDetection'&&rule.attribute!=='Per'&&!/관찰|Observation/i.test(rule.name))fail('접근 감지는 Per·관찰 판정에만 적용합니다.');
      a.plan = { conditionContext:p.conditionContext||'', rule: structuredClone(rule), scope: text(p.scope, 1000), risk: text(p.risk, 1000), targetId: character(room, p.targetId || a.actorId).id };
      a.status = 'planned'; event(room, 'plan', `판정 준비: ${a.plan.scope}`, user, { actionId: a.id }); break;
    }
    case 'resolve': {
      const a = action(room, p.actionId);
      if (a.author !== user.id && room.owner !== user.id) fail('본인의 행동만 판정할 수 있습니다.', 403);
      if (a.status !== 'planned') fail('확정된 판정 계획이 필요합니다.', 409);
      const actor = character(room, a.actorId), target = character(room, a.plan.targetId), rule = a.plan.rule;
      if(!canControl(actor,user))fail('이 캐릭터의 조작 권한이 회수되었습니다.',403);
      if (actor.fp < rule.costFP) fail('FP가 부족합니다.');
      const scopes=/관찰|Observation/i.test(rule.name)?['observation','vision','sense:vision']:/시각|Vision/i.test(rule.name)?['vision','sense:vision']:/청각|Hearing/i.test(rule.name)?['hearing','sense:hearing']:/후각|Smell/i.test(rule.name)?['smell','sense:smell']:/촉각|Touch/i.test(rule.name)?['touch','sense:touch']:/미각|Taste/i.test(rule.name)?['sense:taste']:/집중|Concentration/i.test(rule.name)?['concentration']:[];
      if(a.plan.conditionContext&&!scopes.includes(a.plan.conditionContext))scopes.push(a.plan.conditionContext);
      const statusModifier=rule.resolution==='gurps4'?scopes.reduce((n,k)=>n+conditionModifier(actor,k),0)+shockModifier(room,actor,rule.attribute||(/^(DX|IQ|Will|Per)(?:\s|$)/.exec(rule.name)?.[1]),{reactive:rule.reactive}):0;
      const effectiveTarget=rule.target+statusModifier;
      if(rule.resolution==='gurps4'&&effectiveTarget<3)fail('상태 보정 후 유효 기능이 3 미만입니다.');
      const rolled = rollDice(rule.formula, die);
      const outcome = rule.resolution === 'gurps4' ? gurpsSuccessRoll(rolled.total,effectiveTarget) : {success:rule.comparator === 'lte' ? rolled.total <= rule.target : rolled.total >= rule.target};
      const {success} = outcome;
      const delta = success ? rule.successHpDelta : rule.failureHpDelta;
      actor.fp -= rule.costFP;
      const oldHp = target.hp;if(delta<0&&room.campaign.system==='gurps4')applyInjury(room,target,-delta,die);else target.hp = Math.min(target.maxHp, Math.max(-target.maxHp * 5, target.hp + delta));
      const roll = { id: crypto.randomUUID(), author: a.author, name: actor.name, ...rolled, ...outcome, resolution:rule.resolution||'generic', target: effectiveTarget, baseTarget:rule.target, statusModifier, comparator: rule.comparator,
        actionId: a.id, source: rule.source, ruleId: rule.id, ruleVersion: rule.version, scope: a.plan.scope, risk: a.plan.risk,
        costFP: rule.costFP, hpDelta: target.hp - oldHp, targetId: target.id, at: new Date().toISOString(), free: false };
      room.rolls.push(roll); a.status = 'resolved'; a.resolutionId = roll.id;
      if(room.gmJob?.status==='done'&&!room.actions.some(pending=>pending.status!=='resolved'&&(!room.gmJob.actionIds||room.gmJob.actionIds.includes(pending.id))))room.gmJob={id:crypto.randomUUID(),status:'queued',kind:'narration',actionIds:[a.id],advanceTurn:a.scope!=='individual',at:new Date().toISOString()};
      event(room, 'roll', `${actor.name}: ${rolled.total}, ${outcomeLabel(roll)}`, user, { rollId: roll.id, actionId: a.id }); result = { roll }; break;
    }
    case 'automatic': {
      requireOwner(room, user); const a = action(room, p.actionId);
      if (a.status !== 'pending') fail('미처리 행동에만 자동 처리를 적용할 수 있습니다.', 409);
      a.status = 'resolved'; a.reason = text(p.reason, 2000);
      event(room, 'adjudication', a.reason, { id: user.id, name: 'GM' }, { actionId: a.id }); room.gmUpdatedAt = new Date().toISOString(); break;
    }
    case 'adminReply': {
      requireOwner(room,user);
      if(room.gmJob?.kind!=='request')fail('관리자 요청에만 답할 수 있습니다.');
      event(room,'adminReply',text(p.text,4000),{id:user.id,name:'AI 관리자'},{channel:'admin',recipient:room.gmJob.requesterId||room.owner});break;
    }
    case 'gmQuestion': {
      requireOwner(room,user);
      event(room,'gmQuestion',text(p.text,4000),{id:user.id,name:'GM 확인'});
      room.gmUpdatedAt=new Date().toISOString();break;
    }
    case 'observeNPC': {
      requireOwner(room,user);
      const person=requireScenarioNPC(room,p.characterId);
      const map=room.maps.find(m=>m.id===room.mapId),token=map?.tokens.find(t=>t.characterId===person.id);
      if(p.mode==='seen'&&map?.exploration&&(!token||!spatiallyVisible(room,map,token))&&!room.characters.some(c=>offMapPosition(room,c.id)?.canSeeScene&&offMapPosition(room,c.id)?.mapId===map.id&&room.partyCharacterIds.includes(c.id)))fail('현재 직접 시야에 들어온 인물만 육안 확인할 수 있습니다.');
      observeNPC(room,p);
      if(p.mode==='seen'&&token)token.hidden=false;
      result={characterId:person.id};break;
    }
    case 'narration':
    case 'npcDialogue': {
      requireOwner(room,user);
      const body=text(p.text,4000);let speakerId='',speaker='상황 설명',expressionId='';
      if(isGMQuestion({type:op,text:body})){
        event(room,'gmQuestion',body,{id:user.id,name:'GM 확인'});
        room.gmUpdatedAt=new Date().toISOString();break;
      }
      if(op==='npcDialogue'){
        const people=[...room.characters,...(room.cast||[])];let person;
        if(p.speakerId){person=people.find(c=>c.id===p.speakerId);if(!person)fail('NPC를 찾을 수 없습니다.');}
        else {
          const name=text(p.name,60),matches=people.filter(c=>c.name===name);
          if(matches.length>1)fail('동명이인은 NPC ID를 지정하세요.');
          person=matches[0];
          if(!person)fail('등록되지 않은 NPC를 만들 수 없습니다. 시나리오 NPC ID를 사용하세요.');
        }
        if(room.characters.some(c=>c.id===person.id)&&(!person.isNPC||person.controllers?.length))fail('플레이어가 조작하는 인물의 대사를 대신 작성할 수 없습니다.',403);
        requireScenarioNPC(room,person.id);
        if(!['heard','detected'].includes(person.npcIdentity?.state)&&!npcPresent(room,person,(room.gmJob?.status==='applying'?characterPlace(room,room.gmJob.actorId):room.scene?.placeId||room.worldLibrary?.placeId)||room.scene?.placeId))fail('현재 장소에 없는 NPC는 대사에 등장할 수 없습니다.');
        if(!npcPresentation(person).identified&&!person.npcIdentity)fail('먼저 NPC 감지 또는 관찰 근거를 기록하세요.');
        speakerId=person.id;speaker=npcPresentation(person).name;expressionId=person.expressionId||person.portraits?.[0]?.id||'';
      }
      Object.assign(room.scene,{speakerId,speaker,expressionId,narration:body});
      event(room,op,body,{id:user.id,name:speaker},{speakerId,expressionId,sceneTitle:room.scene.title,...(speakerId?{speakerPresentation:npcPresentation(requireScenarioNPC(room,speakerId))}:{})});
      room.gmUpdatedAt=new Date().toISOString();break;
    }
    case 'scene': {
      requireOwner(room, user);
      if(p.appearanceOnly===true){
        const appearance=presentationFields(room,{background:p.background,speakerId:room.scene.speakerId,expressionId:room.scene.expressionId});
        room.scene.title=text(p.title,100);room.scene.background=appearance.background;
        event(room,'system','장면 배경을 변경했습니다.',user);break;
      }
      room.scene.title = text(p.title, 100); room.scene.narration = text(p.narration, 5000);
      Object.assign(room.scene, presentationFields(room, p));
      const speaker = [...room.characters, ...(room.cast || [])].find(c => c.id === room.scene.speakerId);
      room.scene.speaker = speaker?.name || text(p.speaker || 'GM', 60);
      event(room, 'gm', room.scene.narration, { id: user.id, name: room.scene.speaker }, { speakerId: room.scene.speakerId, expressionId: room.scene.expressionId }); room.gmUpdatedAt = new Date().toISOString(); break;
    }
    case 'whisper': {
      requireOwner(room, user);
      if (!room.members.some(m => m.id === p.recipient)) fail('참가자를 찾을 수 없습니다.');
      event(room, 'whisper', text(p.text, 4000), { id: user.id, name: 'GM' }, { recipient: p.recipient }); break;
    }
    case 'secrets': { requireOwner(room, user); room.secrets = text(p.text || '', 20000, true); break; }
    case 'sheetRoll': {
      const c=character(room,p.characterId);
      if(!canControl(c,user))fail('이 캐릭터의 조작 권한이 없습니다.',403);
      if(room.campaign?.system!=='gurps4')fail('겁스 테이블에서 사용할 수 있는 판정입니다.');
      if(p.sheetRevision!==(c.sheetRevision||0))fail('시트가 변경되었습니다. 다시 열어 확인하세요.',409);
      const f=c.fields?.[integer(p.fieldIndex,0,119)];
      if(!f||!String(f.value).trim())fail('저장된 수치가 필요합니다.');
      // A whole integer only: annotations, CP costs, and damage expressions are not target levels.
      if(!/^\d+$/.test(String(f.value).trim()))fail('판정할 수치는 정수로 입력하세요.');
      const base=integer(Number(f.value),3,999),modifier=integer(p.modifier??0,-100,100),target=integer(base+modifier,3,999);
      const rolled=rollDice('3d6',die),outcome=gurpsSuccessRoll(rolled.total,target);
      const roll={id:crypto.randomUUID(),...rolled,...outcome,actorId:c.id,target,base,skillModifier:modifier,fieldName:f.name,
        source:`${c.name} · ${f.name} ${base}${modifier?` (${modifier>0?'+':''}${modifier})`:''} → 목표 ${target}`,
        scope:'시트 성공 판정 · 피해와 자원 변화는 별도 처리',costFP:0,hpDelta:0,at:new Date().toISOString()};
      room.rolls.push(roll);event(room,'roll',`${c.name} · ${f.name}: ${rolled.total} / ${target} · ${outcomeLabel(roll)}`,user,{rollId:roll.id});
      result={roll};break;
    }
    case 'resource': {
      requireOwner(room, user); const c = character(room, p.characterId), reason = text(p.reason, 500);
      const old = { hp: c.hp, fp: c.fp, maxHp: c.maxHp, maxFp: c.maxFp };
      c.maxHp = integer(p.maxHp ?? c.maxHp, 1, 999); c.maxFp = integer(p.maxFp ?? c.maxFp, 1, 999);
      c.hp = integer(p.hp, -c.maxHp * 5, c.maxHp); c.fp = integer(p.fp, 0, c.maxFp);
      event(room, 'correction', `${c.name} 상태 조정: ${reason}`, user, { before: old, after: { hp: c.hp, fp: c.fp, maxHp: c.maxHp, maxFp: c.maxFp } }); break;
    }
    case 'settings': {
      requireOwner(room, user); room.title = text(p.title, 80);
      if(p.session!==undefined){
        const s=p.session;
        if(!s||typeof s!=='object'||Array.isArray(s))fail('세션 정보를 확인하세요.');
        const nextAt=s.nextAt||'';
        if(nextAt&&(!Number.isFinite(Date.parse(nextAt))||!/(Z|[+-]\d\d:\d\d)$/.test(nextAt)))fail('다음 일정을 확인하세요.');
        room.session={episode:integer(s.episode??1,1,9999),recap:text(s.recap||'',4000,true),nextAt:nextAt?new Date(nextAt).toISOString():''};
      }
      break;
    }
    case 'archiveSession': {
      requireOwner(room,user);
      if(typeof p.archived!=='boolean')fail('보관 상태를 확인하세요.');
      if(['queued','running'].includes(room.gmJob?.status))fail('GM 진행을 완료하거나 중단한 뒤 보관하세요.',409);
      room.archivedAt=p.archived?new Date().toISOString():null;
      event(room,'system',p.archived?'세션을 보관했습니다.':'세션을 재개했습니다.',user);
      break;
    }
    case 'linkLegacyScene': {requireOwner(room,user);linkLegacyScene(room,p);break;}
    case 'rotateInvite': { requireOwner(room, user); room.joinCode = crypto.randomUUID().replaceAll('-', ''); break; }
    default: { const inventoryResult=inventoryCommand(room,user,op,p,die);const conditionResult=inventoryResult===null?conditionCommand(room,user,op,p,die):inventoryResult;const exploreResult=conditionResult===null?explorationCommand(room,user,op,p,die):conditionResult;const combatResult=exploreResult===null?combatCommand(room,user,op,p,die):exploreResult;const handled=combatResult===null?workspaceCommand(room,user,op,p):combatResult; if(handled===null)fail('지원하지 않는 작업입니다.'); result=handled; }
  }
  if(!maintenance&&!(op==='message'&&p.kind==='action'&&['queued','running'].includes(original.gmJob?.status))){
    normalizeParty(room);syncOffMapPositions(room);syncAwareness(room,original);queueAwareness(room);
    refreshExploration(room,room.maps.find(m=>m.id===room.mapId));
    if(!partyMessage&&!(room.gmJob?.kind==='combatReaction'&&room.gmJob.status==='applying')){settlePreparedCombat(room,die);syncConditions(room,die,{rebase:['setClock','restore'].includes(op)});advanceActivities(room,die);advanceCombatPlans(room,die);queueDeclarations(room);queueCombatAI(room);resumeInterruptedActions(room);if(!room.actions.find(a=>a.id===result.actionId)?.deferred)queueNPCSituation(room,original,op,p);}
  }
  const episodeId=room.chronicle?.activeEpisodeId||original.chronicle?.activeEpisodeId||'';
  for(const m of room.messages.slice(original.messages.length)){if(m.channel!=='admin'&&!['request','adminReply'].includes(m.type)){m.episodeId=episodeId;m.gameClock??=structuredClone(room.chronicle?.clock||null);}}
  validateContainers(room);syncCarrying(room);
  attributePlay(room,original);
  captureScenes(room,original.messages.length);
  if(['applyPreparation','startCase','enterContentCase','installWorldLibrary','demo'].includes(op)&&room.chronicle?.activeCaseId!==original.chronicle?.activeCaseId&&!original.chronicle?.cases?.find(c=>c.id===room.chronicle.activeCaseId)?.startedAt)markScenarioStart(room,op==='enterContentCase'?'opening':'prepared');
  if (room.messages.length > 10000 || JSON.stringify(room).length > 4000000) fail('세션 저장 한도에 도달했습니다. 기록을 내보내고 새 테이블을 만드세요.');
  room.version += 1;
  room.updatedAt = new Date().toISOString();
  room.receipts[requestId] = { signature, result };
  return { room, result, duplicate: false };
}
