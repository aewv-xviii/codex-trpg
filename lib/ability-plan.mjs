import {aquariumRule} from './data/ability-rules.mjs';
import {hasAquarium,applyAquarium,collectAquariumReports} from './aquarium.mjs';
import {applySourceRuling,rulingSource} from './source-ruling.mjs';
import {advanceGameSeconds,syncConditions,clockSeconds,lifecycleLog} from './conditions.mjs';
import {canControl} from '../public/play/character-control.js';
import {validateAbilityPlanConditions} from './ability-plan-conditions.mjs';
import {aquariumProfile} from './aquarium-profile.mjs';

const fail=m=>{throw Error(m);};
const text=(v,max=1000)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('능력 계획의 목적·근거·결과 범위를 입력하세요.');
// Only reviewed purchased profiles are exposed. The model cannot add grants.
export function abilityRules(c){
 if(!hasAquarium(c))return [];
 const rule=structuredClone(aquariumRule);
 rule.parameters={...rule.parameters,...aquariumProfile(c)};
 if(c.abilityGrants?.['predator-visual-1'])rule.capabilities.find(x=>x.id==='predator').quote=rule.expansions['predator-visual-1'].quote;
 delete rule.expansions;return [rule];
}
export function abilityBasis(c,p){
 const rule=abilityRules(c).find(r=>r.id===p.ruleId&&r.revision===p.revision);
 const cap=rule?.capabilities.find(x=>x.id===p.capabilityId&&x.status==='owned');
 if(!cap||p.sourceHash!==undefined&&p.sourceHash!==rule.sourceHash||p.quote!==undefined&&p.quote!==cap.quote)fail('현재 구매된 능력 DB의 버전·근거를 확인하세요.');
 return cap;
}
function canonicalBasis(c,p){const rule=abilityRules(c).find(r=>r.id===p.ruleId&&r.revision===p.revision),cap=abilityBasis(c,p);return {...p,sourceHash:rule.sourceHash,quote:cap.quote};}
function resultOutcome(result){
 if(result.success!==undefined)return result.success?'success':'failure';
 if(['scout','moveFish','recall','carryFish'].includes(result.power))return 'dispatched';
 if(result.roll)return result.roll.success?'success':'failure';
 return 'success';
}
export function waitAbilityReports(r,c,a,die){
 // Stop at each navigation boundary: an early failure can shorten the mission.
 let seconds=0;
 for(let count=0;count<256;count++){
  const missions=(c.aquarium?.fish||[]).filter(f=>f.hp>0&&f.mission?.actionId===a.id);
  if(!missions.length||missions.some(f=>f.mission.pause||f.suppression))break;
  const next=Math.min(...missions.map(f=>{const m=f.mission,total=m.totalSeconds??m.travel+(m.investigation?m.investigation+m.travel:0);const check=m.segments?.find(s=>s.kind==='navigation'&&!s.roll);return Math.max(0,Math.min(total,check?.end??total)-m.elapsed);}));
  if(next){advanceGameSeconds(r,next);seconds+=next;}syncConditions(r,die);
  if(missions.some(f=>f.mission?.pause))break;
  if(count===255)fail('물고기 임무 진행 한도를 초과했습니다.');
 }
 if(seconds)lifecycleLog(r,c,'물고기 임무 대기 · 게임 시간 '+seconds+'초 경과',{actionId:a.id,seconds});
 collectAquariumReports(r);
 return seconds;
}
// Called inside finishJob's copy/CAS transaction. No player state is saved on
// validation failure. Every branch is fixed before dice; failures are receipts.
export function applyAbilityPlan(r,original,p,proofs,die){
 const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'&&original.gmJob?.actionIds?.includes(a.id));
 const c=r.characters.find(c=>c.id===a?.actorId);
 if(!a||!c||!canControl(c,{id:a.author})||!r.partyCharacterIds.includes(c.id)||!abilityRules(c).length)fail('이번 요청의 조작 가능한 능력 선언이 필요합니다.');
 if(r.campaign.system!=='gurps4'||!['individual','turn'].includes(original.gmJob.kind))fail('이번 겁스 능력 선언을 확인하세요.');
 const inCombat=r.combat?.status==='active';
 if(inCombat&&(p.waitForReports||p.steps?.some(s=>!['mechanic','check','describe'].includes(s.kind))))fail('전투 능력 계획은 실제 차례 안의 능력·자유 명령만 조합하세요. 장시간 대기는 전투 차례를 건너뛸 수 없습니다.');
 if(a.mapIntent||a.worldDestination||a.timeCharged||a.abilityPlan)fail('이미 처리했거나 전용 이동·지도 처리인 선언입니다.');
 const objective=text(p.objective);
 if(!Array.isArray(p.steps)||p.steps.length<1||p.steps.length>12||typeof p.waitForReports!=='boolean')fail('능력 단계 1~12개와 귀환 대기 여부가 필요합니다.');
 validateAbilityPlanConditions(p.steps);
 // Validate all citations and branch references, including unexecuted branches.
 for(const s of p.steps){
  text(s.intent);const cap=abilityBasis(c,s.basis);
  if(s.kind==='mechanic'){
   if(!cap.mechanics.includes(s.mechanic?.power))fail('구매 능력에 해당하지 않는 실행입니다.');
  }else if(s.kind==='check'){
   if(!Array.isArray(s.check?.sources)||!s.check.sources.length)fail('새로운 적용 판정에는 원문 근거가 필요합니다.');
   for(const source of s.check.sources)rulingSource(r,source,proofs);
   if(s.check.transfer?.fromId)fail('능력 계획에서 물품 이전을 우회할 수 없습니다. 실제 구매와 전용 절차를 확인하세요.');
  }else if(s.kind==='describe')text(s.description);
  else if(s.kind==='awaitReports'){if(!cap.mechanics.includes('scout'))fail('정찰 능력의 귀환을 기다리세요.');}
  else fail('지원하지 않는 능력 단계입니다.');
 }
 const started=clockSeconds(r),results=[];let paidManeuver=false;
 for(const s of p.steps){
  const parent=results.find(x=>x.id===s.after);
  if(s.when!=='always'&&parent?.outcome!==s.when){results.push({id:s.id,kind:s.kind,intent:s.intent,outcome:'skipped',reason:'선행 결과 조건 불충족'});continue;}
  if(['dead','dying','unconscious'].includes(c.combatState?.status)||c.combatState?.stunned){results.push({id:s.id,kind:s.kind,intent:s.intent,outcome:'blocked',reason:'행동 불가 상태'});break;}
  if(inCombat&&paidManeuver&&s.kind!=='describe')fail('한 능력 계획에서 유료 행동은 한 차례만 실행할 수 있습니다. 자유 명령은 그 전에 배치하세요.');
  const turnBefore=inCombat?JSON.stringify([r.combat.status,r.combat.round,r.combat.index]):'';
  let result,outcome;
  // Mechanics validate their own active-fish requirements. Ordinary sourced
  // checks and effect-free descriptions can follow a completed dismissal.
  if(s.kind==='mechanic'){
   const m=s.mechanic;
   if(!Number.isInteger(m.fishIndex)||m.fishIndex<0||m.fishIndex>2)fail('물고기 순번을 확인하세요.');
   const fishId=m.fishIndex?c.aquarium?.fish?.[m.fishIndex-1]?.id:m.fishId;
   if(m.fishIndex&&!fishId)fail('선택한 활성 물고기가 없습니다.');
   // Distinct, ordered steps may deliberately repeat a mechanic. Each pays its
   // own cost/time; job receipts and unique step IDs prevent replay instead.
   a.status='pending';
   const before=r.messages.length;
   applyAquarium(r,original,{...m,fishId,actionId:a.id},die);
   result=m.power==='witness'?r.messages.slice(before).findLast(x=>x.conditionResult?.power==='witness')?.conditionResult:structuredClone(a.powerResult);
   if(!result)fail('능력 실행 결과가 없습니다.');
   outcome=resultOutcome(result);
  }else if(s.kind==='check'){
   // Per-step time replaces the single-action duplicate-time marker; the plan
   // retains all receipts and charges their actual sum once.
   a.status='pending';delete a.timeCharged;
   result=applySourceRuling(r,original,{...s.check,actionId:a.id},proofs,die);
   outcome=a.sourceRuling.outcome;
   result={...result,resultText:a.sourceRuling.resultText};
  }else if(s.kind==='awaitReports'){
   a.status='resolved';
   const seconds=waitAbilityReports(r,c,a,die),reports=a.powerReports||[];
   const expected=results.filter(x=>x.result?.power==='scout').map(x=>x.result.fishId);
   if(!expected.length)fail('이 계획에서 보낸 정찰의 귀환만 기다릴 수 있습니다.');
   const returned=reports.filter(x=>expected.includes(x.fishId));
   const rolls=returned.flatMap(x=>x.areas?x.areas.map(y=>y.roll):[x.roll]);
   outcome=expected.some(id=>!returned.some(x=>x.fishId===id))?'blocked':rolls.every(x=>x.success)?'success':'failure';
   result={seconds,reportIds:returned.map(x=>x.id),meaning:'모든 조사 구역의 성공 여부. 성공도 전체 인원·적대 여부를 보장하지 않음.'};
  }else{result={description:s.description};outcome='success';}
  if(inCombat&&turnBefore!==JSON.stringify([r.combat.status,r.combat.round,r.combat.index]))paidManeuver=true;
  results.push({id:s.id,kind:s.kind,intent:s.intent,basis:canonicalBasis(c,s.basis),outcome,result});
  // There is no active ally on a failed summon. Never try the remaining plan.
  if(s.kind==='mechanic'&&s.mechanic.power==='summon'&&outcome==='failure'){
   for(const rest of p.steps.slice(results.length))results.push({id:rest.id,kind:rest.kind,intent:rest.intent,outcome:'skipped',reason:'소환 실패'});
   break;
  }
 }
 a.status='resolved';
 a.abilityPlan={objective,steps:structuredClone(p.steps),results,waitForReports:p.waitForReports,narrated:false};
 a.powerResults=results.filter(x=>x.kind==='mechanic'&&x.result).map(x=>x.result);
 if(p.waitForReports)waitAbilityReports(r,c,a,die);else collectAquariumReports(r);
 a.timeCharged={seconds:clockSeconds(r)-started,reason:objective};
 a.abilityPlan.awaitingReports=(c.aquarium?.fish||[]).some(f=>f.mission?.actionId===a.id||f.reportReady?.actionId===a.id);
 a.abilityPlan.reportStatus=(c.aquarium?.fish||[]).filter(f=>results.some(s=>s.result?.fishId===f.id&&s.result?.power==='scout')).map(f=>({fishId:f.id,status:a.powerReports?.some(x=>x.fishId===f.id)?'returned':f.hp<=0||f.blocked?'interrupted':'awaitingReturn'}));
 // All plans, even a failed summon or a purely descriptive use, need a result.
 return a.abilityPlan;
}

export function queueAbilityNarration(r,scopeIds){
 const actions=r.actions.filter(a=>scopeIds.includes(a.id)&&a.abilityPlan&&!a.abilityPlan.narrated);
 if(!actions.length)return false;
 r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'narration',actionIds:actions.map(a=>a.id),abilityResults:true,reportCounts:Object.fromEntries(actions.map(a=>[a.id,a.powerReports?.length||0])),advanceTurn:false,requesterId:actions[0].author,at:new Date().toISOString(),requestText:'abilityPlan.objective의 모든 요청 항목에 대해 서버 results, fishOutcomes와 powerReports를 바탕으로 결과를 반드시 narration으로 전달하세요. 각 단계의 성공·실패·생략·중단을 구별하고 미확인 정보는 미확인으로 남기세요. 방별 조사 결과를 읽고 성공한 구역만 관찰 근거로 쓰세요. 귀환하지 않은 정찰은 진행 중이며 실시간 카메라가 아닙니다. describe 단계는 수치·소유권·새 능력·상태를 부여하지 않습니다. 재굴림·추가 비용·시간 진행 금지. 플레이어에게 같은 선언을 반복시키지 마세요.'};
 return true;
}
