import {accessAllowed} from '../public/play/faction-access.js';
import {requireScopeIdle} from './play-scope.mjs';
const fail=m=>{throw Error(m);};
const text=(s,n=300)=>typeof s==='string'&&s.trim()&&s.length<=n?s.trim():fail('이름과 근거를 확인하세요.');
const score=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1000000?n:fail('신뢰도는 -1000000~1000000 정수로 입력하세요.');
export function validateAccess(r,value){
 if(!Array.isArray(value)||value.length>20)fail('접근 조건을 확인하세요.');
 return value.map(q=>({factionId:r.factions?.find(f=>f.id===q.factionId)?.id||fail('등록된 세력을 선택하세요.'),minimum:score(q.minimum)}));
}
export function requireAccess(r,requirements){if(!accessAllowed(r,requirements))fail('현재 세력 관계로는 이용할 수 없습니다.');}
export function factionCommand(r,u,op,p){
 if(!['configureFaction','adjustFaction','setFactionAccess'].includes(op))return null;
 if(r.owner!==u.id)throw Object.assign(Error('세력 설정과 관계 변경은 방장 권한이 필요합니다.'),{status:403});
 requireScopeIdle(r);r.factions||=[];r.factionEvents||=[];
 if(op==='setFactionAccess'){
  const target=p.kind==='case'?r.chronicle.cases.find(c=>c.id===p.id):p.kind==='offer'?r.economy.shops.find(s=>s.id===p.id)?.offers.find(o=>o.itemId===p.itemId):null;
  if(!target)fail('임무 또는 판매 품목을 선택하세요.');target.accessRequirements=validateAccess(r,p.requirements);return {};
 }
 if(op==='configureFaction'){
  let f=p.id?r.factions.find(f=>f.id===p.id):null;if(p.id&&!f)fail('세력을 찾을 수 없습니다.');
  if(!f){if(r.factions.length>=100)fail('세력 한도입니다.');f={id:crypto.randomUUID(),score:0};r.factions.push(f);}
  f.name=text(p.name,80);f.description=String(p.description||'').slice(0,2000);return {factionId:f.id};
 }
 const f=r.factions.find(f=>f.id===p.id);if(!f)fail('세력을 찾을 수 없습니다.');
 const key=text(p.eventKey,100),reason=text(p.reason,1000),delta=score(p.delta);
 const old=r.factionEvents.find(e=>e.key===key);
 if(old){if(old.factionId!==f.id||old.delta!==delta||old.reason!==reason)fail('같은 사건 키에 다른 변경이 요청됐습니다.');return {duplicate:true};}
 if(r.factionEvents.length>=2000)fail('세력 사건 기록 한도입니다.');f.score=score(f.score+delta);
 r.factionEvents.push({id:crypto.randomUUID(),key,factionId:f.id,delta,reason,score:f.score,caseId:r.chronicle.activeCaseId||'',gameClock:structuredClone(r.chronicle.clock)});
 r.messages.push({id:crypto.randomUUID(),type:'system',name:'세력 관계',text:`${f.name} · 신뢰도 ${delta>=0?'+':''}${delta} · ${reason}`,recipient:r.owner,at:new Date().toISOString()});return {};
}
export function publicFactions(r,u){
 if(r.owner!==u.id)delete r.factionEvents;
 for(const shop of r.economy?.shops||[]){if(r.owner!==u.id)shop.offers=shop.offers.filter(o=>accessAllowed(r,o.accessRequirements));for(const o of shop.offers)if(r.owner!==u.id)delete o.accessRequirements;}
 for(const c of r.chronicle?.cases||[]){c.accessAllowed=accessAllowed(r,c.accessRequirements);if(r.owner!==u.id)delete c.accessRequirements;}
}
