import {applyAquarium,collectAquariumReports} from './aquarium.mjs';
import {waitAbilityReports} from './ability-plan.mjs';

// One player declaration, ordered server operations. The enclosing GM transaction
// rolls back every step if validation fails; failed dice remain real outcomes.
export function applyAquariumSequence(r,original,p,die){
 const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'&&original.gmJob.actionIds?.includes(a.id));
 if(!a)throw Error('이번 요청의 미처리 능력 선언이 필요합니다.');
 if(r.combat?.status==='active')throw Error('전투에서는 현재 차례의 능력 하나씩 처리하세요.');
 if(!Array.isArray(p.steps)||!p.steps.length||p.steps.length>8||typeof p.waitForReports!=='boolean')throw Error('능력 순서와 귀환 대기 여부를 확인하세요.');
 const c=r.characters.find(c=>c.id===a.actorId),results=[],seen=new Set();
 for(const step of p.steps){
  if(!Number.isInteger(step.fishIndex)||step.fishIndex<0||step.fishIndex>2)throw Error('물고기 순번은 0, 1, 2 중 하나입니다.');
  const fishId=step.fishIndex?c?.aquarium?.fish?.[step.fishIndex-1]?.id:step.fishId;
  if(step.fishIndex&&!fishId)throw Error('선택한 물고기가 없습니다.');
  const key=step.power+':'+(['scout','moveFish','report','witness','refraction'].includes(step.power)?fishId||'': '');
  if(seen.has(key))throw Error('같은 능력 단계를 중복 실행할 수 없습니다.');
  seen.add(key);a.status='pending';
  applyAquarium(r,original,{...step,fishId,actionId:a.id},die);
  if(step.power==='witness')continue;
  results.push(structuredClone(a.powerResult));
  if(step.power==='summon'&&!a.powerResult.roll.success)break;
 }
 if(!results.length)throw Error('목격 외의 실제 능력 행동이 필요합니다.');
 a.status='resolved';a.powerResults=results;
 if(p.waitForReports)waitAbilityReports(r,c,a,die);
 collectAquariumReports(r);
}
