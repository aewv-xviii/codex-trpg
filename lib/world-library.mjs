import {installNPCInventory} from './npc-inventory.mjs';
import {npcPresent} from '../public/play/npc-presence.js';
import {travelActorIds,travelScope} from '../public/play/travel-party.js';
import {isCompanion} from '../public/play/character-control.js';
import {placePresentation,placeArrivingTokens} from './location-presentation.mjs';
import {refreshExploration} from './exploration.mjs';
import {placeLabel,validateWorld,worldId,worldRoute,worldTravelQuote} from '../public/play/world-format.js';
import {chronicleCommand,stamp} from './chronicle.mjs';
import {economy,spendTravel,openAt} from './economy.mjs';
import {travelModes} from '../public/play/pack-format.js';
import {canControl} from '../public/play/character-control.js';
import {validateTravelModel,validateTravelPoint,travelPoint} from '../public/play/travel-model.js';
import {vehicleQuote} from '../public/play/vehicle-state.js';
import {requireTravelVehicle} from './travel-vehicles.mjs';
export const characterPlace=(r,id)=>r.worldLibrary?.characterPlaces?.[id]||r.worldLibrary?.placeId;
function viewerPlace(r,u){const id=r.members.find(m=>m.id===u?.id)?.activeCharacterId||r.characters.find(c=>canControl(c,u))?.id;return characterPlace(r,id);}
const fail=(m,status=400)=>{throw Object.assign(Error(m),{status});};
function log(r,u,text){r.messages.push({id:crypto.randomUUID(),type:'system',name:'장소 기록',author:u.id,text,caseId:r.chronicle.activeCaseId||'',gameClock:structuredClone(r.chronicle.clock),at:new Date().toISOString()});}
function idle(r){if(r.combat?.status==='active'||['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))fail('진행 중인 행동을 먼저 마치세요.',409);}
function locate(r,u,id,minutes,actorIds=r.partyCharacterIds){
 const w=r.worldLibrary,p=w.definition.places.find(p=>p.id===id);if(!p)fail('등록된 장소가 아닙니다.');
 w.characterPlaces||={};for(const c of [...r.characters,...(r.cast||[])]){
  const home=w.definition.places.find(p=>(p.npcIds||[]).some(id=>id===c.id||worldId(w.definition.id,id)===c.id));
  w.characterPlaces[c.id]||=c.placeId||home?.id||w.placeId;
 }
 const arriving=actorIds.filter(actorId=>w.characterPlaces[actorId]!==id);
 for(const actorId of actorIds)w.characterPlaces[actorId]=id;
 // Remove old PC tokens, including stale destination copies from earlier visits.
 const destinationMap=placePresentation(r,p)?.mapId;
 for(const map of r.maps)map.tokens=map.tokens.filter(t=>!actorIds.includes(t.characterId)||(map.id===destinationMap&&!arriving.includes(t.characterId)));
 if(minutes)chronicleCommand(r,{id:r.owner,name:u.name},'advanceClock',{minutes,reason:placeLabel(p.name)+' 이동'});
 w.presentations||={};if(w.placeId&&r.scene.placeId===w.placeId)w.presentations[w.placeId]=structuredClone(r.scene);
 if(r.economy.visits)for(const actorId of actorIds)delete r.economy.visits[actorId];
 w.placeId=id;w.visitedIds=[...new Set([...w.visitedIds,id])];r.economy.visit=null;
 const view=placePresentation(r,p);r.scene={...r.scene,...view};if(view.mapId){r.mapId=view.mapId;placeArrivingTokens(r,view.mapId,actorIds);refreshExploration(r,r.maps.find(m=>m.id===view.mapId));}w.presentations[id]=structuredClone(r.scene);
 for(const nId of p.npcIds){const n=w.definition.people.find(n=>n.id===nId),castId=worldId(w.definition.id,nId);r.cast||=[];if(!r.cast.some(c=>c.id===castId)&&!r.characters.some(c=>c.id===castId)){const person={id:castId,name:n.name,isNPC:true,controllers:[],portraits:[],placeId:id,worldLibraryId:w.definition.id};const inventory=n.inventory?{...n.inventory,items:n.inventory.items.map(x=>({...x,itemId:w.definition.items.some(i=>i.id===x.itemId)?worldId(w.definition.id,x.itemId):x.itemId}))}:null;installNPCInventory(r,person,inventory);r.cast.push(person);}}
 log(r,u,`${placeLabel(p.name)}${minutes?' 도착 · '+minutes+'분 경과':'에서 시작'}`);
 r.messages.push({id:crypto.randomUUID(),type:'narration',name:'GM',author:u.id,placeId:id,sceneTitle:placeLabel(p.name),locationArrival:true,text:placeLabel(p.name)+(minutes?' 도착 · '+minutes+'분 경과':'')+(p.description?'\n'+p.description:''),caseId:r.chronicle.activeCaseId||'',gameClock:structuredClone(r.chronicle.clock),at:new Date().toISOString()});
}
export function worldCommand(r,u,op,p){
 if(!['installWorldLibrary','travelWorldPlace','browseWorldShop','setWorldRoute','configureWorldTravel','setWorldTravelPoint','setWorldVehicle'].includes(op))return null;
 if(op!=='browseWorldShop'&&r.owner!==u.id)fail('파티 이동과 자료 등록은 방장이 진행합니다.',403);
 idle(r);
 if(op==='installWorldLibrary'){
  const d=validateWorld(p.bundle),old=r.worldLibrary;
  if(old&&old.definition.id!==d.id)fail('진행 중인 세계 자료는 같은 ID로 갱신하세요.');
  if(old&&(!d.places.some(x=>x.id===old.placeId)||old.definition.places.some(x=>!d.places.some(n=>n.id===x.id))||old.definition.people.some(x=>!d.people.some(n=>n.id===x.id))))fail('진행 중인 장소·인물 ID는 삭제할 수 없습니다.');
  if(!old&&!d.places.some(x=>x.id===p.startPlaceId))fail('시작 장소를 선택하세요.');
  if(!old&&p.adoptEconomy!==true)fail('제안 가격과 초기 재고의 사용 여부를 확인하세요.');
  const e=economy(r);e.enabled=true;
  for(const i of d.items){const id=worldId(d.id,i.id),existing=e.items.find(x=>x.id===id);if(existing){if(existing.kind!==i.kind)fail('기존 물품 분류를 변경할 수 없습니다.');existing.name=i.name;}else e.items.push({...i,id});}
  for(const s of d.shops){
   const id=worldId(d.id,s.id),existing=e.shops.find(x=>x.id===id);
   if(existing){Object.assign(existing,{name:s.name,schedule:s.schedule,visitMinutes:s.visitMinutes??0});continue;}
   e.shops.push({id,name:s.name,enabled:true,worldLibraryId:d.id,placeId:s.placeId,mapId:'',npcId:worldId(d.id,s.npcId),schedule:s.schedule,openHour:11,closeHour:20,travelMinutes:0,visitMinutes:s.visitMinutes??0,cash:0,offers:s.offers.map(o=>({itemId:worldId(d.id,o.itemId),price:o.price,sellPrice:0,stock:o.stock,reserved:o.reserved}))});
  }
  if(e.items.length>200||e.shops.length>30)fail('물품 또는 상점 등록 한도를 초과했습니다.');
  if(!r.chronicle.clock){stamp(p.startDate,p.startTime);r.chronicle.clock={date:p.startDate,time:p.startTime};}
  if(old?.definition.travelModel&&!d.travelModel)d.travelModel=old.definition.travelModel;
  for(const place of d.places){const point=old?.definition.places.find(x=>x.id===place.id)?.travelPoint;if(point&&!place.travelPoint)place.travelPoint=point;}
  r.worldLibrary={definition:d,placeId:old?.placeId||p.startPlaceId,visitedIds:old?.visitedIds||[],...(old?.characterPlaces?{characterPlaces:old.characterPlaces}:{}),vehicles:old?.vehicles||[],vehicleServices:old?.vehicleServices||{},presentations:old?.presentations||{},installedAt:new Date().toISOString()};
  if(!old&&p.startCase===true&&d.openingCase&&!r.chronicle.activeCaseId){
   const c={id:crypto.randomUUID(),title:d.openingCase.title,summary:d.openingCase.summary,scenarioSource:d.openingCase.gmText,status:'open',visibility:'public',createdAt:new Date().toISOString(),worldLibraryId:d.id};
   r.chronicle.cases.push(c);chronicleCommand(r,u,'startCase',{id:c.id});
  }
  if(!old)locate(r,u,p.startPlaceId,0);else log(r,u,'세계 자료 갱신 · 소지금·물품·재고·현재 위치 유지');
  return {places:d.places.length};
 }
 const w=r.worldLibrary;if(!w)fail('세계 자료를 먼저 등록하세요.');
 if(op==='configureWorldTravel'){
  w.definition.travelModel=validateTravelModel(p);log(r,u,'이동 계산 설정 · '+(p.enabled?'출발·도착 좌표 기반 게임용 추정':'등록된 경로 사용'));return {};
 }
 if(op==='setWorldTravelPoint'){
  const place=w.definition.places.find(x=>x.id===p.placeId);if(!place)fail('등록된 장소를 선택하세요.');
  place.travelPoint=validateTravelPoint(p);log(r,u,'이동 기준점 설정 · '+place.name);return {};
 }
 if(op==='setWorldVehicle'){
  if(!r.characters.some(c=>c.id===p.characterId)||!w.definition.places.some(x=>x.id===p.placeId)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.available!=='boolean')fail('차량 이름·소유 캐릭터·주차 위치를 확인하세요.');
  w.vehicles||=[];let vehicle=p.id?w.vehicles.find(v=>v.id===p.id):null;if(p.id&&!vehicle)fail('차량을 찾을 수 없습니다.');
  if(!vehicle){if(w.vehicles.length>=30)fail('차량은 30대까지 등록할 수 있습니다.');vehicle={id:crypto.randomUUID()};w.vehicles.push(vehicle);}
  Object.assign(vehicle,{name:p.name.trim(),characterId:p.characterId,placeId:p.placeId,available:p.available});log(r,u,'차량 등록·수정 · '+vehicle.name);return {vehicleId:vehicle.id};
 }
 if(op==='setWorldRoute'){
  if(p.from===p.to||![p.from,p.to].every(id=>w.definition.places.some(x=>x.id===id))||!Object.hasOwn(travelModes,p.mode))fail('경로와 이동수단을 확인하세요.');
  if(p.mode==='walk'&&p.won!==0)fail('도보 경로는 비용을 0원으로 설정하세요.');
  if(!Number.isSafeInteger(p.minutes)||p.minutes<1||p.minutes>1440||!Number.isSafeInteger(p.won)||p.won<0||p.won>10000000)fail('소요 시간과 원화 비용을 확인하세요.');
  let edge=w.definition.routes.find(x=>x.from===p.from&&x.to===p.to||x.from===p.to&&x.to===p.from);
  if(!edge){if(w.definition.routes.length>=200)fail('경로 한도입니다.');edge={from:p.from,to:p.to};w.definition.routes.push(edge);}
  edge.modes||={};if(p.distanceKm!==undefined&&(!Number.isFinite(p.distanceKm)||p.distanceKm<=0||p.distanceKm>20000))fail('경로 거리를 확인하세요.');
  edge.modes[p.mode]={minutes:p.minutes,won:p.won,perPerson:false,...(p.distanceKm!==undefined?{distanceKm:p.distanceKm}:{})};log(r,u,`${travelModes[p.mode]} 경로 설정 · ${p.minutes}분 · ${p.won}원`);return {};
 }
 if(op==='travelWorldPlace'){
  const minutes=worldRoute(w.definition,viewerPlace(r,u),p.placeId);if(minutes===null)fail('준비된 도보 경로가 없습니다. GM에게 이동을 선언하세요.');
  if(minutes===0&&r.partyCharacterIds.every(id=>characterPlace(r,id)===p.placeId))return {};
  if(p.expectedMinutes!==minutes)fail('이동 시간이 변경되었습니다.',409);
  locate(r,u,p.placeId,minutes);return {};
 }
 const current=viewerPlace(r,u),shop=r.economy.shops.find(s=>s.id===p.shopId&&s.worldLibraryId===w.definition.id&&s.placeId===current&&s.enabled);
 if(!shop)fail('현재 장소의 상점만 이용할 수 있습니다.');
 if(!openAt(shop,r.chronicle.clock))fail('영업시간이 아닙니다.');
 const active=r.members.find(m=>m.id===u.id)?.activeCharacterId||r.characters.find(c=>canControl(c,u))?.id;
 const at=stamp(r.chronicle.clock.date,r.chronicle.clock.time);
 r.economy.visit={shopId:shop.id,placeId:current,mapId:r.mapId,caseId:r.chronicle.activeCaseId||'',arrivedAt:at,expiresAt:at+3600000};if(active){r.economy.visits||={};r.economy.visits[active]=structuredClone(r.economy.visit);}return {};
}
export function applyWorldArrival(r,original,u,p){
 const action=r.actions.find(a=>a.id===p.actionId),source=original.actions.find(a=>a.id===p.actionId);
 const allowed=original.gmJob.actionIds||original.actions.filter(a=>a.status==='pending').map(a=>a.id);
 if(!source?.worldDestination||source.author!==r.owner||!allowed.includes(p.actionId)||action?.status!=='resolved'||action.timeCharged)fail('이동을 선언하고 완료한 행동만 반영할 수 있습니다.');
 if(declaredTransport(source.text)&&declaredTransport(source.text)!=='walk')fail('유료 이동은 travelWorldAction으로 처리하세요.');
 if(!Number.isSafeInteger(p.minutes)||p.minutes<1||p.minutes>1440)fail('이동 시간을 확인하세요.');
 locate(r,u,source.worldDestination,p.minutes);action.timeCharged=true;
}
export function publicWorld(r,u){
 const w=r.worldLibrary;if(!w)return;
 for(const c of r.chronicle.cases)if(c.worldLibraryId)delete c.scenarioSource;
 w.placeId=viewerPlace(r,u);
 const active=r.members.find(m=>m.id===u?.id)?.activeCharacterId||r.characters.find(c=>canControl(c,u))?.id;
 if(r.economy.visits?.[active])r.economy.visit=structuredClone(r.economy.visits[active]);
 if(r.economy.visits)r.economy.visits=Object.fromEntries(Object.entries(r.economy.visits).filter(([id])=>r.characters.some(c=>c.id===id&&canControl(c,u))));
 const d=w.definition,p=d.places.find(p=>p.id===w.placeId),ids=(p?.npcIds||[]).map(id=>worldId(d.id,id));
 const view=placePresentation(r,p),journeyMap=r.maps.find(m=>m.id===r.mapId);
 const preparedJourney=journeyMap?.contentRef&&r.scene.title===journeyMap.title&&journeyMap.title!==p?.name;
 if(view&&!preparedJourney){
  r.location=view;
  if(r.scene.placeId!==p.id)r.scene={...view,...w.presentations?.[p.id]};
  if(r.combat?.status!=='active'){
   const elsewhere=new Set(r.maps.filter(m=>m.id!==view.mapId).flatMap(m=>m.tokens.map(t=>t.characterId)));
   const present=new Set(r.maps.filter(m=>m.id===view.mapId).flatMap(m=>m.tokens.map(t=>t.characterId)));
   // Redact off-location NPCs before dropping their maps: otherwise the later
   // exploration filter cannot see their hidden tokens to remove their sheets.
   r.characters=r.characters.filter(c=>isCompanion(c)||!c.isNPC||r.partyCharacterIds.includes(c.id)||!elsewhere.has(c.id)||present.has(c.id));
   r.mapId=view.mapId;r.maps=r.maps.filter(m=>m.id===view.mapId);for(const map of r.maps)map.tokens=map.tokens.filter(t=>!r.partyCharacterIds.includes(t.characterId)||characterPlace(r,t.characterId)===p.id);
  }
 }
 delete w.presentations;
 r.cast=(r.cast||[]).filter(n=>!n.worldLibraryId||ids.includes(n.id));
 // Explicit allowlist: no secrets or full authoring sources in any player response.
 w.definition={id:d.id,title:d.title,revision:d.revision,travelModel:d.travelModel,routes:d.routes,places:d.places.map(p=>({id:p.id,name:placeLabel(p.name),region:p.region,description:p.description,hours:p.hours,npcIds:p.npcIds,travelPoint:p.travelPoint})),people:d.people.map(n=>({id:n.id,name:n.name}))};
}
export function worldGMContext(r){
 const w=r.worldLibrary;if(!w)return;
 const d=w.definition,p=d.places.find(p=>p.id===characterPlace(r,r.gmJob?.actorId)),destinations=r.actions.filter(a=>r.gmJob?.actionIds?.includes(a.id)&&a.worldDestination).map(a=>d.places.find(p=>p.id===a.worldDestination)).filter(Boolean);
 const npcs=[...r.characters.filter(c=>c.isNPC),...(r.cast||[]).filter(c=>!r.characters.some(x=>x.id===c.id))];
 const presence={presentNpcIds:npcs.filter(c=>npcPresent(r,c,p?.id)).map(c=>c.id),absentNpcIds:npcs.filter(c=>!npcPresent(r,c,p?.id)).map(c=>c.id)};
 r.worldContext={...presence,current:p,places:d.places.map(x=>({id:x.id,name:x.name,region:x.region})),travelModel:d.travelModel,vehicles:w.vehicles||[],vehicleServices:w.vehicleServices||{},routes:d.routes,shops:(r.economy?.shops||[]).filter(s=>s.enabled&&s.worldLibraryId===d.id).map(s=>({id:s.id,name:s.name,placeId:s.placeId,visitMinutes:s.visitMinutes,schedule:s.schedule})),characterPlaces:r.characters.map(c=>({characterId:c.id,placeId:characterPlace(r,c.id)})),destinations,people:d.people.filter(n=>[...(p?.npcIds||[]),...destinations.flatMap(x=>x.npcIds)].includes(n.id)).map(({inventory,...n})=>({...n,speakerId:worldId(d.id,n.id)})),notice:'Use provided location IDs and facts. NPCs in absentNpcIds are not here and must not speak, react or follow the party. Past dialogue and portraits do not establish current presence. NPCs remain at their recorded location unless both sides agree to travel and a recruited companion is explicitly added to the active party; only that confirmed party member travels. Use presentNpcIds and characterPlaces, respecting hours and live memory. Routine purchases are executed by the server. For free-form movement declarations use travelWorldAction directly: it resolves the pending action and records location/time atomically. Do not call automatic or advanceActionTime for the same movement. Use the current actor location. A new place must already be named in public play; use placeId empty and the exact publicly known placeName. Do not invent hidden locations. Registered walking routes override estimated minutes. Use mode walk/bus/subway/taxi/car matching the declared transport. When travelModel is enabled, the server computes game-estimated travel from the actual actor origin and destination coordinates, including time of day. Car requires an available actor-owned vehicle parked at that origin. Otherwise the server uses authored route minutes and fare; never invent fares or downgrade paid travel to walking. shopId enters the registered shop at arrival and checks opening hours. Travel moves every active party member by default, including separated members, and synchronizes their maps and locations. Only a player explicitly choosing solo travel moves alone; use the action travelScope and the server travel result. The initiating character pays the quoted party fare; never charge another wallet. Do not ask other party members for duplicate travel declarations. For region names resolve the intended arrival place; clarify only ambiguous destinations. endCase settles configured won and CP rewards once; never choose reward amounts.'};
 if(d.bible)r.campaign.bible=[r.campaign.bible,d.bible].filter(Boolean).join('\n\n');
 const active=r.chronicle.cases.find(c=>c.id===r.chronicle.activeCaseId&&c.worldLibraryId===d.id);if(active)r.worldContext.activeCase={title:active.title,source:active.scenarioSource};
 delete r.worldLibrary;
}

// All free-form travel uses the same authoritative location/time transaction.
export function applyWorldTravel(r,original,u,p){
 const source=original.actions.find(a=>a.id===p.actionId),a=r.actions.find(a=>a.id===p.actionId),w=r.worldLibrary;
 const allowed=original.gmJob?.actionIds||original.actions.filter(x=>x.status==='pending').map(x=>x.id);
 const actor=r.characters.find(c=>c.id===source?.actorId);
 if(!w||!source||source.status!=='pending'||a?.status!=='pending'||!allowed.includes(a.id)||!canControl(actor,{id:source.author}))fail('이번 요청의 미처리 행동과 조작 권한을 확인하세요.',403);
 if(r.combat?.status==='active'||a.storyEventId||a.timeCharged)fail('전투·달력 행동은 해당 진행 절차로 처리하세요.');
 const actorIds=travelActorIds(r,source);
 if(r.actions.some(other=>other.id!==a.id&&other.status==='planned'&&actorIds.includes(other.actorId)))fail('함께 이동할 파티원의 진행 중인 판정을 먼저 마치세요.',409);
 const from=characterPlace(r,actor.id);
 if(source.worldFrom&&source.worldFrom!==from)fail('행동 이후 현재 위치가 바뀌었습니다.',409);
 if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)fail('이동 근거가 필요합니다.');
 if(!Number.isSafeInteger(p.minutes)||p.minutes<0||p.minutes>1440)fail('도보 이동 시간을 확인하세요.');
 let place=w.definition.places.find(x=>x.id===p.placeId);
 if(p.placeId&&!place)fail('목적지 ID를 확인하세요.');
 if(!place){
  const name=typeof p.placeName==='string'?p.placeName.trim():'';
  if(name.length<2||name.length>80)fail('공개된 목적지 이름이 필요합니다.');
  // New runtime places may use disclosed fiction, never undisclosed scenario secrets.
  const publicText=original.messages.filter(m=>!m.recipient&&m.channel!=='admin'&&!['request','adminReply','whisper'].includes(m.type)).slice(-60).map(m=>m.text).join('\n')+'\n'+original.chronicle.cases.filter(c=>c.id===original.chronicle.activeCaseId&&c.visibility==='public').map(c=>c.summary||'').join('\n');
  const compact=s=>s.replace(/\s/g,'');if(!compact(publicText).includes(compact(name)))fail('아직 공개되지 않은 장소로 이동할 수 없습니다.');
  place=w.definition.places.find(x=>compact(placeLabel(x.name))===compact(placeLabel(name)));
  if(!place){
   if(w.definition.places.length>=100)fail('장소 한도에 도달했습니다.');
   place={id:'CASE-'+crypto.randomUUID(),name,region:w.definition.places.find(x=>x.id===from)?.region||'현재 지역',description:name+' 주변.',hours:'',npcIds:[],gmText:'',source:'play',caseId:r.chronicle.activeCaseId};
   w.definition.places.push(place);
  }
 }
 const mode=p.mode||'walk';if(!Object.hasOwn(travelModes,mode))fail('이동수단을 확인하세요.');
 const declared=declaredTransport(source.text);if(declared&&declared!==mode)fail('선언한 이동수단을 유지하세요.');
 if(mode!=='walk'&&!declared)fail('유료 이동수단을 먼저 선언하세요.');
 const vehicle=mode==='car'?requireTravelVehicle(r,actor.id,from):null;
 const rawQuote=worldTravelQuote(w.definition,from,place.id,mode,r.chronicle.clock,actorIds.length);
 const quote=vehicle?vehicleQuote(vehicle,rawQuote,w.definition,actorIds.length):rawQuote;
 if(!quote&&mode!=='walk')fail('이 이동수단의 시간·요금이 아직 등록되지 않았습니다.');
 const minutes=quote?.minutes??p.minutes,won=quote?.won||0;
 const shop=p.shopId?r.economy.shops.find(s=>s.id===p.shopId&&s.enabled&&s.worldLibraryId===w.definition.id&&s.placeId===place.id):null;
 if(p.shopId&&!shop)fail('목적지의 상점을 확인하세요.');
 const visitMinutes=shop?.visitMinutes||0;
 if(shop){const end=new Date(stamp(r.chronicle.clock.date,r.chronicle.clock.time)+(minutes+visitMinutes)*60000).toISOString();if(!openAt(shop,{date:end.slice(0,10),time:end.slice(11,16)}))fail('도착 시각에는 영업하지 않습니다.');}
 if(won){if(!r.economy.enabled)fail('캠페인 경제를 먼저 설정하세요.');spendTravel(r,{id:source.author},actor.id,won,{minutes,mode,from,to:place.id});}
 if(place.id!==from&&minutes<1)fail('이동에는 경과 시간이 필요합니다.');
 const start=structuredClone(r.chronicle.clock),startIndex=r.messages.length;
 locate(r,u,place.id,minutes,actorIds);
 if(vehicle){vehicle.placeId=place.id;if(vehicle.spec)vehicle.spec.fuelLiters=Math.max(0,Math.round((vehicle.spec.fuelLiters-quote.fuelLiters)*1000)/1000);}
 if(visitMinutes)chronicleCommand(r,{id:r.owner},'advanceClock',{minutes:visitMinutes,reason:shop.name+' 방문'});
 if(shop){const at=stamp(r.chronicle.clock.date,r.chronicle.clock.time);r.economy.visits||={};r.economy.visit={shopId:shop.id,placeId:place.id,mapId:r.mapId,caseId:r.chronicle.activeCaseId||'',arrivedAt:at,expiresAt:at+3600000};for(const id of actorIds)r.economy.visits[id]=structuredClone(r.economy.visit);log(r,u,`${shop.name} 방문 · ${visitMinutes}분`);}
 a.status='resolved';a.timeCharged=true;a.reason=p.reason;a.worldDestination=place.id;
 a.travel={from,to:place.id,actorIds,scope:travelScope(source),minutes,won,mode,visitMinutes,fromClock:start,toClock:structuredClone(r.chronicle.clock),...(quote?.estimated?{estimated:true,distanceKm:quote.distanceKm,breakdown:quote.breakdown}:{}),...(vehicle?{vehicleId:vehicle.id,fuelLiters:quote.fuelLiters??null}:{})};
 for(const m of r.messages.slice(startIndex))m.gameClock||=structuredClone(r.chronicle.clock);
 const arrival=r.messages.slice(startIndex).find(m=>m.locationArrival);if(arrival){arrival.actionId=a.id;arrival.text+=`\n${actorIds.map(id=>r.characters.find(c=>c.id===id).name).join(' · ')} ${actorIds.length>1?'함께 도착':'도착'}\n${travelModes[mode]} · ${minutes}분 · ${won.toLocaleString('ko-KR')}원`;}
}
export function declaredTransport(text=''){
 const found=[['bus',/버스/],['subway',/지하철|전철/],['taxi',/택시/],['car',/자차|자동차|차를|차로/],['walk',/도보|걸어서/]].filter(([,re])=>re.test(text));
 return found.length===1?found[0][0]:found.length?'ambiguous':'';
}
export function tryDirectWorldTravel(r,u,a){
 if(!r.worldLibrary||a.scope!=='individual'||a.storyEventId||r.actions.some(x=>x.id!==a.id&&x.actorId===a.actorId&&x.status!=='resolved'))return false;
 const mode=declaredTransport(a.text)||'walk';if(mode==='ambiguous')return false;
 // Only complete, affirmative declarations bypass the GM. Questions, negation and compound actions do not.
 const sentence=a.text.trim().replace(/[.!]$/,'').replace(/^(?:나는\s+|나만\s+)?혼자(?:서)?\s+/,'');
 const transport='(?:(?:버스|택시|지하철|전철|자차|자동차)(?:를)?\\s*(?:타고|로)|차로|도보로|걸어서)';
 const bare=sentence.replace(new RegExp(transport,'g'),'').trim().replace(/\s+/g,' ');
 const d=r.worldLibrary.definition,candidates=[];
 for(const place of d.places){
  const shops=r.economy.shops.filter(s=>s.enabled&&s.worldLibraryId===d.id&&s.placeId===place.id);
  const plain=placeLabel(place.name);const names=[place.name,plain,...(/역$/.test(plain)?[plain.slice(0,-1)]:[]),...shops.map(s=>s.name)];
  // A region name is unambiguous only when it has a single authored arrival place.
  if(d.places.filter(p=>p.region===place.region).length===1)names.push(place.region);
  if(names.some(name=>bare.startsWith(name)&&/^(?:(?:으로|로|에|을|를)\s*)?(?:이동한다|이동|간다|가자|출발한다|출발|방문한다|방문)$/.test(bare.slice(name.length).trim())))candidates.push({place,shops});
 }
 if(candidates.length!==1)return false;
 const {place,shops}=candidates[0],quote=worldTravelQuote(d,characterPlace(r,a.actorId),place.id,mode,r.chronicle.clock);
 if(!quote){if(mode!=='walk')fail('이 이동수단의 시간·요금이 아직 등록되지 않았습니다.');return false;}
 const named=shops.filter(s=>sentence.includes(s.name));const shop=named.length===1?named[0]:shops.length===1?shops[0]:null;
 if(/방문/.test(bare)&&shops.length>1&&!shop)return false;
 applyWorldTravel(r,{...r,gmJob:{actionIds:[a.id]}},u,{actionId:a.id,placeId:place.id,placeName:'',minutes:quote.minutes,mode,shopId:shop?.id||'',reason:quote.estimated?'출발·도착 기준 게임용 이동 계산':'등록된 이동 경로'});return true;
}
