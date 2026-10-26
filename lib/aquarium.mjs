import {fishCanAdvance} from './aquarium-situations.mjs';
import {observeAquarium} from './aquarium-observation.mjs';
import {aquariumRule} from './data/ability-rules.mjs';
import {aquariumProfile,commandPenalty} from './aquarium-profile.mjs';
import {carryFish,dropFishCargo,deliverFishCargo} from './aquarium-cargo.mjs';
import {surveyMission,advanceSurvey,rollSurveyAreas,surveyRoll} from './ability-survey.mjs';
const rules=aquariumRule.parameters;
import {syncFishFighters} from './aquarium-targets.mjs';
import {sceneKey,position,yards,visibleLine,fishPath,pathLength,along,zoneVision,commandDistance} from './aquarium-space.mjs';
import {shockModifier} from './injury.mjs';
// Campaign-authored starting abilities, not new official GURPS statistics.
// Source: 고영환_거짓수족관_판정초안_v1.4.md. Growth nodes are NOT purchased.
import {removeEffect,addEffect,advanceGameSeconds,initializeConditions,lifecycleLog,modifier,stat,successRoll,syncConditions,clockSeconds} from './conditions.mjs';
import {powerTurn,rangePenalty} from './combat.mjs';
import {canControl} from '../public/play/character-control.js';
const fail=s=>{throw Error(s);};
const source='거짓 수족관 v1.4 · 시작 능력';
export function hasAquarium(c){return (c.fields||[]).some(f=>f.name==='시트 출처'&&/PC-GYH-001/.test(f.value))&&(c.fields||[]).some(f=>/장점.*거짓 수족관/.test(f.name));}
export function aquariumSummary(c){return hasAquarium(c)?{revision:aquariumRule.revision,available:aquariumRule.capabilities.flatMap(c=>c.mechanics),activeFish:c.aquarium?.fish||[],workflow:'Use abilityPlan for ability declarations. Interpret open-ended intent from abilityRuleContext and retrieved original rules. Compose purchased mechanics, sourced ordinary checks, conditional follow-ups and descriptive uses. These mechanics are execution adapters, not an exhaustive list of legal fictional actions. Combat permits free commands followed by one paid maneuver via abilityPlan; effects and turn economy are server owned. Legacy aquariumSequence is compatible. Reports require physical return.',notes:aquariumRule.precedence}:undefined;}
export function applyAquarium(r,original,p,die){
 const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'&&original.gmJob.actionIds?.includes(a.id));
 if(!a)fail('이번 요청의 능력 선언이 필요합니다.');
 const c=r.characters.find(c=>c.id===a.actorId);if(!c||!canControl(c,{id:a.author})||!hasAquarium(c))fail('등록된 거짓 수족관 시작 시트가 필요합니다.');
 if(!['summon','dismiss','predator','detect','witness','refraction','refractionAim','moveFish','scout','recall','report','disbelieve','carryFish','dropCargo'].includes(p.power))fail('아직 자동화되지 않은 능력입니다.');
 if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)fail('능력 적용의 상황 근거가 필요합니다.');
 if(!Number.isInteger(p.modifier)||p.modifier>0||p.modifier<-20)fail('거리·환경 페널티를 확인하세요.');
 if(!Number.isFinite(p.distanceYards)||p.distanceYards<0||p.distanceYards>10000000)fail('대상 거리를 확인하세요.');
 const state=r.combat?.status==='active'?r.combat.fighters[c.id]:c.combatState;
 if(state?.stunned||['dead','dying','unconscious'].includes(state?.status))fail('능력을 사용할 수 없는 상태입니다.');
 initializeConditions(r);
 const profile=aquariumProfile(c),started=clockSeconds(r),freshEffects=[],freshZones=[];
 c.aquarium??={revision:'1.4',fish:[]};let result,seconds=['witness','report','disbelieve'].includes(p.power)?0:1,linkRoll=null;
 if(p.power!=='dismiss'&&(c.aquarium.fish||[]).some(f=>f.suppression&&(!p.fishId||f.id===p.fishId)))fail('사이오닉 억제가 적용 중입니다. 억제 해제 후 능력을 사용하세요.');
 const command=['dismiss','moveFish','scout','recall','carryFish','dropCargo'].includes(p.power);
 if(command){
  const selected=p.power==='dismiss'?c.aquarium.fish.filter(f=>f.hp>0):c.aquarium.fish.filter(f=>f.hp>0&&(!p.fishId||p.fishId===f.id)).slice(0,1);
  if(!selected.length)fail('명령할 활성 물고기가 없습니다.');
  // In a narrative scene without measured coordinates the GM supplies the
  // established distance. Known mismatched map spaces never use this fallback.
  const distance=Math.max(...selected.map(f=>commandDistance(r,c.id,f,p.distanceYards)));
  const penalty=commandPenalty(distance);seconds=distance<=rules.commandRange?0:1;
  if(seconds){powerTurn(r,c.id,true);const iq=stat(c,'IQ');if(!iq)fail('명령 링크의 IQ가 필요합니다.');linkRoll=successRoll(iq+penalty+p.modifier+shockModifier(r,c,'IQ'),die);}
 }
 if(!['witness','report','disbelieve'].includes(p.power))powerTurn(r,c.id,true);
 if(linkRoll&&!linkRoll.success){
  result={power:p.power,success:false,linkRoll,reason:'명령 전달 실패 · 기존 임무 유지'};
  lifecycleLog(r,c,'명령 링크 실패 · 기존 지시 계속',result);
 }else
 if(p.power==='summon'){
  if(c.aquarium.fish.some(f=>f.hp>0))fail('활성 유영어를 먼저 해제하세요.');
  const item=r.economy?.items?.find(i=>i.id===p.materialId&&/비닐|plastic/i.test(i.name));
  if(!c.assets?.confirmed||!item||!(c.assets.items[item.id]>0))fail('소지품에 있는 비닐 한 단위를 지정하세요.');
  c.assets.items[item.id]--;if(!c.assets.items[item.id])delete c.assets.items[item.id];
  const roll=successRoll(rules.summonTarget+p.modifier,die);result={power:p.power,roll,materialId:item.id,quantity:-1};
  c.aquarium.materialId=item.id;c.aquarium.fish=roll.success?[1,2].map(n=>({id:crypto.randomUUID(),name:'유영어 '+n,hp:rules.fishHP,maxHp:rules.fishHP,move:rules.fishMove,dx:13,iq:6,per:rules.fishPer,observation:rules.fishObservation,position:position(r,c.id)})):[];
  lifecycleLog(r,c,'유영어 소환 '+(roll.success?'성공 · 두 마리':'실패')+' · 비닐 1단위 소모',result);
 }else if(p.power==='dismiss'){
  if(!c.aquarium.fish.length)fail('해제할 유영어가 없습니다.');
  // No remote inventory teleport: a remote reusable material remains at its location.
  const reusable=c.aquarium.fish.length===2&&c.aquarium.fish.every(f=>f.hp>0);
  if(reusable&&p.fishNearby===true&&position(r,c.id)&&c.aquarium.fish.some(f=>f.position&&(yards(position(r,c.id),f.position)>1||!visibleLine(r,position(r,c.id),f.position))))fail('물고기 두 마리가 실제 회수 위치에 있어야 합니다.');
  if(reusable&&p.fishNearby===true)c.assets.items[c.aquarium.materialId]=(c.assets.items[c.aquarium.materialId]||0)+1;
  const together=reusable&&(yards(c.aquarium.fish[0].position,c.aquarium.fish[1].position)<=1||c.aquarium.fish.every(f=>!f.position)&&p.fishNearby===true);
  if(reusable&&p.fishNearby===true&&!together)fail('온전한 쌍이 함께 회수 위치에 있어야 합니다.');
  if(p.fishNearby!==true){
   const remnants=together?[{itemId:c.aquarium.materialId,quantity:1,reusable:true,position:{...c.aquarium.fish[0].position},reason:p.reason}]:c.aquarium.fish.filter(f=>f.hp>0).map(f=>({quantity:0,reusable:false,position:{...f.position},reason:p.reason}));
   (c.aquarium.remnants??=[]).push(...remnants);
   if(together)c.aquarium.uncollectedMaterial=remnants[0];
  }
  for(const fish of c.aquarium.fish)dropFishCargo(r,c,fish,'물고기 해제 · 물건은 해당 위치에 남음');
  c.aquarium.fish=[];result={power:p.power,reusable:together,collected:together&&p.fishNearby===true};
  lifecycleLog(r,c,'유영어 해제'+(result.collected?' · 비닐 1단위 회수':reusable?' · 비닐은 해제 위치에 남음':''),result);
 }else if(['witness','refraction','refractionAim','moveFish','scout','recall','report','carryFish','dropCargo'].includes(p.power)){
  const fish=c.aquarium.fish.find(f=>f.hp>0&&(!p.fishId||f.id===p.fishId));if(!fish)fail('활성 물고기를 선택하세요.');
  if(p.power==='carryFish'){
   result=carryFish(r,c,fish,p,a.id,sceneKey(r));
  }else if(p.power==='dropCargo'){
   if(!fish.cargo)fail('물고기가 운반 중인 물건이 없습니다.');
   const ground=dropFishCargo(r,c,fish,p.reason);if(fish.mission?.kind==='carryFish')delete fish.mission;
   result={power:p.power,fishId:fish.id,groundId:ground.id,itemId:ground.itemId};
  }else if(p.power==='witness'){
   result=observeAquarium(r,c,p,die);
  }else if(p.power==='refractionAim'){
   const origin=position(r,c.id,fish.position?.space),center=fish.position;
   if(p.actorSeesTarget!==true||!visibleLine(r,origin,center)||yards(origin,center)>rules.refractionRange)fail('조준할 물고기를 직접 볼 수 있어야 합니다.');
   c.aquarium.aim={fishId:fish.id,scene:sceneKey(r),origin:{...origin},center:{...center},readyAt:started+1,woundRevision:c.woundRevision||0};
   result={power:p.power,fishId:fish.id,accuracy:3};lifecycleLog(r,c,'굴절어 조준 · 다음 발동 Acc +3',result);
  }else if(p.power==='refraction'){
   const origin=position(r,c.id,fish.position?.space),center=fish.position||position(r,fish.id),d=yards(origin,center);
   if(p.actorSeesTarget!==true||!visibleLine(r,origin,center)||d>rules.refractionRange)fail('100야드 이내 직접 보이는 물고기와 공간 좌표가 필요합니다.');
   const aim=c.aquarium.aim;
   const aimBonus=aim?.fishId===fish.id&&aim.scene===sceneKey(r)&&aim.readyAt===started&&aim.woundRevision===(c.woundRevision||0)&&yards(aim.origin,origin)===0&&yards(aim.center,center)===0?3:0;
   delete c.aquarium.aim;
   const roll=successRoll((Number.isFinite(profile.refractionTarget)?profile.refractionTarget:rules.refractionTarget)+aimBonus+rangePenalty(d)+p.modifier+zoneVision(r,c.id,fish.id)+shockModifier(r,c,'DX'),die);
   if(roll.success){const zone={id:crypto.randomUUID(),sourceId:c.id,scene:sceneKey(r),position:{...center},radius:rules.refractionRadius,remainingSeconds:rules.refractionSeconds};(r.aquariumZones||=[]).push(zone);freshZones.push(zone);}
   result={power:p.power,roll,center};lifecycleLog(r,c,'굴절어 '+(roll.success?'발동 · 고정 구역 2야드/10초/시각 −2':'실패 · 구역 없음'),result);
  }else if(p.power==='report'){
   if(!fish.reportReady||yards(position(r,c.id,fish.position?.space),fish.position)>1||!visibleLine(r,position(r,c.id,fish.position?.space),fish.position))fail('보고할 물고기가 실제로 돌아와 보여야 합니다.');
   result={power:p.power,fishId:fish.id,roll:fish.reportReady.roll,area:fish.reportReady.area};delete fish.reportReady;
   lifecycleLog(r,c,'물고기 귀환 신호 · 조사 '+(result.roll.success?'성공':'실패')+' · 구체적 관찰 내용은 GM 서술',result);
  }else{
   const previous=fish.mission;
   if(fish.reportReady)fail('돌아온 물고기의 보고를 먼저 전달하세요.');
   const actorPos=position(r,c.id,fish.position?.space);fish.position??=actorPos;
   const survey=p.power==='scout'&&p.scoutAreas?.length?surveyMission(r,fish,p.scoutAreas,p.thorough===true):null;
   const path=survey?.path||fishPath(r,fish,p.path),travel=survey?.travel??Math.ceil(pathLength(path)/fish.move);
   const investigation=survey?.investigation??(p.power==='scout'?(p.thorough?rules.thoroughSurveySeconds:rules.fastSurveySeconds):0);
   if(p.power==='recall'&&yards(path.at(-1),actorPos)>rules.reportRange)fail('귀환 경로는 주인에게 실제로 도착해야 합니다.');
   const observation=p.observation|| (p.thorough?'observation':'automatic');
   if(!['automatic','perception','observation'].includes(observation))fail('조사 판정 종류를 확인하세요.');
   if(previous){fish.interruptedMission={actionId:previous.actionId,kind:previous.kind,reason:p.reason};lifecycleLog(r,c,'이전 물고기 임무를 새 명령으로 대체',{fishId:fish.id,actionId:previous.actionId});}
   delete fish.blocked;delete fish.lost;if(p.power==='scout')delete fish.suspendedSurvey;
   fish.mission={actionId:a.id,scene:sceneKey(r),caseId:r.chronicle.activeCaseId||'',kind:p.power,path,travel,investigation,elapsed:0,area:p.reason,thorough:p.thorough===true,observation,modifier:p.modifier,...(survey||{})};
   result={power:p.power,fishId:fish.id,seconds:fish.mission.totalSeconds??travel+(investigation?investigation+travel:0)};
   lifecycleLog(r,c,'물고기 명령 · '+result.seconds+'초의 게임 내 이동·조사 예약',result);
  }
 }else{
  if(p.power!=='disbelieve'&&!c.aquarium.fish.some(f=>f.hp>0))fail('활성 유영어가 필요합니다.');
  if(p.power==='disbelieve'){
   result=observeAquarium(r,c,p,die);
  }else if(p.power==='predator'){
   const target=r.characters.find(t=>t.id===p.targetId);
   if(!target||target.id===c.id||p.actorSeesTarget!==true||p.targetSawFish!==true)fail('이번 장면에서 물고기를 직접 본, 보이거나 접촉 중인 대상을 지정하세요.');
   if(!['vision','hearing','smell','touch','taste'].includes(p.sense))fail('편집할 감각 하나가 필요합니다.');
   if(!c.aquarium.witnesses?.some(w=>w.targetId===target.id&&w.scene===sceneKey(r)))applyAquarium(r,original,{...p,power:'witness'},die);
   const iq=stat(c,'IQ'),will=stat(target,'Will');if(!iq||!will)fail('IQ와 대상 Will이 필요합니다.');
   const attack=successRoll(iq+profile.talent+p.modifier+modifier({...c,effects:c.effects?.filter(e=>e.key!=='fish-distraction')},'concentration')+shockModifier(r,c,'IQ'),die),defense=attack.success?successRoll(will,die):null,success=attack.success&&(!defense.success||attack.margin>defense.margin);
   result={power:p.power,attack,defense,success,targetId:target.id,sense:p.sense};
   if(success){
    // Starting Predator permits one target and one sense at a time.
    for(const person of r.characters)for(const effect of [...person.effects||[]])if(effect.key==='predator'&&effect.sourceId===c.id)removeEffect(r,person,effect.id,'새 감각 편집으로 대체');
    freshEffects.push(addEffect(r,target,{key:'predator',sourceId:c.id,label:'포식어 · 감각 교란',kind:'debuff',source,description:p.reason,sense:p.sense,remainingSeconds:rules.predatorSeconds}));
    // Feedback is a perception bonus, NEVER general vision-dependent attack/defense.
    const shared=['smell','taste'].includes(p.sense),slot=shared?'taste-smell':p.sense;
    if(shared)for(const e of [...c.effects||[]])if(['feedback:smell','feedback:taste'].includes(e.key))removeEffect(r,c,e.id,'공유 감각 슬롯 갱신');
    freshEffects.push(addEffect(r,c,{key:'feedback:'+slot,sourceId:c.id,label:'감각 환류',kind:'buff',source,remainingSeconds:rules.feedbackSeconds,stackGroup:'feedback:'+slot,modifiers:shared?{'sense:smell':1,'sense:taste':1}:{['sense:'+p.sense]:1}}));
   }
   lifecycleLog(r,c,'포식어 '+(success?'성공':'저항 또는 실패'),result);
  }else{
   const per=stat(c,'Per');if(!per)fail('Per가 필요합니다.');
   const roll=successRoll(per+profile.talent+rangePenalty(p.distanceYards)+p.modifier+shockModifier(r,c,'Per'),die);result={power:p.power,roll,originId:c.id,information:'GM이 실제 존재하는 현재 활성 희귀 정신계 흔적의 적격·거리·차폐를 재정. 성공해도 정체·인원·좌표는 미확정.'};
   lifecycleLog(r,c,'초상 흔적 탐지 · '+(roll.success?'판정 성공':'판정 실패')+' · 발견 정보는 GM 서술',result);
  }
 }
 if(p.power==='witness')return;
 a.status='resolved';a.timeCharged=true;a.powerResult={...result,...(linkRoll?{linkRoll}:{})};
 if(seconds){if(r.combat?.status==='active')powerTurn(r,c.id,false,p.power==='refraction'?'attack':p.power==='refractionAim'?'aim':'concentrate');else advanceGameSeconds(r,seconds);}
 const elapsed=Math.max(0,clockSeconds(r)-started);for(const e of [...freshEffects,...freshZones])e.remainingSeconds+=elapsed;
 syncFishFighters(r);syncConditions(r,die);
}

export function advanceAquarium(r,delta,die){
 const currentScene=sceneKey(r);
 for(const z of r.aquariumZones||[])z.remainingSeconds=Math.max(0,z.remainingSeconds-delta);
 r.aquariumZones=(r.aquariumZones||[]).filter(z=>z.remainingSeconds>0&&z.scene===currentScene);
 for(const c of r.characters)for(const fish of c.aquarium?.fish||[]){
  if(fish.hp<=0)continue;const activeDelta=fishCanAdvance(r,fish,delta),m=fish.mission;
  if(!m||!activeDelta)continue;
  m.elapsed+=activeDelta;
  if(m.segments){advanceSurvey(fish,m,die);if(!fish.mission){fish.suspendedSurvey={actionId:m.actionId,scene:currentScene,path:structuredClone(m.path),area:m.area,areas:rollSurveyAreas(fish,m,die).filter(x=>x.roll),roll:{success:false,unconfirmed:true,meaning:'길을 잃어 조사 중단'}};lifecycleLog(r,c,fish.name+' · 미지 구역 길 찾기 실패 · 귀환 보고 없음',{power:'fishLost',fishId:fish.id,actionId:m.actionId});continue;}}
  else if(m.kind==='carryFish')fish.position=along(m.path,Math.max(0,m.elapsed-m.handlingSeconds)*fish.move);
  else if(m.elapsed<m.travel)fish.position=along(m.path,m.elapsed*fish.move);
  else if(m.elapsed<m.travel+m.investigation)fish.position={...m.path.at(-1)};
  else if(m.investigation)fish.position=along([...m.path].reverse(),(m.elapsed-m.travel-m.investigation)*fish.move);
  else fish.position={...m.path.at(-1)};
  const areas=m.segments?rollSurveyAreas(fish,m,die):null;
  const total=m.totalSeconds??m.travel+m.investigation+(m.investigation?m.travel:0);
  syncFishFighters(r);if(m.elapsed>=total){
   if(m.kind==='carryFish'){
    const delivery=m.targetId?deliverFishCargo(r,c,fish,m.targetId):(()=>{const g=dropFishCargo(r,c,fish,'지정한 장소에 운반 완료');return {delivered:true,groundId:g?.id,itemId:g?.itemId};})();
    const action=r.actions.find(a=>a.id===m.actionId);if(action)(action.fishOutcomes??=[]).push({power:'carryFish',fishId:fish.id,...delivery});
   }
   if(m.kind==='recall'){if(fish.cargo)deliverFishCargo(r,c,fish,c.id);if(fish.suspendedSurvey){fish.reportReady={id:crypto.randomUUID(),...fish.suspendedSurvey};delete fish.suspendedSurvey;}}
   if(m.investigation)fish.reportReady={id:crypto.randomUUID(),actionId:m.actionId,scene:currentScene,path:structuredClone(m.path),roll:areas?areas.at(-1).roll:surveyRoll(fish,m.observation||(m.thorough?'observation':'automatic'),m.modifier||0,die),area:m.area,...(areas?{areas}: {})};delete fish.mission;
  }
 }
}

// Deliver only physically returned reports. Never expose pre-return observations.
export function collectAquariumReports(r){
 for(const c of r.characters)for(const fish of c.aquarium?.fish||[]){
  const report=fish.reportReady;
  if(!report||fish.hp<=0||fish.mission||report.scene&&report.scene!==sceneKey(r)||yards(position(r,c.id,fish.position?.space),fish.position)>1||!visibleLine(r,position(r,c.id,fish.position?.space),fish.position))continue;
  const a=r.actions.find(a=>a.id===report.actionId)||[...r.actions].reverse().find(a=>a.actorId===c.id&&a.powerResult?.power==='scout'&&a.powerResult.fishId===fish.id);
  if(!a||a.status!=='resolved')continue;
  a.powerReports??=[];
  const id=report.id||crypto.randomUUID();
  if(!a.powerReports.some(x=>x.id===id)){
   a.powerReports.push({...report,id,power:'report',fishId:fish.id,fishName:fish.name});
   lifecycleLog(r,c,fish.name+' 귀환 · 조사 '+(report.roll.success?'성공':'실패')+' · 관찰 결과 전달 대기',{power:'report',fishId:fish.id,actionId:a.id,roll:report.roll});
  }
  delete fish.reportReady;
 }
 for(const a of r.actions.filter(a=>a.abilityPlan)){
  const fish=r.characters.find(c=>c.id===a.actorId)?.aquarium?.fish||[];
  a.abilityPlan.awaitingReports=fish.some(f=>f.mission?.actionId===a.id||f.reportReady?.actionId===a.id);
  for(const status of a.abilityPlan.reportStatus||[])if(a.powerReports?.some(x=>x.fishId===status.fishId))status.status='returned';
 }
}
export function queueAquariumReports(r){
 if(['queued','running','applying','error'].includes(r.gmJob?.status))return false;
 collectAquariumReports(r);
 const actions=r.actions.filter(a=>(a.powerReports?.length||0)>(a.powerReportsNarrated||0));
 if(!actions.length)return false;
 r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'narration',actionIds:actions.map(a=>a.id),aquariumReports:true,reportCounts:Object.fromEntries(actions.map(a=>[a.id,a.powerReports.length])),advanceTurn:false,requesterId:actions[0].author,at:new Date().toISOString(),requestText:'귀환한 유영어의 powerReports 및 areas의 방별 성공·실패를 각 물고기별로 읽고 실제 서버 판정과 조사 경로에 한정해 관찰 결과를 반드시 narration으로 전달하세요. 적의 위치·인원·구조는 기존 시나리오의 관찰 가능한 근거만 사용하며 확인 불가는 명시하세요. 성공을 전지적 탐지로 해석하거나 원격 시야·닫힌 방 내부·전체 적 인원·적대 여부를 만들어 내지 마세요. 재굴림·추가 행동·시간 진행 금지. 플레이어에게 보고 선언을 반복시키지 마세요.'};
 return true;
}
