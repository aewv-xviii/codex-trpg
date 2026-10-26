import {requireAccess} from './factions.mjs';
import {installNPCInventory} from './npc-inventory.mjs';
import {isCompanion} from '../public/play/character-control.js';
import {sceneMessageParts} from '../public/play/message-presentation.js';
import {connectScenarioCombat} from './scenario-combat.mjs';
import {center,clearLine,index} from '../public/play/exploration-geometry.js';
import {refreshExploration} from './exploration.mjs';
import {validatePack,routeQuote,travelModes,departureTime} from '../public/play/pack-format.js';
import {imageSource} from './presentation.mjs';
import {validateCombatProfile} from './combat.mjs';
import {stamp,chronicleCommand} from './chronicle.mjs';
import {spendTravel} from './economy.mjs';
import {vehicleQuote} from '../public/play/vehicle-state.js';
import {requireTravelVehicle} from './travel-vehicles.mjs';
const fail=(m,status=400)=>{throw Object.assign(Error(m),{status});};
const idle=r=>{if(r.combat?.status==='active'||['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))fail('전투·대기 행동·GM 처리를 먼저 마치세요.',409);};
export const packAssetUrl=(roomId,assetId)=>`/api/table?room=${roomId}&asset=${assetId}`;
const image=(r,p,key,fallback='/play/blank-map.svg')=>key?packAssetUrl(r.id,p.assets[key]):fallback;
const ref=(p,id)=>p.id+'/'+id;
export function contentPackForCase(r,entry){return r.contentPacks?.find(p=>p.id===entry?.contentRef?.packId);}
export function contentCase(r,entry){return contentPackForCase(r,entry)?.cases?.find(c=>c.id===entry.contentRef.caseId);}
export function packState(r){r.contentPacks||=[];r.contentAssets||={};r.journey||={regionId:'',visits:[]};}
function log(r,u,text,extra={}){r.messages.push({id:crypto.randomUUID(),type:'system',name:'이동 기록',author:u.id,text,at:new Date().toISOString(),...extra});}
export function contentPackCommand(r,u,op,p){
 if(!['uploadPackAsset','installContentPack','enterContentCase','pauseContentCase','enterLocalMap','revealPackActor'].includes(op))return null;
 if(r.owner!==u.id)fail('방장 권한이 필요합니다.',403);idle(r);packState(r);
 if(op==='uploadPackAsset'){
  const data=imageSource(p.image,false);if(!data.startsWith('data:'))fail('패키지에는 PNG·JPEG·WebP 파일을 넣으세요.');
  const existing=Object.entries(r.contentAssets).find(([,v])=>v===data||p.fingerprint&&v.fingerprint===p.fingerprint);if(existing)return {assetId:existing[0]};
  if(Object.keys(r.contentAssets).length>=60||Object.values(r.contentAssets).reduce((n,v)=>n+(typeof v==='string'?v.length:v.size),0)+data.length>20000000)fail('캠페인 이미지 한도에 도달했습니다. 이미지 수·크기를 줄이세요.');
  const assetId=crypto.randomUUID();r.contentAssets[assetId]=data;return {assetId};
 }
 if(op==='installContentPack'){
  const pack=validatePack(p.pack);stamp(pack.startDate,pack.startTime);stamp(p.baseDate||pack.startDate);
  if(r.contentPacks.some(x=>x.id===pack.id))fail('이미 등록된 패키지입니다. 진행 중인 데이터를 덮어쓰지 않습니다.',409);
  if(r.contentPacks.length>=5)fail('캠페인당 준비 패키지는 5개까지입니다.');
  for(const assetId of Object.values(pack.assets))if(!Object.hasOwn(r.contentAssets,assetId))fail('이미지를 먼저 업로드하세요.');
  for(const actor of pack.actors)if(actor.profile){const source=actor.profile;actor.profile=validateCombatProfile(source);const w=actor.profile.weapon;if(w.kind!=='melee'){if(!r.economy?.items.some(i=>i.id===source.weapon.ammoItemId&&i.kind==='ammo')||!Number.isInteger(source.weapon.capacity)||source.weapon.capacity<1||source.weapon.capacity>1000||w.ammo>source.weapon.capacity)fail('적 유형의 탄종·장탄수를 확인하세요.');Object.assign(w,{ammoItemId:source.weapon.ammoItemId,capacity:source.weapon.capacity});}}
  const count=pack.cases.reduce((n,c)=>n+c.beats.length,0);if(r.chronicle.cases.length+pack.cases.length>100||r.chronicle.events.length+count>300)fail('케이스·사건 저장 한도를 초과합니다.');
  for(const region of pack.regions){const old=r.contentPacks.flatMap(x=>x.regions).find(x=>x.id===region.id);if(old&&(old.title!==region.title||old.x!==region.x||old.y!==region.y))fail('기존 지역과 이름·좌표가 다른 중복 지역 ID입니다.');}
  pack.baseDate=p.baseDate||pack.startDate;pack.installedAt=new Date().toISOString();r.contentPacks.push(pack);
  if(!r.chronicle.clock)r.chronicle.clock={date:pack.baseDate,time:pack.startTime};
  if(!r.journey.regionId)r.journey.regionId=pack.startRegionId;
  for(const c of pack.cases){
   const id=crypto.randomUUID(),entry={id,title:c.title,summary:c.summary,status:'open',visibility:c.visibility,createdAt:pack.installedAt,contentRef:{packId:pack.id,caseId:c.id,regionId:c.regionId,mapIds:c.mapIds},openingPrompt:c.opening,...(c.reward?{reward:{...c.reward,recipientIds:[],requiredEventIds:[]}}:{})};r.chronicle.cases.push(entry);
   const ids=new Map(c.beats.map(b=>[b.id,crypto.randomUUID()]));
   for(const b of c.beats){const d=new Date(stamp(pack.baseDate)+b.dayOffset*86400000).toISOString().slice(0,10);r.chronicle.events.push({...b,id:ids.get(b.id),caseId:id,date:d,status:'scheduled',mapId:'',contentMapId:b.mapId,requires:b.requires.map(id=>ids.get(id))});}
  }
  log(r,u,`준비 패키지 등록 · ${pack.title} · 케이스 ${pack.cases.length}개`);return {packId:pack.id};
 }
 if(op==='pauseContentCase'){
  const c=r.chronicle.cases.find(c=>c.id===r.chronicle.activeCaseId);if(!c?.contentRef)fail('진행 중인 준비 케이스가 없습니다.');
  c.resumeMapId=r.mapId;c.resumeScene=structuredClone(r.scene);r.chronicle.activeCaseId='';r.economy.visit=null;log(r,u,`${c.title} · 진행 보관`,{caseId:c.id});return {};
 }
 if(op==='revealPackActor'){
  const c=r.characters.find(x=>x.id===p.characterId&&x.contentRef);if(!c)fail('준비된 인물을 찾을 수 없습니다.');
  const map=r.maps.find(m=>m.id===r.mapId),token=map?.tokens.find(t=>t.characterId===c.id);if(!token)fail('현재 지도에 있는 인물만 등장시킬 수 있습니다.');
  token.hidden=false;c.contentRevealed=true;log(r,u,`${c.name} 등장`);return {};
 }
 const entry=r.chronicle.cases.find(c=>c.id===(p.caseId||r.chronicle.activeCaseId)),pack=contentPackForCase(r,entry),c=contentCase(r,entry);
 if(!pack||!c||entry.visibility!=='public'||entry.status!=='open')fail('진행할 준비 케이스를 확인하세요.');
 requireAccess(r,entry.accessRequirements);
 if(op==='enterLocalMap'){
  if(entry.id!==r.chronicle.activeCaseId||r.journey.regionId!==c.regionId)fail('현재 지역·케이스의 지도만 들어갈 수 있습니다.');
  const m=r.maps.find(m=>m.id===p.mapId&&m.contentRef?.packId===pack.id&&c.mapIds.includes(m.contentRef.mapId));if(!m)fail('현재 케이스의 지도를 선택하세요.');
  // A local location change is a bounded, authored cost; never a teleport from the map picker.
  if(m.id===r.mapId)return {};
  const minutes=pack.maps.find(x=>x.id===m.contentRef.mapId).entryMinutes;
  chronicleCommand(r,u,'advanceClock',{minutes,reason:m.title+' 현지 이동'});enterMap(r,m);r.economy.visit=null;log(r,u,`${m.title} 진입 · ${minutes}분`);return {};
 }
 if(r.chronicle.activeCaseId&&r.chronicle.activeCaseId!==entry.id)fail('현재 케이스를 보관한 뒤 다른 일정을 선택하세요.');
 if(r.chronicle.activeCaseId===entry.id)fail('이미 진행 중입니다. 현지 장소를 선택하세요.');
 if(!r.economy?.enabled||!r.partyCharacterIds.length||r.partyCharacterIds.some(id=>!r.characters.find(c=>c.id===id)?.assets?.confirmed))fail('파티와 시작 소지금·물품을 먼저 확정하세요.');
 stamp(p.date);if(p.date<r.chronicle.clock.date)fail('과거 날짜는 기록으로 복기하세요.');if(stamp(p.date)-stamp(r.chronicle.clock.date)>366*86400000)fail('1년 이내 날짜를 선택하세요.');
 const beats=r.chronicle.events.filter(e=>e.caseId===entry.id&&e.visibility==='public'&&e.kind!=='deadline'&&e.status==='scheduled'&&e.date<=p.date);if(!beats.length)fail('이 날짜에 진행할 케이스 일정이 없습니다.');
 let quote=routeQuote(pack,r.journey.regionId,c.regionId,p.mode,r.partyCharacterIds.length);if(!quote)fail('선택한 이동수단으로 연결된 경로가 없습니다.');
 const vehicle=p.mode==='car'?requireTravelVehicle(r,p.characterId,r.journey.regionId,pack.id):null;
 if(vehicle)quote=vehicleQuote(vehicle,quote,pack,r.partyCharacterIds.length);
 if(p.expectedMinutes!==quote.minutes||p.expectedWon!==quote.won)fail('이동 시간·비용이 바뀌었습니다. 다시 확인하세요.',409);
 const departure=departureTime(pack,r.chronicle,entry.id,p.date,quote.minutes);
 const arrival=new Date(departure+quote.minutes*60000),arrivalClock={date:arrival.toISOString().slice(0,10),time:arrival.toISOString().slice(11,16)};
 const deadline=r.chronicle.events.find(e=>e.caseId===entry.id&&e.kind==='deadline'&&e.status==='scheduled'&&stamp(e.date,e.time)<arrival.getTime());if(deadline)fail('도착 전에 케이스 기한이 지납니다. 기한 결과를 먼저 검토하세요.');
 r.chronicle.activeCaseId=entry.id;entry.startedAt||=new Date().toISOString();entry.startClock||=structuredClone(arrivalClock);
 const fromClock=structuredClone(r.chronicle.clock),from=r.journey.regionId;r.chronicle.clock=arrivalClock;
 spendTravel(r,u,p.characterId,quote.won,{minutes:quote.minutes,from,to:c.regionId,mode:p.mode,fromClock,path:quote.path});
 if(vehicle){vehicle.placeId=c.regionId;if(vehicle.spec)vehicle.spec.fuelLiters=Math.max(0,Math.round((vehicle.spec.fuelLiters-quote.fuelLiters)*1000)/1000);}
 r.journey.regionId=c.regionId;r.journey.visits.push({caseId:entry.id,from,to:c.regionId,clock:arrivalClock,minutes:quote.minutes,won:quote.won});r.journey.visits=r.journey.visits.slice(-500);r.economy.visit=null;
 if(entry.reward&&!entry.reward.recipientIds.length){entry.reward.recipientIds=[...r.partyCharacterIds];entry.reward.requiredEventIds=r.chronicle.events.filter(e=>e.caseId===entry.id&&e.kind!=='deadline').map(e=>e.id);}
 materialize(r,pack,c,entry);const map=r.maps.find(m=>m.id===entry.resumeMapId)||r.maps.find(m=>m.contentRef?.packId===pack.id&&m.contentRef.mapId===c.mapIds[0]);enterMap(r,map);
 if(entry.resumeScene)r.scene={...structuredClone(entry.resumeScene),title:map.title,background:map.sceneBackground||map.image};
 r.chronicle.playedDays||=[];const playedKey=entry.id+'/'+arrivalClock.date;if(!r.chronicle.playedDays.includes(playedKey))r.chronicle.playedDays.push(playedKey);
 if(!entry.opened){
  entry.opened=true;const responseId='opening:'+crypto.randomUUID();
  for(const beat of c.openingBeats||(c.opening?[{type:'narration',text:c.opening}]:[])){
   const person=beat.actorId?r.characters.find(a=>a.contentRef?.key===ref(pack,beat.actorId)):null;
   if(beat.type==='npcDialogue'&&!person)fail('도입부 화자를 찾을 수 없습니다.');
   const message={id:crypto.randomUUID(),type:beat.type,name:person?.name||'GM',speakerId:person?.id||'',expressionId:'',author:u.id,text:beat.text,at:new Date().toISOString(),caseId:entry.id,gameClock:structuredClone(r.chronicle.clock),gmResponseId:responseId,opening:true};
   const parts=sceneMessageParts(r,message);r.messages.push(...parts);
   const last=parts.findLast(m=>m.type==='narration'||m.type==='npcDialogue');
   if(last)Object.assign(r.scene,{narration:last.text,speaker:last.name,speakerId:last.speakerId||'',expressionId:last.expressionId||''});
  }
 }
 log(r,u,`${c.title} · ${pack.regions.find(x=>x.id===c.regionId).title} 도착 · ${travelModes[p.mode]||'현지'} ${quote.minutes}분 · ${quote.won.toLocaleString('ko-KR')}원`);return {caseId:entry.id};
}
function enterMap(r,m){
 if(!m)fail('현지 지도가 없습니다.');r.mapId=m.id;r.scene.title=m.title;r.scene.background=m.sceneBackground||m.image;
 for(const [position,id] of r.partyCharacterIds.entries())if(!m.tokens.some(t=>t.characterId===id)){
  if(m.tokens.length>=40)fail('지도 토큰 한도입니다.');const c=r.characters.find(c=>c.id===id);let spawn={x:.25+position*.15,y:.8};
  if(m.exploration){const e=m.exploration.entry;spawn=Array.from({length:m.columns*m.rows},(_,i)=>center(m,i)).sort((a,b)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y)).find(p=>clearLine(m,e,p)&&!m.tokens.some(t=>index(m,t)===index(m,p)));if(!spawn)fail('출입구 근처에 인물을 배치할 공간이 없습니다.');}
  m.tokens.push({id:crypto.randomUUID(),characterId:id,name:c.name,...spawn,hidden:false});
 }
 refreshExploration(r,m);
}
function materialize(r,p,c,entry){
 for(const id of c.actorIds){if(r.characters.some(x=>x.contentRef?.key===ref(p,id)))continue;if(r.characters.length>=60)fail('인물 저장 한도입니다.');const a=p.actors.find(a=>a.id===id);r.characters.push({id:crypto.randomUUID(),owner:r.owner,isNPC:true,controllers:[],name:a.name,description:a.description,hp:a.maxHp,maxHp:a.maxHp,fp:a.maxFp,maxFp:a.maxFp,statsPending:!a.reviewed||!a.profile,combatProfile:a.profile?structuredClone(a.profile):undefined,assets:{confirmed:a.reviewed,won:a.won,items:a.ammo?{[a.profile?.weapon.ammoItemId||'ammo-standard']:a.ammo}:{}},contentRef:{key:ref(p,id),packId:p.id,actorId:id,regionId:c.regionId},contentRole:a.role,contentRevealed:a.role!=='enemy',...(a.portrait?{portraits:[{id:'prepared',label:'초상화',image:image(r,p,a.portrait),tokenFocus:'face',...(a.tokenCrop?{tokenCrop:structuredClone(a.tokenCrop)}:{})}],expressionId:'prepared'}:{})});}
 for(const actor of r.characters.filter(a=>a.contentRef?.packId===p.id)){if(!actor.npcPossessions){const authored=p.actors.find(a=>a.id===actor.contentRef.actorId);installNPCInventory(r,actor,authored?.inventory);}connectScenarioCombat(actor);}
 for(const id of c.mapIds){if(r.maps.some(x=>x.contentRef?.key===ref(p,id)))continue;if(r.maps.length>=50)fail('지도 저장 한도입니다.');const m=p.maps.find(m=>m.id===id);r.maps.push({id:crypto.randomUUID(),title:m.title,entryMinutes:m.entryMinutes,description:m.description,image:image(r,p,m.image),sceneBackground:image(r,p,m.background||m.image),columns:m.columns,rows:m.rows,unit:m.unit,distanceUnit:'yd',grid:true,fog:[],pins:[],...(m.exploration?{exploration:structuredClone(m.exploration)}:{}),contentRef:{key:ref(p,id),packId:p.id,mapId:id,regionId:m.regionId},tokens:m.tokens.map(t=>{const a=r.characters.find(a=>a.contentRef?.key===ref(p,t.actorId));return {id:crypto.randomUUID(),characterId:a.id,name:a.name,x:t.x,y:t.y,hidden:t.hidden};})});}
 for(const e of r.chronicle.events.filter(e=>e.caseId===entry.id))e.mapId=r.maps.find(m=>m.contentRef?.key===ref(p,e.contentMapId))?.id||'';
}
export function publicContentState(r,u){
 delete r.contentAssets;
 for(const c of r.chronicle.cases)delete c.resumeScene;
 r.contentPacks=(r.contentPacks||[]).map(p=>({id:p.id,version:p.version,title:p.title,summary:p.summary,canonStatus:p.canonStatus,startRegionId:p.startRegionId,startTime:p.startTime,regions:p.regions,routes:p.routes}));
 if(r.owner!==u.id){r.characters=r.characters.filter(c=>isCompanion(c)||!c.contentRef||['heard','detected'].includes(c.npcIdentity?.state)||c.contentRevealed||r.partyCharacterIds.includes(c.id)||r.maps.some(m=>m.tokens.some(t=>t.characterId===c.id&&!t.hidden)));r.maps=r.maps.filter(m=>!m.contentRef||m.contentRef.regionId===r.journey?.regionId);}
}
export function projectContentForGM(r){
 delete r.contentAssets;const entry=r.chronicle.cases.find(c=>c.id===r.chronicle.activeCaseId),pack=contentPackForCase(r,entry),c=contentCase(r,entry);
 r.preparedContext=c?{setting:pack.setting,canonStatus:pack.canonStatus,case:{title:c.title,gmNotes:c.gmNotes},region:pack.regions.find(x=>x.id===c.regionId),actors:pack.actors.filter(a=>c.actorIds.includes(a.id)).map(({id,name,secret})=>({id:r.characters.find(a=>a.contentRef?.key===ref(pack,id))?.id,name,secret}))}:null;
 delete r.contentPacks;
 for(const other of r.chronicle.cases)if(other.id!==entry?.id){delete other.openingPrompt;delete other.scenarioSource;delete other.resumeScene;}
 if(c){r.maps=r.maps.filter(m=>m.contentRef?.packId===pack.id&&c.mapIds.includes(m.contentRef.mapId));r.characters=r.characters.filter(a=>isCompanion(a)||r.partyCharacterIds.includes(a.id)||!a.contentRef||a.contentRef.packId===pack.id&&c.actorIds.includes(a.contentRef.actorId));r.chronicle.events=r.chronicle.events.filter(e=>e.caseId===entry.id);}
}
