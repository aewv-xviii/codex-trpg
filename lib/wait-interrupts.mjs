import {combatCommand,powerTurn,skipUnavailableTurn} from './combat.mjs';
import {rulingSource} from './source-ruling.mjs';
import {position,yards,visibleLine} from './aquarium-space.mjs';
import {combatLog} from './combat-log.mjs';
// Preserve references held by the outer declaration/activity executor when
// committing an interrupt transaction (notably its action and receipt objects).
function commit(target,source){
 if(Array.isArray(source)){
  const prior=[...target];const values=source.map((v,i)=>{if(v&&typeof v==='object'){const old=v.id?prior.find(x=>x?.id===v.id):prior[i];if(old&&typeof old==='object'&&Array.isArray(old)===Array.isArray(v)){commit(old,v);return old;}}return structuredClone(v);});target.splice(0,target.length,...values);return;
 }
 for(const key of Object.keys(target))if(!Object.hasOwn(source,key))delete target[key];
 for(const [key,v] of Object.entries(source)){if(v&&typeof v==='object'&&target[key]&&typeof target[key]==='object'&&Array.isArray(v)===Array.isArray(target[key]))commit(target[key],v);else target[key]=structuredClone(v);}
}
const fail=m=>{throw Error(m);};
const ready=f=>f&&f.status==='active'&&!f.stunned;
export function reserveWait(r,original,p,proofs){
 const b=r.combat,a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'&&original.gmJob?.actionIds?.includes(a.id));
 const id=a?.actorId||(original.gmJob?.kind==='combat'?original.gmJob.actorId:null),c=r.characters.find(c=>c.id===id);
 if(!c||b?.status!=='active'||b.pending||b.waitInterrupt||b.order[b.index]!==id)fail('현재 자기 차례에서 Wait를 선언하세요.');
 if(!p.sources?.length)fail('Wait 규칙 근거가 필요합니다.');p.sources.forEach(s=>rulingSource(r,s,proofs));
 if(!['attack','move','event'].includes(p.trigger)||!p.reason?.trim()||!Number.isFinite(p.rangeYards)||p.rangeYards<0||p.rangeYards>10000||!b.fighters[p.targetId]||p.targetId===id)fail('특정 상대·발동 조건·관찰 범위를 지정하세요.');
 if(!['attack','feint','ready'].includes(p.response?.action)||p.response.characterId!==id||p.response.targetId!==p.targetId||p.response.extraEffort||!['attack','stepAttack','allOutDetermined','allOutStrong','allOutDouble'].includes(p.response.maneuver||'attack'))fail('Wait에서 전환할 공격·페인트·준비 행동을 미리 지정하세요.');
 if(c.activity&&['queued','paused'].includes(c.activity.status))fail('진행 중 작업을 취소한 뒤 Wait를 선언하세요.');
 powerTurn(r,id,true);b.fighters[id].wait={id:crypto.randomUUID(),trigger:p.trigger,targetId:p.targetId,rangeYards:p.rangeYards,reason:p.reason,response:structuredClone(p.response),defended:false};
 powerTurn(r,id,false,'waitTrigger');if(a){a.status='resolved';a.reason='조건부 Wait 등록';}
 combatLog(r,c.name+' · Wait: '+p.reason,undefined,id);
}
export function interruptWait(r,u,p,die,effortAuthorized=false,fromPlan=false){
 const b=r.combat;if(b.waitInterrupt||!['attack','move'].includes(p.action))return false;
 const id=b.order.find(id=>{const f=b.fighters[id],w=f.wait;return ready(f)&&w&&w.trigger===p.action&&w.targetId===p.characterId&&yards(position(r,id),position(r,p.characterId))<=w.rangeYards&&visibleLine(r,position(r,id),position(r,p.characterId));});
 if(!id)return false;
 return begin(r,id,{effortAuthorized,fromPlan,user:structuredClone(u),payload:structuredClone(p),actionId:r.gmJob?.actionIds?.[0]||''},die);
}
function begin(r,id,resume,die){
 const b=r.combat,f=b.fighters[id],w=f.wait;if(!ready(f)||!w)fail('발동 가능한 Wait가 없습니다.');
 const copy=structuredClone(r),cb=copy.combat,response=structuredClone(w.response);
 if(w.defended&&response.maneuver?.startsWith('allOut'))response.maneuver='attack';
 delete cb.fighters[id].wait;cb.waitInterrupt={index:b.index,actorId:b.order[b.index],waiterId:id,resume};cb.index=cb.order.indexOf(id);
 try{combatCommand(copy,{id:copy.characters.find(c=>c.id===id).owner},'combatAct',response,die,false,true);commit(r,copy);return true;}
 catch(e){delete f.wait;combatLog(r,'Wait 취소 · '+e.message,undefined,id);return false;}
}
export function triggerWait(r,original,p,die){
 const b=r.combat,w=b?.fighters[p.characterId]?.wait;if(b?.status!=='active'||b.pending||b.waitInterrupt||!w||w.trigger!=='event'||!p.reason?.trim())fail('미리 선언한 사건 조건의 Wait만 발동하세요.');
 if(!['combat','individual','turn','narration','awareness'].includes(original.gmJob?.kind))fail('장면 판정 GM 작업이 필요합니다.');
 if(!visibleLine(r,position(r,p.characterId),position(r,w.targetId))||yards(position(r,p.characterId),position(r,w.targetId))>w.rangeYards)fail('관찰 가능한 선언 범위가 아닙니다.');
 begin(r,p.characterId,null,die);
}
// Called instead of advancing initiative after the interrupting maneuver.
export function restoreWaitTurn(r){
 const b=r.combat,i=b.waitInterrupt;if(!i)return false;
 b.index=i.index;i.ready=true;return true;
}
export function resumeWait(r,die){
 const b=r.combat,i=b?.waitInterrupt;if(!i?.ready||b.pending)return;
 delete b.waitInterrupt;if(b.status!=='active'||!i.resume)return;
 const {user,payload,actionId,effortAuthorized,fromPlan}=i.resume,copy=structuredClone(r);
 try{if(!ready(b.fighters[i.actorId]))fail('원래 행동자가 행동할 수 없습니다.');combatCommand(copy,user,'combatAct',payload,die,effortAuthorized,fromPlan);commit(r,copy);}
 catch(e){const a=r.actions.find(a=>a.id===actionId);if(a)a.interruptedResult=e.message;combatLog(r,'인터럽트 뒤 원래 행동 중단 · '+e.message,undefined,i.actorId);skipUnavailableTurn(r);}
}
