import {normalizeNPCInventory} from './npc-inventory-format.js';
// Portable, data-only preparation format shared by the authoring CLI and server.
import {normalizeExploration} from './exploration-geometry.js';
const fail=m=>{throw Object.assign(Error(m),{status:400});};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:fail('패키지 객체가 필요합니다.');
const str=(v,max=200,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim())?v.trim():fail('패키지 텍스트 길이를 확인하세요.');
const key=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,59}$/.test(v)?v:fail('자료 ID는 영문 소문자·숫자·하이픈으로 작성하세요.');
const num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max?v:fail('패키지 수치 범위를 확인하세요.');
const int=(v,min,max)=>Number.isSafeInteger(v)?num(v,min,max):fail('패키지 정수 수치를 확인하세요.');
const list=(v,max,min=0)=>Array.isArray(v)&&v.length>=min&&v.length<=max?v:fail('패키지 목록 개수를 확인하세요.');
const unique=xs=>{if(new Set(xs.map(x=>x.id)).size!==xs.length)fail('자료 ID가 중복됩니다.');return xs;};
const time=v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)?v:fail('HH:mm 시각이 필요합니다.');
const visibility=v=>v===undefined?'public':['public','gm'].includes(v)?v:fail('공개 범위를 확인하세요.');
const tokenCrop=c=>{
 if(!c||!['x','y','w','h'].every(k=>Number.isFinite(c[k]))||c.x<0||c.y<0||c.w<.0001||c.h<.0001||c.x+c.w>1.000001||c.y+c.h>1.000001)fail('NPC 토큰 구도가 이미지 범위를 벗어났습니다.');
 return {x:c.x,y:c.y,w:c.w,h:c.h};
};
export const travelModes={walk:'도보',bus:'버스',subway:'지하철',taxi:'택시',car:'자차'};
export function departureTime(pack,chronicle,caseId,date,minutes){
 const clock=chronicle.clock;
 const earliest=chronicle.events.filter(e=>e.caseId===caseId&&e.visibility==='public'&&e.kind!=='deadline'&&e.status==='scheduled'&&e.date<=date).map(e=>e.date+'T'+e.time).sort()[0];
 const start=Date.parse(date+'T'+(date===clock.date?clock.time:pack.startTime)+':00Z');
 return earliest?.slice(0,10)===date?Math.max(start,Date.parse(earliest+':00Z')-minutes*60000):start;
}
export function validatePack(input){
 const p=obj(input);if(p.format!=='night-table-pack'||p.schemaVersion!==1)fail('밤의 테이블 패키지 v1 파일이 필요합니다.');
 const out={format:p.format,schemaVersion:1,id:key(p.id),version:str(p.version,30),title:str(p.title,100),summary:str(p.summary||'',2000,true),setting:str(p.setting||'',10000,true),canonStatus:str(p.canonStatus||'draft',40),startRegionId:key(p.startRegionId),startDate:str(p.startDate,10),startTime:time(p.startTime),assets:obj(p.assets||{})};
 const date=new Date(out.startDate+'T00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(out.startDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==out.startDate)fail('시작 날짜를 확인하세요.');
 if(Object.keys(out.assets).length>30)fail('이미지는 패키지당 30개까지입니다.');for(const [id,v] of Object.entries(out.assets)){key(id);if(typeof v!=='string'||v.length>350000)fail('이미지 파일 참조를 확인하세요.');}
 const asset=v=>!v?'':Object.hasOwn(out.assets,v)?v:fail('존재하지 않는 이미지 참조입니다.');
 out.regions=unique(list(p.regions,20,1).map(r=>({id:key(r.id),title:str(r.title,100),summary:str(r.summary||'',2000,true),x:num(r.x,0,1),y:num(r.y,0,1)})));
 const region=id=>out.regions.some(r=>r.id===id)?id:fail('존재하지 않는 지역 참조입니다.');region(out.startRegionId);
 out.routes=unique(list(p.routes||[],60).map(r=>{const modes={};for(const [mode,v] of Object.entries(obj(r.modes))){if(!Object.hasOwn(travelModes,mode))fail('지원하지 않는 이동수단입니다.');modes[mode]={minutes:int(v.minutes,1,1440),won:int(v.won,0,10000000),perPerson:v.perPerson===true,...(Number.isFinite(v.distanceKm)&&v.distanceKm>0?{distanceKm:v.distanceKm}:{})};}if(!Object.keys(modes).length||r.from===r.to)fail('이동 경로를 확인하세요.');return {id:key(r.id),from:region(r.from),to:region(r.to),modes};}));
 out.actors=unique(list(p.actors||[],40).map(a=>({id:key(a.id),name:str(a.name,60),description:str(a.description||'',2000,true),secret:str(a.secret||'',6000,true),role:['npc','enemy'].includes(a.role)?a.role:fail('인물 역할을 확인하세요.'),portrait:asset(a.portrait),...(a.tokenCrop?{tokenCrop:tokenCrop(a.tokenCrop)}:{}),maxHp:int(a.maxHp??10,1,999),maxFp:int(a.maxFp??10,1,999),profile:a.profile?structuredClone(obj(a.profile)):null,reviewed:a.reviewed===true,inventory:normalizeNPCInventory(a.inventory),won:int(a.won??0,0,1e9),ammo:int(a.ammo??0,0,99999)})));
 const actor=id=>out.actors.some(a=>a.id===id)?id:fail('존재하지 않는 인물 참조입니다.');
 out.maps=unique(list(p.maps,40,1).map(m=>({id:key(m.id),regionId:region(m.regionId),title:str(m.title,100),entryMinutes:int(m.entryMinutes??5,1,1440),description:str(m.description||'',2000,true),image:asset(m.image),background:asset(m.background),columns:int(m.columns??24,4,80),rows:int(m.rows??16,4,80),unit:num(m.unit??1,.1,100),tokens:list(m.tokens||[],30).map(t=>({actorId:actor(t.actorId),x:num(t.x,0,1),y:num(t.y,0,1),hidden:t.hidden===true}))})));
 for(const m of out.maps){const source=p.maps.find(x=>x.id===m.id);const e=normalizeExploration(source.exploration,m.columns,m.rows);if(e)m.exploration=e;}
 const map=id=>out.maps.find(m=>m.id===id)||fail('존재하지 않는 지도 참조입니다.');
 out.cases=unique(list(p.cases,20,1).map(c=>{
  const regionId=region(c.regionId),mapIds=list(c.mapIds,8,1).map(id=>{if(map(id).regionId!==regionId)fail('케이스 지도는 목적 지역 안에 있어야 합니다.');return id;});
  const actorIds=[...new Set([...list(c.actorIds||[],20).map(actor),...mapIds.flatMap(id=>map(id).tokens.map(t=>t.actorId))])];
  const openingBeats=c.openingBeats===undefined?undefined:list(c.openingBeats,40,1).map(b=>{
   if(!['narration','npcDialogue','gmQuestion'].includes(b.type))fail('도입부는 나레이션·NPC 대사·GM 안내로 구분하세요.');
   const actorId=b.type==='npcDialogue'?actor(b.actorId):'';
   if(actorId&&!actorIds.includes(actorId))fail('도입부 화자는 케이스에 등록된 인물이어야 합니다.');
   if(b.type!=='npcDialogue'&&b.actorId)fail('나레이션과 GM 안내에는 NPC 화자를 지정하지 마세요.');
   return {type:b.type,text:str(b.text,4000),...(actorId?{actorId}:{})};
  });
  const beats=unique(list(c.beats,30,1).map((b,i)=>({id:key(b.id),title:str(b.title,100),description:str(b.description||'',2000,true),dayOffset:int(b.dayOffset??0,0,365),time:time(b.time),duration:int(b.duration??0,0,10080),kind:['scene','activity','deadline'].includes(b.kind)?b.kind:fail('사건 종류를 확인하세요.'),visibility:visibility(b.visibility),mapId:mapIds.includes(b.mapId)?b.mapId:fail('케이스 밖의 지도입니다.'),requires:list(b.requires||[],20).map(key)})));
  for(let i=0;i<beats.length;i++)if(beats[i].requires.some(id=>!beats.slice(0,i).some(b=>b.id===id)))fail('선행 사건은 목록의 앞에 있어야 합니다.');
  if(!beats.some(b=>b.visibility==='public'&&b.kind!=='deadline'))fail('공개 플레이 사건이 필요합니다.');
  return {id:key(c.id),title:str(c.title,100),summary:str(c.summary||'',4000,true),regionId,mapIds,actorIds,opening:str(c.opening||'',4000,true),...(openingBeats?{openingBeats}:{}),gmNotes:str(c.gmNotes||'',20000,true),visibility:visibility(c.visibility),beats,...(c.reward?{reward:{won:int(c.reward.won,0,1e9),cp:int(c.reward.cp,0,100)}}:{})};
 }));
 if(JSON.stringify({...out,assets:{}}).length>300000)fail('패키지 본문은 30만 자 이하로 준비하세요.');return out;
}
// Routes are campaign-authored travel costs, not real-world transit directions.
export function routeQuote(pack,from,to,mode,partySize=1){
 if(!Object.hasOwn(travelModes,mode))return null;
 if(from===to)return {minutes:0,won:0,path:[from],mode};
 const best=new Map([[from,{minutes:0,won:0,path:[from],mode}]]),done=new Set();
 while(true){const next=[...best.entries()].filter(([id])=>!done.has(id)).sort((a,b)=>a[1].minutes-b[1].minutes||a[1].won-b[1].won)[0];if(!next)return null;const [id,q]=next;if(id===to)return q;done.add(id);
  for(const edge of pack.routes){const target=edge.from===id?edge.to:edge.to===id?edge.from:null,v=edge.modes[mode];if(!target||!v)continue;const candidate={minutes:q.minutes+v.minutes,won:q.won+v.won*(v.perPerson?partySize:1),path:[...q.path,target],mode},old=best.get(target);if(!old||candidate.minutes<old.minutes||candidate.minutes===old.minutes&&candidate.won<old.won)best.set(target,candidate);}
 }
}
