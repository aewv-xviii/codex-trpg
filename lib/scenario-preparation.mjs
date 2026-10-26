import {normalizeNPCInventory} from '../public/play/npc-inventory-format.js';
import {normalizeExploration} from '../public/play/exploration-geometry.js';
import {installNPCInventory} from './npc-inventory.mjs';
import {setupIssues} from './campaign-setup.mjs';
import {placeArrivingTokens} from './location-presentation.mjs';
import {stamp} from './chronicle.mjs';
import {imageSource} from './presentation.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('시나리오 초안의 내용을 확인하세요.');
function geometry(v){
 if(v===undefined||v===null)return null;
 if(!Number.isSafeInteger(v.columns)||!Number.isSafeInteger(v.rows)||v.columns<4||v.rows<4||v.columns>40||v.rows>40||!Number.isFinite(v.unit)||v.unit<.1||v.unit>100||!v.exploration)fail('제작 지도의 크기·축척·구조를 확인하세요.');
 return {columns:v.columns,rows:v.rows,unit:v.unit,exploration:normalizeExploration(v.exploration,v.columns,v.rows)};
}
function authoredPosition(p){if(p==null)return null;if(![p.x,p.y].every(x=>Number.isFinite(x)&&x>=0&&x<=1))fail('인물 배치 좌표를 확인하세요.');return {x:p.x,y:p.y};}
export function preparationCommand(r,u,op,p){
 if(!['prepareScenario','scenarioDraft','applyPreparation'].includes(op))return null;
 if(r.owner!==u.id)throw Object.assign(Error('방장 권한이 필요합니다.'),{status:403});
 const c=r.chronicle;
 if(op==='prepareScenario'){
  if(r.campaign.setupVersion&&p.autoApply){const issues=setupIssues(r);if(issues.length)fail(issues.join(' / '));}

  if(p.autoApply&&(c.activeCaseId||r.actions.some(a=>a.status!=='resolved')))fail('현재 케이스와 대기 행동을 먼저 마치세요.');
  if(['queued','running'].includes(r.gmJob?.status))fail('현재 GM 작업을 먼저 마치세요.');
  r.gmJob={id:crypto.randomUUID(),kind:'preparation',status:'queued',at:new Date().toISOString(),requesterId:u.id,title:text(p.title,100),requestText:text(p.scenario,200000),autoApply:p.autoApply===true,generateImages:false};
  return {};
 }
 if(op==='scenarioDraft'){
  if(r.gmJob?.kind!=='preparation'||r.gmJob.status!=='applying')fail('케이스 준비 작업에서만 초안을 저장할 수 있습니다.');
  if(p.startDate!==undefined)stamp(p.startDate,p.startTime);
  if(!Array.isArray(p.locations)||p.locations.length<1||p.locations.length>5||!Array.isArray(p.people)||p.people.length>60)fail('장소는 1~5개, 인물은 60명까지 준비합니다.');
  const locations=p.locations.map(x=>({key:text(x.key,60),title:text(x.title,100),description:text(x.description,2000),imagePrompt:text(x.imagePrompt,2000),geometry:geometry(x.geometry)}));
  if(new Set(locations.map(x=>x.key)).size!==locations.length)fail('장소 식별자는 중복될 수 없습니다.');
  const people=p.people.map(x=>{
   if(!locations.some(l=>l.key===x.locationKey)||typeof x.enemy!=='boolean')fail('인물의 장소와 역할을 확인하세요.');
   return {position:authoredPosition(x.position),inventory:normalizeNPCInventory(x.inventory),name:text(x.name,60),description:text(x.description,2000),locationKey:x.locationKey,enemy:x.enemy,imagePrompt:text(x.imagePrompt,2000)};
  });
  const beats=(p.beats||[]).map((e,index)=>{
   if(!Number.isSafeInteger(e.dayOffset)||e.dayOffset<0||e.dayOffset>365||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.time)||!Number.isSafeInteger(e.duration)||e.duration<0||e.duration>10080||!['scene','activity','deadline'].includes(e.kind)||!Number.isSafeInteger(e.requiresIndex)||e.requiresIndex< -1||e.requiresIndex>=index)fail('사건 시각과 선행 조건을 확인하세요.');
   if(e.locationKey&&!locations.some(l=>l.key===e.locationKey))fail('사건 장소를 확인하세요.');
   if(e.visibility&&!['public','gm'].includes(e.visibility))fail('공개 범위를 확인하세요.');
   return {locationKey:e.locationKey||locations[0].key,visibility:e.visibility||'public',title:text(e.title,100),description:text(e.description,2000),dayOffset:e.dayOffset,time:e.time,duration:e.duration,kind:e.kind,requiresIndex:e.requiresIndex};
  });
  if(r.gmJob.autoApply&&(!p.startDate||!beats.some(e=>e.visibility==='public'&&e.kind!=='deadline')))fail('시작일과 공개된 플레이 사건이 필요합니다.');
  if(beats.length>30)fail('준비 사건은 30개까지 가능합니다.');
  if(!Array.isArray(p.assets||[])||(p.assets||[]).length>15)fail('이미지 목록을 확인하세요.');
  for(const asset of p.assets||[]){
   const list=asset.kind==='map'?locations:asset.kind==='portrait'?people:null;
   if(!list||!Number.isInteger(asset.index)||!list[asset.index]||list[asset.index].image||typeof asset.image!=='string'||asset.image.length>45000)fail('이미지 연결을 확인하세요.');
   list[asset.index].image=imageSource(asset.image,false);
  }
  c.preparation={id:crypto.randomUUID(),startDate:p.startDate||null,startTime:p.startTime||null,title:text(p.title,100),summary:text(p.summary,4000),secrets:text(p.secrets||'비밀 없음',10000),locations,people,beats,assetErrors:(p.assetErrors||[]).slice(0,15).map(e=>({kind:e.kind,index:e.index,error:String(e.error).slice(0,300)}))};
  return {};
 }
 const d=c.preparation;if(!d||d.id!==p.id)fail('최신 준비 초안을 확인하세요.');
 if(c.activeCaseId||r.actions.some(a=>a.status!=='resolved'))fail('현재 케이스와 대기 행동을 마친 뒤 적용하세요.');
 if(!c.clock&&d.startDate){stamp(d.startDate,d.startTime);c.clock={date:d.startDate,time:d.startTime};}
 if(d.beats.length&&!c.clock)fail('사건을 배치할 게임 시작일을 먼저 설정하세요.');
 if(c.events.length+d.beats.length>300)fail('사건 저장 한도를 확인하세요.');
 if(r.maps.length+d.locations.length>10||r.characters.length+d.people.length>60||c.cases.length>=100)fail('지도·캐릭터·케이스 저장 한도를 확인하세요.');
 const id=crypto.randomUUID(),maps=new Map();
 c.cases.push({id,title:d.title,summary:d.summary,assetErrors:d.assetErrors||[],openingPrompt:r.campaign.openingPrompt||'',scenarioSource:r.gmJob.kind==='preparation'?r.gmJob.requestText||'':'',status:'open',visibility:'public',startedAt:new Date().toISOString(),startClock:structuredClone(c.clock),createdAt:new Date().toISOString()});
 for(const location of d.locations){
  const m={id:crypto.randomUUID(),caseId:id,title:location.title,description:location.description,assetBrief:location.imagePrompt,image:location.image||'/play/blank-map.svg',columns:24,rows:16,unit:1,distanceUnit:'yd',grid:true,tokens:[],fog:[],pins:[]};
  if(location.geometry)Object.assign(m,structuredClone(location.geometry));
  r.maps.push(m);maps.set(location.key,m);
 }
 d.people.forEach((person,index)=>{
  const character={id:crypto.randomUUID(),owner:u.id,isNPC:true,controllers:[],name:person.name,description:person.description,assetBrief:person.imagePrompt,hp:10,maxHp:10,fp:10,maxFp:10,caseId:id,npcIdentity:{state:person.enemy?'unseen':'identified'},statsPending:true};
  if(person.image){const portraitId=crypto.randomUUID();character.portraits=[{id:portraitId,label:'초상화',image:person.image,tokenFocus:'face'}];character.expressionId=portraitId;}
  installNPCInventory(r,character,person.inventory);
  r.characters.push(character);
  maps.get(person.locationKey).tokens.push({id:crypto.randomUUID(),characterId:character.id,name:character.name,x:.2+(index%4)*.18,y:Math.min(.95,.3+Math.floor(index/4)*.2),...person.position,positionReviewed:!!person.position,hidden:person.enemy});
 });
 r.notes.push({id:crypto.randomUUID(),caseId:id,title:d.title+' · GM 준비',text:d.secrets,kind:'summary',visibility:'gm'});
 const beatIds=d.beats.map(()=>crypto.randomUUID());
 d.beats.forEach((e,index)=>{
  const date=new Date(c.clock.date+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+e.dayOffset);
  c.events.push({id:beatIds[index],caseId:id,title:e.title,description:e.description,date:date.toISOString().slice(0,10),time:e.time,duration:e.duration,kind:e.kind,requires:e.requiresIndex<0?[]:[beatIds[e.requiresIndex]],mapId:maps.get(e.locationKey||d.locations[0].key)?.id,visibility:e.visibility||'public',status:'scheduled'});
 });
 c.cases.find(c=>c.id===id).npcIds=r.characters.filter(c=>c.caseId===id).map(c=>c.id);
 c.activeCaseId=id;r.mapId=maps.values().next().value.id;
 placeArrivingTokens(r,r.mapId,r.partyCharacterIds);
 c.preparation=null;
 r.messages.push({id:crypto.randomUUID(),type:'system',author:u.id,name:u.name,text:`케이스 준비 적용 · ${d.title} ${d.assetErrors?.length?' · 이미지 '+d.assetErrors.length+'개 생성 실패':''}${d.people.length?' · NPC 수치는 검토가 필요합니다.':''}`,at:new Date().toISOString()});
 return {caseId:id};
}
