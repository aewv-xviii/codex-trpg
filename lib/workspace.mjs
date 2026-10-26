import {vehicleCommand} from './vehicle-management.mjs';
import {containerCommand} from './containers.mjs';
import {factionCommand,publicFactions} from './factions.mjs';
import {scopeCommand} from './play-scope.mjs';
import {normalizeReferences} from './document-references.mjs';
import {requireLocalAccess} from '../public/play/off-map-state.js';
import {fishRecord} from './aquarium-targets.mjs';
import {syncAmmoSpecs} from './firearms.mjs';
import {restoreClue} from './clues.mjs';
import {publicScenarioCheckpoints} from './scenario-checkpoints.mjs';
import {actorMapId,viewerActorId,placeArrivingTokens} from './location-presentation.mjs';
import {projectPortraitAssets} from './portrait-assets.mjs';
import {worldCommand,publicWorld} from './world-library.mjs';
import {endProgress,retryJob} from './gm-progress.mjs';
import {contentPackCommand,publicContentState} from './content-packs.mjs';
import {economy,economyCommand,recordEconomyRestore} from './economy.mjs';
import {campaignSetup,setupCharacter} from './campaign-setup.mjs';
import {combatMove} from './combat.mjs';
import {moveExploration,projectExploration,refreshExploration} from './exploration.mjs';
import {queueStoryDay} from './story-play.mjs';
import {canControl as controls} from '../public/play/character-control.js';
import {preparationCommand} from './scenario-preparation.mjs';
import {normalizeParty,setPartyCharacter} from './party.mjs';
import {dismissCompanion} from './companions.mjs';
import {chronicle,publicChronicle,chronicleCommand} from './chronicle.mjs';
import { imageSource } from './presentation.mjs';
import { gurpsSheetFields } from './gurps.mjs';
const bad = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const str = (v, max=2000, empty=false) => typeof v==='string' && v.length<=max && (empty || v.trim()) ? v.trim() : bad('입력 내용을 확인하세요.');
const num = (v,min,max) => Number.isFinite(v)&&v>=min&&v<=max ? v : bad('좌표 또는 수치 범위를 확인하세요.');
const owner = (r,u) => { if(r.owner!==u.id) bad('방장 권한이 필요합니다.',403); };
const log = (r,u,text) => r.messages.push({id:crypto.randomUUID(),type:'system',text,author:u.id,name:u.name,at:new Date().toISOString()});
export const newMap = (system='generic') => ({id:crypto.randomUUID(),title:'이름 없는 골목',image:'/play/city-map.png',columns:24,rows:16,unit:system==='gurps4'?1:1.5,distanceUnit:system==='gurps4'?'yd':'m',grid:true,tokens:[],fog:[],pins:[]});
export function workspace(r) {
 normalizeReferences(r);
 normalizeParty(r);
 chronicle(r);
 r.maps ||= [{...newMap(r.campaign?.system),id:'default-map'}]; r.mapId ||= r.maps[0]?.id||'';
 r.campaign ||= {rulebookId:'',scenarioId:'',edition:'',sheetTemplate:[]};
 r.campaign.system ||= 'generic';
 r.turn ||= {number:1,ready:[]}; r.notes ||= []; r.checkpoints ||= [];
 r.gmJob ||= {status:'idle'};r.gmMemory ||= [];
  economy(r);
 syncAmmoSpecs(r);
 return r;
}
export function publicWorkspace(r,u) {
 publicFactions(r,u);
 publicScenarioCheckpoints(r,u);
 publicChronicle(r,u);
 if(r.playScope?.caseId&&!r.chronicle.cases.some(c=>c.id===r.playScope.caseId))delete r.playScope;
 publicWorld(r,u);
 projectExploration(r);
 delete r.travelRollbacks;delete r.aiPrivate; delete r.gmMemory; delete r.bridgeHash;delete r.bridgeParentId;
 r.checkpoints=(r.checkpoints||[]).map(({id,title,at})=>({id,title,at}));
 if(r.owner!==u.id) {
  delete r.gmHistory;
  if(r.gmJob){delete r.gmJob.message;delete r.gmJob.requestText;delete r.gmJob.title;}
  for(const key of ['bible','sourceFiles','gmInstructions','openingPrompt','caseScenario','caseTitle'])delete r.campaign[key];
  if(r.gmJob?.kind==='preparation') {delete r.gmJob.requestText;delete r.gmJob.title;delete r.gmJob.message;}
  if(r.localLibrary)r.localLibrary.books=r.localLibrary.books.filter(b=>b.kind==='rule');
  r.notes=(r.notes||[]).filter(n=>n.visibility==='public'&&(!n.caseId||r.chronicle.cases.some(c=>c.id===n.caseId))&&(!n.knownTo||r.characters.some(c=>controls(c,u)&&n.knownTo.includes(c.id))));
  if(r.economy){r.economy.ledger=r.economy.ledger.filter(x=>!x.caseId||r.chronicle.cases.some(c=>c.id===x.caseId));if(r.economy.visit?.caseId&&!r.chronicle.cases.some(c=>c.id===r.economy.visit.caseId))r.economy.visit=null;}
  for(const m of r.maps||[]) {m.tokens=m.tokens.filter(t=>!t.hidden);m.pins=m.pins.filter(p=>!p.hidden);}
 }
 if(r.gmJob) { delete r.gmJob.proposal; delete r.gmJob.lease;if(r.gmJob.kind==='request'&&r.gmJob.requesterId!==u.id){delete r.gmJob.requestText;delete r.gmJob.message;} }
 publicContentState(r,u);
 projectPortraitAssets(r);
}
export function workspaceCommand(r,u,op,p) {
 const vehicle=vehicleCommand(r,u,op,p);if(vehicle!==null)return vehicle;
 const container=containerCommand(r,u,op,p);if(container!==null)return container;
 const faction=factionCommand(r,u,op,p);if(faction!==null)return faction;
 const scope=scopeCommand(r,u,op,p);if(scope!==null)return scope;
 if(op==='restoreClue'){owner(r,u);return restoreClue(r,p);}
 const world=worldCommand(r,u,op,p);if(world!==null)return world;
 const content=contentPackCommand(r,u,op,p);if(content!==null)return content;
 const transaction=economyCommand(r,u,op,p);if(transaction!==null)return transaction;
 if(op==='setupCharacter')return setupCharacter(r,u,p);
 if(op==='campaignSetup')return campaignSetup(r,u,p);
 if(op==='playStoryDay')return queueStoryDay(r,u,p);
 const preparation=preparationCommand(r,u,op,p);if(preparation!==null)return preparation;
 if(op==='partyCharacter')return setPartyCharacter(r,u,p);
 if(op==='dismissCompanion')return dismissCompanion(r,u,p);
 const timelineResult=chronicleCommand(r,u,op,p);if(timelineResult!==null)return timelineResult;
 const supported=['map','mapSelect','token','moveToken','removeToken','fog','pin','sheet','campaign','sheetTemplate','approveTemplate','note','ready','queueGM','cancelGM','cancelAction','retryGM','checkpoint','restore','demo'];
 if(!supported.includes(op)) return null;
 workspace(r);
 const map=()=>r.maps.find(m=>m.id===(p.mapId||p.from?.mapId||r.mapId))||bad('지도를 찾을 수 없습니다.');
 switch(op) {
 case 'map': {
  owner(r,u); let m=p.id?r.maps.find(m=>m.id===p.id):null;
  if(p.id&&!m) bad('지도를 찾을 수 없습니다.');
  if(!m){if(r.maps.length>=10)bad('지도는 10개까지 저장할 수 있습니다.');m=newMap(r.campaign.system);r.maps.push(m);}
  m.title=str(p.title,100); if(p.image!==undefined)m.image=p.image==='/play/city-map.png'?p.image:imageSource(p.image,false);
  for(const key of ['columns','rows']) {const n=num(p[key]??m[key],4,80);if(!Number.isInteger(n))bad('격자 수는 정수여야 합니다.');m[key]=n;}
  m.unit=num(p.unit??m.unit,.1,100);m.distanceUnit=p.distanceUnit??m.distanceUnit??'m';if(!['m','yd'].includes(m.distanceUnit))bad('거리 단위를 선택하세요.');m.grid=p.grid!==false;r.mapId=m.id;return {mapId:m.id};
 }
 case 'mapSelect':owner(r,u);if(map().contentRef)bad('준비된 지역은 달력의 현지 이동으로 들어가세요.');r.mapId=map().id;break;
 case 'token': {
  const c=r.characters.find(c=>c.id===p.characterId);
  if(p.characterId&&!c)bad('캐릭터를 찾을 수 없습니다.');requireLocalAccess(r,c?.id);
  if(!c)owner(r,u);else if(!controls(c,u)&&r.owner!==u.id)bad('이 캐릭터의 조작 권한이 없습니다.',403);
  const currentMapId=r.worldLibrary?actorMapId(r,c?.id||viewerActorId(r,u)):r.mapId;
  const m=r.maps.find(m=>m.id===(p.mapId||currentMapId));if(!m)bad('현재 장소에 준비된 지도가 없습니다.');
  if(r.worldLibrary&&m.id!==currentMapId)bad('캐릭터가 있는 장소에만 토큰을 배치할 수 있습니다.');
  if(m.exploration&&(!c||!r.partyCharacterIds.includes(c.id)||p.x!==undefined||p.y!==undefined||p.hidden===true))bad('준비된 탐색 지도에서는 인물을 임의 배치할 수 없습니다.');
  if(r.combat?.status==='active')bad('전투 중에는 토큰을 추가할 수 없습니다.');
  if(c&&m.tokens.some(t=>t.characterId===c.id))bad('이미 이 지도에 배치된 캐릭터입니다.');
  if(m.tokens.length>=40)bad('토큰은 지도당 40개까지 가능합니다.');
  if(m.exploration){placeArrivingTokens(r,m.id,[c.id]);refreshExploration(r,m);return {tokenId:m.tokens.find(t=>t.characterId===c.id).id};}
  const anchor=c?m.tokens.find(t=>r.partyCharacterIds.includes(t.characterId)&&!t.hidden):null;
  const step=1.5/m.columns;
  const spawnX=anchor?(anchor.x+step<=1?anchor.x+step:Math.max(0,anchor.x-step)):.5;
  const t={id:crypto.randomUUID(),characterId:c?.id||'',name:c?.name||str(p.name,60),x:num(p.x??spawnX,0,1),y:num(p.y??anchor?.y??.5,0,1),hidden:r.owner===u.id&&p.hidden===true};
  m.tokens.push(t);return {tokenId:t.id};
 }
 case 'moveToken': {
  const m=map(),t=m.tokens.find(t=>t.id===p.id);if(!t)bad('토큰을 찾을 수 없습니다.');requireLocalAccess(r,t.characterId);
  if(r.worldLibrary&&r.combat?.status!=='active'&&m.id!==actorMapId(r,t.characterId))bad('캐릭터가 있는 장소에서만 이동할 수 있습니다.');
  const c=r.characters.find(c=>c.id===t.characterId);if(c&&!controls(c,u))bad('이 캐릭터의 조작 권한이 없습니다.',403);if(!c)owner(r,u);
  if(p.from&&(p.from.mapId!==m.id||p.from.x!==t.x||p.from.y!==t.y))bad('토큰 위치가 변경되었습니다. 새 위치에서 다시 이동하세요.',409);
  if(r.combat?.status==='active'&&r.combat.fighters[t.characterId]){combatMove(r,u,t.characterId,p.x,p.y);break;}
  if(m.exploration)return moveExploration(r,u,m,t,p.x,p.y);
  t.x=num(p.x,0,1);t.y=num(p.y,0,1);t.positionReviewed=true;break;
 }
 case 'removeToken':owner(r,u);requireLocalAccess(r,map().tokens.find(t=>t.id===p.id)?.characterId);map().tokens=map().tokens.filter(t=>t.id!==p.id);break;
 case 'fog': {
  owner(r,u);const m=map();
  if(p.remove)m.fog=m.fog.filter(f=>f.id!==p.id);
  else {if(m.fog.length>=40)bad('가림 영역은 40개까지 가능합니다.');m.fog.push({id:crypto.randomUUID(),x:num(p.x,0,1),y:num(p.y,0,1),w:num(p.w,.01,1),h:num(p.h,.01,1)});}break;
 }
 case 'pin': {
  owner(r,u);const m=map();if(p.remove)m.pins=m.pins.filter(t=>t.id!==p.id);
  else {if(m.pins.length>=30)bad('표식은 30개까지 가능합니다.');m.pins.push({id:crypto.randomUUID(),name:str(p.name,80),text:str(p.text||'',2000,true),x:num(p.x,0,1),y:num(p.y,0,1),hidden:p.hidden===true});}break;
 }
 case 'sheet': {
  const c=r.characters.find(c=>c.id===p.characterId)||bad('캐릭터를 먼저 등록하세요.');
  if(c.owner!==u.id)owner(r,u);
  if(p.sheetRevision!==undefined&&p.sheetRevision!==(c.sheetRevision||0))bad('다른 창에서 시트가 변경되었습니다. 다시 열어 최신 시트를 확인하세요.',409);
  if(!Array.isArray(p.fields)||p.fields.length>120)bad('시트 항목은 120개까지 가능합니다.');
  c.fields=p.fields.map(f=>{
   if(f.section&&!['attributes','defense','skills','traits','other'].includes(f.section))bad('시트 분류를 확인하세요.');
   return {name:str(f.name,60),value:str(String(f.value??''),200,true),formula:f.formula?str(f.formula,20):'',...(f.section?{section:f.section}:{})};
  });
  c.inventory=str(p.inventory||'',4000,true);c.conditions=str(p.conditions||'',2000,true);c.connections=str(p.connections||'',2000,true);
  c.sheetRevision=(c.sheetRevision||0)+1;
  log(r,u,`${c.name}의 상세 시트를 저장했습니다.`);break;
 }
 case 'campaign': {
  owner(r,u);
  const system=p.system??r.campaign.system;
  if(!['generic','gurps4'].includes(system))bad('지원하는 판정 체계를 선택하세요.');
  if(r.actions.some(a=>a.status!=='resolved'))bad('미처리 행동을 완료한 뒤 룰 또는 시나리오를 교체하세요.',409);
  for(const key of ['rulebookId','scenarioId'])if(p[key]&&!r.documents.some(d=>d.id===p[key]))bad('등록한 자료를 선택하세요.');
  if(p.rulebookId&&r.documents.some(d=>d.id===p.rulebookId&&(d.visibility!=='public'||d.role&&!['rulebook','houseRule'].includes(d.role))))bad('룰북은 공개 자료여야 합니다.');
  const localIds=p.localBookIds??r.campaign.localBookIds;
  if(localIds!==undefined&&(!Array.isArray(localIds)||localIds.length>100||localIds.some(id=>!r.localLibrary?.books.some(b=>b.id===id&&b.kind==='rule'))))bad('연결된 로컬 룰북을 선택하세요.');
  const localScenario=p.localScenarioId??r.campaign.localScenarioId??'';
  if(localScenario&&!r.localLibrary?.books.some(b=>b.id===localScenario&&b.kind==='scenario'))bad('연결된 로컬 시나리오를 선택하세요.');
  if(localIds!==undefined&&JSON.stringify(localIds)!==JSON.stringify(r.campaign.localBookIds)){r.rules.forEach(rule=>rule.status='draft');}
  if(r.campaign.rulebookId!==(p.rulebookId||'')||r.campaign.system!==system){r.rules.forEach(rule=>rule.status='draft');r.campaign.sheetTemplate=[];r.campaign.templateDraft=[];}
  r.campaign={...r.campaign,system,rulebookId:p.rulebookId||'',scenarioId:p.scenarioId||'',edition:str(p.edition||'',100,true),...(localIds!==undefined?{localBookIds:localIds}:{}),localScenarioId:localScenario};
  if(system==='gurps4'&&!r.campaign.sheetTemplate.length)r.campaign.sheetTemplate=gurpsSheetFields();
  log(r,u,'캠페인의 룰북·시나리오 연결을 변경했습니다. 기존 캐릭터 수치는 보존됩니다.');break;
 }
 case 'sheetTemplate': {
  owner(r,u);if(!Array.isArray(p.fields)||p.fields.length>30)bad('시트 항목을 확인하세요.');
  r.campaign.templateDraft=p.fields.map(f=>({name:str(f.name,60),value:str(String(f.value??''),200,true),formula:f.formula?str(f.formula,20):''}));break;
 }
 case 'approveTemplate':owner(r,u);r.campaign.sheetTemplate=r.campaign.templateDraft||[];r.campaign.templateDraft=[];break;
 case 'note': {
  owner(r,u);if(!['public','gm'].includes(p.visibility))bad('공개 범위를 선택하세요.');
  let n=p.id?r.notes.find(n=>n.id===p.id):null;if(p.id&&!n)bad('기록을 찾을 수 없습니다.');
  if(!n){if(r.notes.length>=100)bad('사건 기록은 100개까지 가능합니다.');n={id:crypto.randomUUID()};r.notes.push(n);}
  Object.assign(n,{caseId:n.caseId??r.chronicle.activeCaseId,episodeId:n.episodeId??r.chronicle.activeEpisodeId,title:str(p.title,100),text:str(p.text,6000),kind:['person','quest','clue','summary'].includes(p.kind)?p.kind:'clue',visibility:p.visibility});break;
 }
 case 'ready': bad('행동 준비 기능이 종료되었습니다. 화면을 새로고침하세요.',410);break;
 case 'queueGM': {
  owner(r,u);if(['queued','running'].includes(r.gmJob.status))bad('이미 GM이 처리 중입니다.',409);
  if(p.kind!=='rules')bad('공동 진행 요청은 종료되었습니다. 개별 행동을 선택하세요.',410);
  const kind='rules';
  if(kind==='rules'&&!r.campaign.rulebookId&&!(r.campaign.localBookIds??r.localLibrary?.books.filter(b=>b.kind==='rule').map(b=>b.id))?.length)bad('룰북 자료를 먼저 연결하세요.');
  r.gmJob={id:crypto.randomUUID(),status:'queued',kind,at:new Date().toISOString()};break;
 }
 case 'cancelAction':{
  if(['queued','running','applying'].includes(r.gmJob?.status))bad('GM 작업을 중단한 뒤 선언을 취소하세요.',409);
  const a=r.actions.find(a=>a.id===p.actionId&&['pending','planned'].includes(a.status));
  if(!a)bad('이미 처리되었거나 찾을 수 없는 선언입니다.',409);
  if(u.id!==r.owner&&u.id!==a.author)bad('본인의 선언만 취소할 수 있습니다.',403);
  if(r.actionErrors)delete r.actionErrors[a.id];a.status='resolved';a.cancellation={at:new Date().toISOString(),author:u.id,executed:false};a.reason='사용자가 미실행 선언을 취소했습니다.';
  if(r.gmJob?.actionIds?.includes(a.id)){r.gmJob.message='선언 취소 · 판정·자원·시간 변화 없음';endProgress(r,'cancelled');}
  log(r,u,'선언 취소 · '+a.text+' · 실행하지 않음');break;
 }
 case 'cancelGM':{
  owner(r,u);if(!['queued','running'].includes(r.gmJob.status))bad('현재 진행 중인 요청이 없습니다.',409);
  r.gmJob.message='방장이 진행을 중단했습니다.';endProgress(r,'cancelled');break;
 }
 case 'retryGM': {
   owner(r,u);
   if(!p.actionId){retryJob(r);break;}
   if(['queued','running','applying'].includes(r.gmJob?.status))bad('앞선 GM 응답이 끝난 뒤 요청하세요.',409);
   const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending');
   if(a&&a.scope!=='individual')bad('공동선언은 구체적인 개인 행동으로 다시 선언하세요.',410);
   if(!a)bad('이미 처리되었거나 찾을 수 없는 선언입니다.',409);
   const c=r.characters.find(c=>c.id===a.actorId),author=r.members.find(m=>m.id===a.author);
   if(!author||!controls(c,author))bad('선언자의 캐릭터 조작 권한을 확인하세요.',403);
   if(r.combat?.status==='active'){
    const b=r.combat;if(b.pending?.kind==='critical'||a.actorId!==(fishRecord(r,b.pending?.targetId)?.owner.id||b.pending?.targetId||b.order[b.index]))bad('현재 행동 또는 방어 차례인 선언만 이어갈 수 있습니다.',409);
   }
   r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'individual',at:new Date().toISOString(),requesterId:a.author,actorId:a.actorId,actionIds:[a.id],requestText:a.text,messageId:r.messages.find(m=>m.actionId===a.id)?.id||'',retryOf:r.gmJob?.id||''};
   break;
  }
 case 'checkpoint': {
  owner(r,u);const keys=['groundItems','looseWeapons','worldLibrary','explorationSeconds','journey','economy','combat','partyCharacterIds','chronicle','scene','characters','actions','rolls','rules','maps','mapId','campaign','turn','notes','secrets','aiPrivate','gmMemory','cast','scenePresets'];
  const state=Object.fromEntries(keys.filter(k=>r[k]!==undefined).map(k=>[k,structuredClone(r[k])]));
  const cp={id:crypto.randomUUID(),title:str(p.title||`턴 ${r.turn.number}`,100),at:new Date().toISOString(),packIds:(r.contentPacks||[]).map(p=>p.id).sort(),state};
  r.checkpoints.push(cp);if(r.checkpoints.length>5)r.checkpoints.shift();return {checkpointId:cp.id};
 }
 case 'restore': {
  owner(r,u);const cp=r.checkpoints.find(c=>c.id===p.id)||bad('복구 지점을 찾을 수 없습니다.');
  if((cp.state.worldLibrary?.definition.revision||'')!==(r.worldLibrary?.definition.revision||''))bad('세계 자료 등록·갱신 이후의 복구 지점을 선택하세요.');
  if(JSON.stringify(cp.packIds||[])!==JSON.stringify((r.contentPacks||[]).map(p=>p.id).sort()))bad('준비 파일 등록 이전 복구 지점입니다. 등록 이후의 복구 지점을 선택하세요.');
  if(r.economy?.enabled&&!cp.state.economy?.enabled)bad('경제 설정 이전 복구 지점입니다. 자산은 사유를 남겨 정정하세요.');
  const ledger=structuredClone(r.economy?.ledger||[]);
  Object.assign(r,structuredClone(cp.state));r.groundItems=structuredClone(cp.state.groundItems||[]);r.looseWeapons=structuredClone(cp.state.looseWeapons||[]);r.explorationSeconds=cp.state.explorationSeconds||0;r.combat=structuredClone(cp.state.combat||null);r.gmMemory=structuredClone(cp.state.gmMemory||[]);r.gmJob={status:'cancelled',message:'복구 후 GM 진행을 다시 요청하세요.'};r.turn.ready=[];
  if(r.economy?.enabled){r.economy.ledger=ledger;recordEconomyRestore(r,u,cp.id);}
  log(r,u,`복구 지점 「${cp.title}」으로 게임 상태를 되돌렸습니다. 이전 로그는 유지됩니다.`);break;
 }
 case 'demo': {
  owner(r,u);if(r.campaign.rulebookId||r.rules.length)bad('이미 룰이 있는 세션입니다. 새 테이블에서 체험하세요.');
  const rulebook={id:crypto.randomUUID(),title:'도시의 이면 — 체험용 하우스룰',visibility:'public',content:'체험용 하우스룰이며 상용 룰북이 아닙니다. 조사 판정은 1d20을 굴려 10 이상이면 성공합니다. 실패해도 성공으로 바꾸지 않습니다. 일반 조사에는 FP 비용과 HP 변화가 없습니다. 위험한 행동에는 GM이 판정 전에 위험을 알리고 별도 규칙 초안을 제안합니다.',at:new Date().toISOString()};
  const scenario={id:crypto.randomUUID(),title:'이름 없는 골목 — 도입 시나리오',visibility:'gm',content:'서울의 지도에서 사라진 골목. 두 조사자는 막차가 떠난 뒤 자신들의 이름이 적힌 메모를 받고 골목에 도착한다. 공개 단서: 젖지 않은 봉투, 작동하지 않는 공중전화, 골목 안의 흰 원. GM 비밀: 우체부는 사라진 주민의 기억을 배달한다. 그는 적이 아니지만 이름을 잃는 것을 두려워한다. 단서와 대화로 접근할 수 있고 전투는 필수가 아니다. 플레이어 선택을 유도하거나 강제하지 않는다.',at:new Date().toISOString()};
  r.documents.push(rulebook,scenario);r.campaign.system='generic';r.campaign.rulebookId=rulebook.id;r.campaign.scenarioId=scenario.id;r.campaign.edition='체험용 하우스룰';
  r.rules.push({id:crypto.randomUUID(),name:'흔적 조사',kind:'source',source:`${rulebook.title}: 조사 판정은 1d20을 굴려 10 이상이면 성공합니다.`,formula:'1d20',comparator:'gte',target:10,costFP:0,successHpDelta:0,failureHpDelta:0,status:'active',version:1});
  r.scene={...r.scene,title:'이름 없는 골목',narration:'막차가 떠난 뒤, 지도에 없는 골목이 모습을 드러냅니다. 젖은 아스팔트 위에 놓인 봉투에는 당신의 이름이 적혀 있습니다.',speaker:'GM'};
  r.notes.push({id:crypto.randomUUID(),kind:'quest',title:'발신인을 찾아라',text:'봉투가 도착한 이유와 골목의 정체를 조사한다.',visibility:'public'});
  log(r,u,'체험용 하우스룰과 도입 시나리오를 불러왔습니다.');break;
 }
 }
 return {};
}
