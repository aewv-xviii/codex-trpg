import {requireLocalAccess} from '../public/play/off-map-state.js';
import {position as carePosition,yards as careDistance} from './aquarium-space.mjs';
import {controlProfileCommand,recoverControls} from './control-state.mjs';
import {advanceAquarium} from './aquarium.mjs';
import {resolveInjury,settleCrippling} from './injury.mjs';
import {gurpsSuccessRoll} from './gurps.mjs';
import {canControl} from '../public/play/character-control.js';
import {npcPresentation,combatIdentityText} from './npc-identity.mjs';
const fail=(s,status=400)=>{throw Object.assign(Error(s),{status});};
export const stat=(c,key)=>{const aliases={HT:['HT','건강'],Will:['Will','의지'],IQ:['IQ','지능'],Per:['Per','지각']};const f=c.fields?.find(f=>(aliases[key]||[key]).includes(f.name));const n=Number(f?.value);return Number.isFinite(n)&&n>=1?n:key==='HT'?c.combatProfile?.ht:null;};
export function successRoll(target,die){if(!Number.isInteger(target))fail('판정 능력치가 필요합니다.');const dice=[die(6),die(6),die(6)];if(dice.some(n=>!Number.isInteger(n)||n<1||n>6))fail('주사위 오류');const total=dice.reduce((a,b)=>a+b,0);return {dice,total,target,...(target>=3?gurpsSuccessRoll(total,target):{success:total<=4,margin:target-total,outcome:total<=4?'criticalSuccess':total>=17?'criticalFailure':'failure'})};}
export const clockSeconds=r=>r.chronicle?.clock?Math.floor(Date.parse(r.chronicle.clock.date+'T'+r.chronicle.clock.time+':00Z')/1000)+(r.chronicle.combatSeconds||0)+(r.combat?.status==='active'?r.combat.elapsedSeconds||0:0):null;
export function lifecycleLog(r,c,text,details){const hidden=r.chronicle?.cases?.some(x=>x.id===r.chronicle.activeCaseId&&x.visibility==='gm')||c?.contentRef&&!c.contentRevealed&&!r.maps?.some(m=>m.tokens?.some(t=>t.characterId===c.id&&!t.hidden));r.messages.push({id:crypto.randomUUID(),type:'system',name:c?npcPresentation(c).name:'상태',...(c?{speakerId:c.id,expressionId:c.expressionId||'',speakerPresentation:npcPresentation(c)}:{}),author:r.owner,text:combatIdentityText(r,(c?c.name+' · ':'')+text),gameClock:structuredClone(r.chronicle?.clock||null),caseId:r.chronicle?.activeCaseId||'',at:new Date().toISOString(),...(hidden?{recipient:r.owner}:{}),conditionResult:details||{kind:'state'}});}
export function initializeConditions(r){if(!r.lifecycle)r.lifecycle={lastClock:clockSeconds(r)};}
export function addEffect(r,c,e){c.effects??=[];const old=c.effects.find(x=>x.key===e.key&&x.sourceId===e.sourceId);if(old){Object.assign(old,e);return old;}if(c.effects.length>=40)fail('지속 상태가 너무 많습니다.');const effect={id:crypto.randomUUID(),...e};c.effects.push(effect);lifecycleLog(r,c,e.label+' 적용', {effectId:effect.id,operation:'apply'});return effect;}
export function removeEffect(r,c,id,reason='해제'){const e=c.effects?.find(e=>e.id===id);if(!e)return; c.effects=c.effects.filter(x=>x.id!==id);lifecycleLog(r,c,e.label+' · '+reason,{effectId:e.id,operation:'remove'});}
export function modifier(c,scope){const effects=(c.effects||[]).filter(e=>e.remainingSeconds===undefined||e.remainingSeconds>0);let bonus=0,penalty=0;for(const e of effects){const n=e.modifiers?.[scope]||0;if(e.stackGroup){const peers=effects.filter(p=>p.stackGroup===e.stackGroup);if(peers.some(p=>(p.modifiers?.[scope]||0)<n))continue;if(peers.find(p=>(p.modifiers?.[scope]||0)===n)?.id!==e.id)continue;}if(n>0)bonus+=n;else penalty+=n;}return bonus+penalty;}
export function markBleeding(r,c,injury,type,{newWound=true}={}){if(injury<=0)return;if(newWound)c.woundRevision=(c.woundRevision||0)+1;if((!['cut','imp','pi-','pi','pi+','pi++'].includes(type)&&!(type==='burn'&&injury>c.maxHp/2))||c.summonedFish||(r.combat?.status==='active'?r.combat.fighters[c.id]?.status:c.combatState?.status)==='dead'||r.campaign?.bleedingEnabled===false)return;const old=c.effects?.find(e=>e.key==='bleeding');if(old){old.streak=0;return;}addEffect(r,c,{key:'bleeding',label:'출혈',kind:'debuff',source:'GURPS B420 · 선택 규칙',tickRemaining:60,streak:0});}
export function applyInjury(r,c,amount,die,options={}){return resolveInjury(r,c,amount,die,{...options,emit:options.emit||((text,details)=>lifecycleLog(r,c,text,details))});}
// Scoped time credit prevents charging a scheduled completion twice.
const elapsedCredits=new WeakMap();
export function withElapsedCredit(r,seconds,fn){
 if(elapsedCredits.has(r))fail('중첩 시간 예약은 지원하지 않습니다.');
 elapsedCredits.set(r,seconds);try{return fn();}finally{elapsedCredits.delete(r);}
}
export function advanceGameSeconds(r,seconds){if(elapsedCredits.has(r)){const credit=elapsedCredits.get(r);if(!Number.isInteger(seconds)||seconds<0||seconds>credit)fail('예약 시간보다 긴 완료 단계입니다. 계획을 수정하세요.');elapsedCredits.set(r,credit-seconds);return;}if(!r.chronicle?.clock)fail('게임 날짜가 필요합니다.');if(!Number.isInteger(seconds)||seconds<0||seconds>86400*7)fail('경과 시간을 확인하세요.');const sum=(r.chronicle.combatSeconds||0)+seconds;const d=new Date(Date.parse(r.chronicle.clock.date+'T'+r.chronicle.clock.time+':00Z')+Math.floor(sum/60)*60000);r.chronicle.clock={date:d.toISOString().slice(0,10),time:d.toISOString().slice(11,16)};r.chronicle.combatSeconds=sum%60;}
// Called at every authoritative mutation and after each GM command, never by a UI timer.
export function syncConditions(r,die,{rebase=false,restIds=[]}={}){
 for(const c of r.characters)settleCrippling(r,c,die,(text,details)=>lifecycleLog(r,c,text,details));
 initializeConditions(r);const now=clockSeconds(r),previous=r.lifecycle.lastClock;
 if(now===null)return;if(previous===null||rebase){r.lifecycle.lastClock=now;return;}
 const delta=Math.max(0,now-previous);r.lifecycle.lastClock=now;advanceAquarium(r,delta,die);if(!delta)return;
 for(const c of r.characters){
  const state=r.combat?.status==='active'?r.combat.fighters[c.id]:c.combatState;
  if(state?.status==='dead'){if(c.effects?.length)c.effects=[];continue;}
  if(!restIds.includes(c.id))c.restProgressSeconds=0;
  if(r.combat?.status!=='active'&&state?.shockSeconds){state.shockSeconds=Math.max(0,state.shockSeconds-delta);if(!state.shockSeconds)state.shock=0;}
  for(const e of c.effects||[]){if(e.recoveryDelay){e._recoveryElapsed=Math.max(0,delta-e.recoveryDelay);e.recoveryDelay=Math.max(0,e.recoveryDelay-delta);}else e._recoveryElapsed=delta;}
  if(r.combat?.status!=='active')for(const e of [...(c.effects||[])].filter(e=>e.control&&e.recoveryField)){const all=c.effects;c.effects=[e];recoverControls(r,c,die,successRoll,lifecycleLog,e._recoveryElapsed);const kept=c.effects.includes(e);c.effects=all.filter(x=>x!==e||kept);}
  for(const e of c.effects||[])delete e._recoveryElapsed;
  for(const e of [...(c.effects||[])]){
   if(e.key==='bleeding'){
    let left=delta;e.tickRemaining??=60;
    for(let count=0;left>=e.tickRemaining&&c.effects.includes(e);count++){
     if(count>=10000)fail('긴 출혈 경과는 나누어 처리하세요.');left-=e.tickRemaining;e.tickRemaining=60;
     const ht=stat(c,'HT');if(!ht)fail(c.name+'의 출혈 판정 HT가 필요합니다.');
     const roll=successRoll(ht-Math.floor(Math.max(0,c.maxHp-c.hp)/5),die),loss=roll.success?0:roll.outcome==='criticalFailure'?3:1;
     e.streak=roll.success?(e.streak||0)+1:0;
     if(loss)applyInjury(r,c,loss,die,{source:'bloodLoss'});
     lifecycleLog(r,c,`출혈 HT ${roll.total}/${roll.target} · ${loss?'HP −'+loss:'이번 분 출혈 없음'}`,{kind:'bleeding',roll,hpLoss:loss});
     if(roll.outcome==='criticalSuccess'||e.streak>=3)removeEffect(r,c,e.id,'지혈');
    }
    if(c.effects.includes(e))e.tickRemaining-=left;
   }else if(e.remainingSeconds!==undefined){e.remainingSeconds=Math.max(0,e.remainingSeconds-delta);if(!e.remainingSeconds)removeEffect(r,c,e.id,'시간 만료');}
  }
  // Physical stun does not last forever after a battle. Recovery is HT each second.
  if(r.combat?.status!=='active'&&state?.status==='active'&&state.stunned){for(let second=0;second<Math.min(delta,3600)&&state.stunned;second++){const ht=stat(c,'HT');if(!ht)break;const roll=successRoll(ht,die);if(roll.success){state.stunned=false;lifecycleLog(r,c,'기절 회복',{roll});}}}
  if(r.combat?.status!=='active')advanceRecovery(r,c,delta,die);
 }
}
function advanceRecovery(r,c,seconds,die){
 const state=c.combatState;if(!['dying','unconscious'].includes(state?.status)){if(c.recoveryTimer)delete c.recoveryTimer;return;}
 if(c.mortalAftercarePending)return;
 const phase=state.status==='dying'?'mortal':c.hp>=1?'positive':c.hp>-c.maxHp?'nonpositive':'severe';
 if(c.recoveryTimer?.phase!==phase)c.recoveryTimer={phase,elapsed:0,needsAid:false};
 const timer=c.recoveryTimer;timer.elapsed+=seconds;const interval={mortal:1800,positive:900,nonpositive:3600,severe:43200}[phase];
 for(let n=0;timer.elapsed>=interval&&n<1000;n++){
  timer.elapsed-=interval;const ht=stat(c,'HT');if(phase!=='positive'&&!ht)break;
  const roll=phase==='positive'?null:successRoll(ht,die);
  if(phase==='mortal'){
   if(!roll.success){state.status='dead';c.effects=[];lifecycleLog(r,c,'치명상 경과 · 생존 판정 실패',{roll});break;}
   if(roll.outcome==='criticalSuccess'){state.status='unconscious';c.mortalAftercarePending=true;delete c.recoveryTimer;lifecycleLog(r,c,'치명상 안정 · 전투 불능 유지 · 후유증·회복 처치 검토 필요',{roll});break;}
   lifecycleLog(r,c,'치명상 생존 · 30분 뒤 재판정',{roll});
  }else if(phase==='severe'&&timer.needsAid){if(!roll.success){state.status='dead';c.effects=[];lifecycleLog(r,c,'치료 대기 중 생존 판정 실패',{roll});break;}lifecycleLog(r,c,'생존 유지 · 치료 필요',{roll});}
  else if(!roll||roll.success){state.status='active';state.stunned=false;delete c.recoveryTimer;lifecycleLog(r,c,'의식 회복 · 부상과 넘어진 자세는 유지',roll?{roll}:undefined);break;}
  else {if(phase==='severe')timer.needsAid=true;lifecycleLog(r,c,'의식 회복 실패'+(timer.needsAid?' · 치료 필요':''),{roll});}
 }
}
export function restCharacters(r,ids,seconds,die){
 if(r.combat?.status==='active')fail('전투 중에는 휴식할 수 없습니다.');if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)fail('휴식 인물을 확인하세요.');
 if(!Number.isInteger(seconds)||seconds<60||seconds>86400)fail('휴식은 1분~24시간으로 지정하세요.');
 const chars=ids.map(id=>r.characters.find(c=>c.id===id)||fail('인물을 찾을 수 없습니다.'));
 for(const c of chars)if(['dead','dying','unconscious'].includes(c.combatState?.status))fail(c.name+'는 일반 휴식보다 처치가 먼저 필요합니다.');
 initializeConditions(r);
 // Minute steps ensure bleeding can interrupt rest before later FP recovery.
 for(let elapsed=0;elapsed<seconds;elapsed+=60){const step=Math.min(60,seconds-elapsed);advanceGameSeconds(r,step);syncConditions(r,die,{restIds:ids});for(const c of chars){
   if(['dead','dying','unconscious'].includes(c.combatState?.status)){c.restProgressSeconds=0;continue;}
   c.restProgressSeconds=(c.restProgressSeconds||0)+step;
   const points=Math.floor(c.restProgressSeconds/600);c.restProgressSeconds%=600;
   const locked=Math.max(0,c.fatigueDebt?.sleep||0)+Math.max(0,c.fatigueDebt?.food||0)+Math.max(0,c.fatigueDebt?.water||0);
   const gain=Math.min(points,Math.max(0,c.maxFp-locked-c.fp));if(gain){c.fp+=gain;lifecycleLog(r,c,'휴식 · FP +'+gain);}
  }}
 for(const c of chars)lifecycleLog(r,c,Math.round(seconds/60)+'분 휴식 종료 · FP '+c.fp+'/'+c.maxFp);
}
export function conditionCommand(r,u,op,p,die){
 const profile=controlProfileCommand(r,u,op,p);if(profile!==null)return profile;
 if(!['rest','condition'].includes(op))return null;
 if(op==='rest'){const c=r.characters.find(c=>c.id===p.characterId);if(!c||!canControl(c,u))fail('본인 조작 인물만 휴식할 수 있습니다.',403);if(['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'))fail('현재 선언을 먼저 마치세요.');restCharacters(r,[c.id],p.minutes*60,die);return {};}
 if(u.id!==r.owner)fail('상태 적용은 GM이 처리합니다.',403);const c=r.characters.find(c=>c.id===p.characterId);if(!c)fail('인물이 없습니다.');
 if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)fail('상태 적용 근거가 필요합니다.');
 if(p.removeId){removeEffect(r,c,p.removeId,p.reason);return {};}
 if(p.kind==='bleeding'){if(!stat(c,'HT'))fail('HT가 필요합니다.');markBleeding(r,c,1,'cut');return {};}
 if(!['attack','defense','vision','hearing','smell','touch','concentration','observation'].includes(p.scope)||!Number.isInteger(p.modifier)||Math.abs(p.modifier)>10||!p.modifier||!Number.isInteger(p.seconds)||p.seconds<1||p.seconds>86400)fail('상태 수치·기간을 확인하세요.');
 if(typeof p.label!=='string'||!p.label.trim()||p.label.length>60)fail('상태 이름이 필요합니다.');
 addEffect(r,c,{key:'custom:'+p.label,label:p.label,kind:p.modifier>0?'buff':'debuff',source:p.reason,remainingSeconds:p.seconds,modifiers:{[p.scope]:p.modifier}});return {};
}
export function restAction(r,original,p,die){const ids=p.actionIds;if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)fail('휴식 선언을 확인하세요.');const actions=ids.map(id=>r.actions.find(a=>a.id===id&&a.status==='pending'&&original.gmJob.actionIds?.includes(id))||fail('이번 요청의 선언만 처리하세요.'));if(actions.some(a=>!/쉬|휴식|rest/i.test(a.text)))fail('휴식 선언이 필요합니다.');restCharacters(r,[...new Set(actions.map(a=>a.actorId))],p.minutes*60,die);for(const a of actions){a.status='resolved';a.timeCharged=true;a.reason='휴식 완료';}}
export function trySimpleRest(r,a,die){const m=/^(?:나는\s*)?(\d{1,4})\s*분(?:간|동안)?\s*(?:쉰다|쉬기|휴식한다|휴식)(?:[.!])?$/.exec(a.text.trim());if(!m||a.storyEventId||r.combat?.status==='active'||r.actions.some(x=>x.id!==a.id&&x.status!=='resolved'))return false;restCharacters(r,[a.actorId],Number(m[1])*60,die);a.status='resolved';a.timeCharged=true;a.reason='휴식 완료';return true;}
export function careAction(r,original,p,die,{scheduled=false}={}){
 const a=r.actions.find(a=>a.id===p.actionId&&a.status==='pending'&&original.gmJob?.actionIds?.includes(a.id));if(!a)fail('이번 요청의 처치 선언이 필요합니다.');
 if(!/지혈|붕대|응급|처치|bandag|first aid/i.test(a.text))fail('처치 선언을 확인하세요.');
 if(r.combat?.status==='active'&&!scheduled)fail('전투 중 처치는 여러 턴 작업으로 예약하세요.');
 const actor=r.characters.find(c=>c.id===a.actorId),patient=r.characters.find(c=>c.id===p.characterId);if(!actor||!patient||patient.combatState?.status==='dead')fail('처치 대상을 확인하세요.');
 requireLocalAccess(r,actor.id,patient.id);const ap=carePosition(r,actor.id),pp=carePosition(r,patient.id);if(ap&&pp&&careDistance(ap,pp)>1.01)fail('처치 대상에게 닿는 위치로 이동하세요.');
 const places=r.worldLibrary?.characterPlaces;if(places?.[actor.id]&&places?.[patient.id]&&places[actor.id]!==places[patient.id])fail('같은 장소의 인물만 처치할 수 있습니다.');
 if(['dead','dying','unconscious'].includes(actor.combatState?.status))fail('처치자가 행동할 수 없습니다.');
 const skill=actor.fields?.find(f=>/First Aid|응급처치/i.test(f.name));const target=skill?Number(skill.value):stat(actor,'IQ')-4;if(!Number.isInteger(target))fail('응급처치 기능 또는 IQ를 확인하세요.');
 const kit=r.economy?.items?.some(i=>(actor.assets?.items?.[i.id]||0)>0&&/응급|구급|first aid/i.test(i.name));
 const roll=successRoll(target+(kit?0:-2),die);initializeConditions(r);
 // A successful one-minute bandage prevents that minute's bleeding, per B424.
 if(roll.success){for(const e of [...(patient.effects||[])])if(e.key==='bleeding')removeEffect(r,patient,e.id,'응급처치로 지혈');
  if(patient.hp<patient.maxHp&&!patient.woundRevision)patient.woundRevision=1;
  if((patient.woundRevision||0)>(patient.bandagedRevision||0)){patient.hp=Math.min(patient.maxHp,patient.hp+Math.max(1,Math.floor(patient.maxHp/10)));patient.bandagedRevision=patient.woundRevision;}}
 if(!scheduled)advanceGameSeconds(r,60);syncConditions(r,die);a.status='resolved';a.timeCharged=true;
 lifecycleLog(r,patient,`응급처치 · ${roll.success?'지혈 성공':'실패'} · 1분 경과`,{kind:'firstAid',roll,actorId:actor.id,equipmentPenalty:kit?0:-2});
}
