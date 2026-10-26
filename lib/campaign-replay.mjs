import {createRoom,requireOwner,TableError} from './table-engine.mjs';
import {markScenarioStart} from './scenario-checkpoints.mjs';
import {workspace} from './workspace.mjs';
import {worldCommand} from './world-library.mjs';
import {contentPackCommand} from './content-packs.mjs';
import {stamp} from './chronicle.mjs';
import {captureScenes} from './scene-archive.mjs';

// Explicit owner maintenance; never an AI proposal command.
export function prepareCampaignReplay(old,user,p,archiveId){
 requireOwner(old,user);
 if(p.confirmName!==old.title)throw new TableError('다시 시작할 캠페인 이름을 확인하세요.',400);
 if(old.archivedAt||['queued','running','applying'].includes(old.gmJob?.status))throw new TableError('GM 작업을 중단한 활성 캠페인에서 준비하세요.',409);
 const data=p.replay;
 if(data?.format!=='night-table-replay/v1'||!Array.isArray(data.characterIds)||data.characterIds.length!==2||new Set(data.characterIds).size!==2)throw new TableError('두 캐릭터와 다시 시작 자료가 필요합니다.',400);
 const pcs=data.characterIds.map(id=>old.characters.find(c=>c.id===id&&!c.isNPC));
 if(pcs.some(c=>!c||!c.assets?.confirmed))throw new TableError('자산이 확정된 기존 PC 두 명을 선택하세요.',400);
 stamp(data.date,data.time);
 const fresh=createRoom(user,old.title);
 for(const key of ['id','version','owner','joinCode','createdAt','members','bridgeHash','bridgeParentId','creationSignature','receipts','documents','localLibrary'])if(old[key]!==undefined)fresh[key]=structuredClone(old[key]);
 // Keep used request IDs as tombstones: delayed pre-reset commands must not run again.
 fresh.receipts=Object.fromEntries(Object.keys(old.receipts).map(id=>[id,{signature:'retired-by-campaign-replay',result:{}}]));
 fresh.campaign=structuredClone(old.campaign);
 for(const key of ['caseTitle','caseScenario','openingPrompt'])delete fresh.campaign[key];
 if(fresh.campaign.sourceFiles)for(const key of ['caseScenario','openingPrompt'])delete fresh.campaign.sourceFiles[key];
 fresh.characters=structuredClone(pcs);
 for(const c of fresh.characters){
  c.hp=c.maxHp;c.fp=c.maxFp;c.conditions='';
  for(const key of ['combatState','effects','injuries','aquarium','woundRevision','restProgressSeconds','firstAid','conditionRolls'])delete c[key];
 }
 fresh.partyCharacterIds=fresh.characters.map(c=>c.id);
 for(const m of fresh.members)if(!fresh.characters.some(c=>c.id===m.activeCharacterId&&c.owner===m.id))m.activeCharacterId=fresh.characters.find(c=>c.owner===m.id)?.id||'';
 fresh.economy={...structuredClone(old.economy),items:structuredClone(old.economy.items),shops:[],ledger:[],visit:null,visits:{}};
 fresh.rules=structuredClone(old.rules);
 workspace(fresh);fresh.chronicle.clock={date:data.date,time:data.time};
 worldCommand(fresh,user,'installWorldLibrary',{bundle:data.world,startPlaceId:data.startPlaceId,adoptEconomy:true,startCase:false});
 fresh.campaign.bible=data.world.bible;
 if(data.scenarioText){if(typeof data.scenarioText!=='string'||data.scenarioText.length>200000)throw new TableError('시나리오 길이를 확인하세요.',400);fresh.campaign.caseScenario=data.scenarioText;fresh.campaign.caseTitle=data.pack.title;}
 fresh.campaign.sourceFiles||={};fresh.campaign.sourceFiles.bible={name:'AI GM 통합 설정집 v1.2.md',characters:data.world.bible.length,uploadedAt:new Date().toISOString()};
 const pack=structuredClone(data.pack);
 for(const [key,image] of Object.entries(pack.assets))pack.assets[key]=contentPackCommand(fresh,user,'uploadPackAsset',{image}).assetId;
 contentPackCommand(fresh,user,'installContentPack',{pack,baseDate:data.date});
 const entry=fresh.chronicle.cases.find(c=>c.contentRef?.packId===pack.id);
 if(!entry)throw new TableError('시작 케이스가 없습니다.',400);
 contentPackCommand(fresh,user,'enterContentCase',{caseId:entry.id,date:data.date,mode:'walk',expectedMinutes:0,expectedWon:0,characterId:fresh.characters.find(c=>c.owner===user.id).id});
 // Bind authored location art to world travel without guessing exploration geometry.
 for(const [mapKey,placeId] of Object.entries(data.mapPlaces||{})){
  const m=fresh.maps.find(m=>m.contentRef?.packId===pack.id&&m.contentRef.mapId===mapKey),place=fresh.worldLibrary.definition.places.find(x=>x.id===placeId);
  if(!m||!place)throw new TableError('지도와 장소 연결을 확인하세요.',400);
  m.placeId=placeId;m.grid=!!m.exploration;place.mapId=m.id;
 }
 fresh.maps=fresh.maps.filter(m=>m.contentRef);
 fresh.scene.placeId=data.startPlaceId;fresh.scene.mapId=fresh.mapId;
 fresh.worldLibrary.presentations={};fresh.cast=[];
 for(const c of fresh.characters.filter(c=>c.isNPC)){
  const person=fresh.worldLibrary.definition.people.find(n=>n.name===c.name);
  if(person){const before=c.id;c.id='world:'+fresh.worldLibrary.definition.id+':'+person.id;c.worldLibraryId=fresh.worldLibrary.definition.id;for(const m of fresh.maps)for(const t of m.tokens)if(t.characterId===before)t.characterId=c.id;for(const m of fresh.messages)if(m.speakerId===before)m.speakerId=c.id;if(fresh.scene.speakerId===before)fresh.scene.speakerId=c.id;}
 }
 if(data.reward){
  const {won,cp,title,description}=data.reward;
  if(!Number.isSafeInteger(won)||won<0||won>1e9||!Number.isSafeInteger(cp)||cp<0||cp>100||typeof title!=='string'||title.length>100||typeof description!=='string'||description.length>2000)throw new TableError('보상 조건을 확인하세요.',400);
  const eventId=crypto.randomUUID();fresh.chronicle.events.push({id:eventId,caseId:entry.id,title,description,date:data.date,time:data.time,status:'scheduled',visibility:'gm',kind:'scene',duration:0,requires:[]});
  entry.reward={won,cp,recipientIds:[...fresh.partyCharacterIds],requiredEventIds:[eventId]};
 }
 // Start with the authored introduction, without any actions, discoveries or old GM memory.
 fresh.messages=fresh.messages.filter(m=>m.opening||m.type==='narration'&&!m.locationArrival);
 for(const m of fresh.messages){m.placeId=data.startPlaceId;m.sceneTitle=fresh.scene.title;m.gameClock=structuredClone(fresh.chronicle.clock);}
 fresh.session={episode:1,recap:'최신 자료로 테스트 플레이 시작',nextAt:''};
 fresh.replay={archiveId,at:new Date().toISOString(),sourceVersion:old.version,contentRevision:data.world.revision};
 fresh.gmJob={status:'idle'};fresh.campaign.ready=true;
 captureScenes(fresh,0);
 markScenarioStart(fresh,'opening');
 return fresh;
}

export async function replayRequest(store,user,input,original){
 const {requireRequestId}=await import('./table-engine.mjs');requireRequestId(input.requestId);requireOwner(original,user);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({op:input.op,payload:input.payload,user:user.id})));
 const signature=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 const receipt=original.receipts[input.requestId];
 if(receipt){if(receipt.signature!==signature)throw new TableError('이미 사용한 요청 ID입니다.',409);return {room:original,result:receipt.result,duplicate:true};}
 if(input.expectedVersion!==original.version)throw new TableError('캠페인이 변경되었습니다. 다시 확인하세요.',409);
 const archiveId='replay-backup-'+input.requestId;
 const next=prepareCampaignReplay(original,user,input.payload,archiveId);
 const archive={...structuredClone(original),id:archiveId,title:(original.title+' · 초기화 전 보관').slice(0,80),joinCode:crypto.randomUUID().replaceAll('-',''),version:0,archivedAt:new Date().toISOString(),replaySource:{roomId:original.id,version:original.version,requestId:input.requestId},receipts:{}};
 delete archive.bridgeHash;delete archive.bridgeParentId;
 // Copy room-scoped assets so the archive remains independently readable.
 const assetIds=new Map();
 for(const [id,value] of Object.entries(original.contentAssets||{})){
  const bytes=typeof value==='string'?value:await store.assetGet(id,original.id);if(!bytes)throw new TableError('보관할 이미지가 없습니다.',409);
  const nextId=crypto.randomUUID();assetIds.set(id,nextId);await store.assetPut(nextId,archiveId,bytes);
 }
 const rewrite=value=>{if(typeof value==='string'){if(assetIds.has(value))return assetIds.get(value);for(const [oldId,newId]of assetIds)value=value.replaceAll('/api/table?room='+original.id+'&asset='+oldId,'/api/table?room='+archiveId+'&asset='+newId);return value;}if(Array.isArray(value))return value.map(rewrite);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[assetIds.get(k)||k,rewrite(v)]));return value;};
 if(!await store.create(rewrite(archive))){const saved=await store.get(archiveId);if(saved?.replaySource?.roomId!==original.id||saved.replaySource.version!==original.version)throw new TableError('보관본 충돌입니다.',409);}
 const {persistContentAssets}=await import('./content-assets.mjs');await persistContentAssets(store,next);
 const result={archiveId,characterIds:next.partyCharacterIds};next.version=original.version+1;next.updatedAt=new Date().toISOString();next.receipts[input.requestId]={signature,result};
 if(new TextEncoder().encode(JSON.stringify(next)).length>1800000)throw new TableError('준비 자료의 크기를 줄여주세요.',400);
 if(!await store.save(next,original.version))throw new TableError('캠페인이 변경되어 초기화하지 않았습니다. 보관본은 유지됩니다.',409);
 return {room:next,result,duplicate:false};
}
