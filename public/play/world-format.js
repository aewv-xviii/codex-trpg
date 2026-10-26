import {normalizeNPCInventory} from './npc-inventory-format.js';
import {routeQuote,travelModes} from './pack-format.js';
import {validateTravelModel,validateTravelPoint,automaticTravelQuote,travelPoint} from './travel-model.js';
const fail=m=>{throw Error(m);};
const text=(v,max=2000)=>typeof v==='string'&&v.length<=max?v:fail('자료 텍스트를 확인하세요.');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(v)?v:fail('자료 ID를 확인하세요.');
const list=(v,max)=>Array.isArray(v)&&v.length<=max?v:fail('자료 목록을 확인하세요.');
const unique=rows=>new Set(rows.map(x=>x.id)).size===rows.length?rows:fail('중복 ID가 있습니다.');
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max?v:fail('자료 수치를 확인하세요.');
const clock=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)?v:fail('영업 시각을 확인하세요.');
export const worldId=(world,source)=>`world:${world}:${source}`;
// Authoring provenance belongs in source data, not in place labels.
export const placeLabel=value=>String(value??'').replace(/\s*(?:\[[^\]]*(?:실존|가상)[^\]]*\]|\([^)]*(?:실존|가상)[^)]*\))/g,'').trim();
export function validateWorld(p){
 if(!p||p.format!=='night-table-world'||p.version!==1||JSON.stringify(p).length>700000)fail('세계 자료 v1 파일을 선택하세요.');
 const w={format:p.format,version:1,id:id(p.id),title:text(p.title,100),revision:text(p.revision,80),bible:text(p.bible,200000)};
 w.openingCase=p.openingCase?{title:text(p.openingCase.title,100),summary:text(p.openingCase.summary,4000),gmText:text(p.openingCase.gmText,20000)}:null;
 w.people=unique(list(p.people,120).map(n=>({id:id(n.id),name:text(n.name,60),gmText:text(n.gmText,6000),inventory:normalizeNPCInventory(n.inventory)})));
 w.places=unique(list(p.places,100).map(x=>({id:id(x.id),name:text(x.name,100),region:text(x.region,100),description:text(x.description,3000),hours:text(x.hours,1000),npcIds:list(x.npcIds,8).map(id),gmText:text(x.gmText,12000),source:text(x.source,250),...(x.mapId?{mapId:text(x.mapId,100)}:{}),...(x.sceneId?{sceneId:text(x.sceneId,100)}:{})})));
 for(let i=0;i<w.places.length;i++)if(p.places[i].travelPoint)w.places[i].travelPoint=validateTravelPoint(p.places[i].travelPoint);
 if(p.travelModel)w.travelModel=validateTravelModel(p.travelModel);
 if(!w.places.length)fail('장소가 필요합니다.');
 const place=x=>w.places.some(p=>p.id===x),person=x=>w.people.some(p=>p.id===x);
 if(w.places.some(p=>p.npcIds.some(n=>!person(n))))fail('연결할 인물이 없습니다.');
 w.routes=list(p.routes,200).map(r=>{if(!place(r.from)||!place(r.to)||r.from===r.to)fail('이동 경로를 확인하세요.');const modes={};for(const [mode,v] of Object.entries(r.modes||{})){if(!Object.hasOwn(travelModes,mode))fail('이동수단을 확인하세요.');if(mode==='walk'&&v.won!==0)fail('도보 비용은 0원이어야 합니다.');modes[mode]={minutes:integer(v.minutes,1,1440),won:integer(v.won,0,10000000),perPerson:v.perPerson===true,...(Number.isFinite(v.distanceKm)&&v.distanceKm>0?{distanceKm:v.distanceKm}:{})};}if(r.minutes===undefined&&!Object.keys(modes).length)fail('이동 시간과 수단이 필요합니다.');return {from:r.from,to:r.to,...(r.minutes!==undefined?{minutes:integer(r.minutes,1,1440)}:{}),...(Object.keys(modes).length?{modes}:{})};});
 w.items=unique(list(p.items,200).map(i=>({id:id(i.id),name:text(i.name,80),kind:['gear','consumable','ammo'].includes(i.kind)?i.kind:fail('물품 분류를 확인하세요.')})));
 w.shops=unique(list(p.shops,30).map(s=>{
  if(!place(s.placeId)||!person(s.npcId)||!Array.isArray(s.schedule)||s.schedule.length!==7)fail('상점 연결과 영업일을 확인하세요.');
  const offers=unique(list(s.offers,100).map(o=>{if(!w.items.some(i=>i.id===o.itemId))fail('상품 참조가 없습니다.');return {id:o.itemId,itemId:o.itemId,price:integer(o.price,1,1e9),stock:integer(o.stock,0,99999),reserved:integer(o.reserved??0,0,99999)};}));
  return {id:id(s.id),name:text(s.name,80),placeId:s.placeId,npcId:s.npcId,visitMinutes:integer(s.visitMinutes??0,0,120),schedule:s.schedule.map(s=>s===null?null:{open:clock(s.open),close:clock(s.close)}),offers};
 }));return w;
}
export function worldTravelQuote(w,from,to,mode='walk',clock,travelers=1){
 const automatic=automaticTravelQuote(w,from,to,mode,clock);
 if(automatic)return {...automatic,won:automatic.won*(['bus','subway'].includes(mode)?travelers:1)};
 if(w.travelModel?.enabled&&travelPoint(w,from)&&travelPoint(w,to))return null;
 return routeQuote({routes:w.routes.map(r=>({...r,modes:{...(r.minutes!==undefined?{walk:{minutes:r.minutes,won:0,perPerson:false}}:{}),...r.modes}}))},from,to,mode,travelers);
}
export function worldRoute(w,from,to){return worldTravelQuote(w,from,to)?.minutes??null;}
