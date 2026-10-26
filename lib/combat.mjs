import {interruptWait,restoreWaitTurn,resumeWait} from './wait-interrupts.mjs';
import {offMapPosition,offMapDistance,offMapLine,requireLocalAccess} from '../public/play/off-map-state.js';
import {combatLog as log} from './combat-log.mjs';
import {planCommand,advancePlans,cancelPlanForManual,interruptPlan} from './combat-plans.mjs';
import {counterattackLevel,counterattackOpportunity,recordCounterattackDefense} from './counterattack.mjs';
import {fastDrawTarget} from './fast-draw.mjs';
import {dropMagazine,groundMagazine,recoverMagazine} from './magazine-ground.mjs';
import {validateEffort,effortWeapon,spendEffort} from './combat-effort.mjs';
import {concealedFrom,markStealthCue,queueAwareness} from './awareness.mjs';
import {controlFlags,requireControlAction,recoverControls} from './control-state.mjs';
import {successRoll,lifecycleLog,syncConditions} from './conditions.mjs';
import {peaceAction,peaceActions} from './peace-actions.mjs';
import {largeKnife,ownedKnife} from '../public/play/knife-identity.js';
import {registerCombatObject,releaseTKObjects,tkObjectAction} from './combat-telekinesis.mjs';
import {connectLegacyTemplateDetails} from './combat-catalog.mjs';
import {attackManeuvers,postures,postureOf,postureMove,setPosture,gripWeapon,maneuverAttack,tacticalDefense,noDefense} from './combat-options.mjs';
import {validateArmor,armorAt} from './combat-armor.mjs';
import {locateWeapon,recoverOutside} from './loose-weapons.mjs';
import {fishTarget,fishRecord,hurtFish,syncFishFighters} from './aquarium-targets.mjs';
import {suppressionThreats,randomLocation} from './suppression.mjs';
import {position as spatialPosition,visibleLine,yards,retainAquariumSpace} from './aquarium-space.mjs';
import {ammoFits} from '../public/play/ammo-compatibility.js';
import {projectilePlan,projectileDR} from './projectiles.mjs';
import {rapidFireBonus} from './firearms.mjs';
import {zoneVision} from './aquarium-space.mjs';
import {strength,grappleSkill,grips,freeHands,availableHands,requireMobile,defenseFeintSkill,grapplePenalty,validateHeldAction} from './close-combat.mjs';
import {sheetSkill,brawlingParry} from '../public/play/personal-combat.js';
import {firingPlan,bulletHits,dodgedHits,reloadMagazine,completeMagazineReload,reloadPlan,completeReload,fillMagazine,emptyMagazine} from './firearms.mjs';
import {attackOptions,targetedVitals,parryStep} from './combat-techniques.mjs';
import {damageLocation,visionAttackModifier} from './injury.mjs';
import {hitLocations,legDisabled,weaponDisabled,isCrippled} from '../public/play/injury-state.js';
// GURPS 4e Basic Set: B362-384, B419-420. Torso, single attack, reviewed equipment.
// Optional/special rules are never silently delegated to a model's arithmetic.
import {applyInjury,markBleeding,modifier as conditionModifier} from './conditions.mjs';
import {DEFAULT_COMBAT_ROUND_SECONDS,combatRoundSeconds} from '../public/play/combat-time.js';
import {validateWeapon,selectAttackWeapon} from './combat-weapons.mjs';
import {canControl} from '../public/play/character-control.js';
import {clearLine,clearMovement} from '../public/play/exploration-geometry.js';
import {gurpsSuccessRoll} from './gurps.mjs';
import {stamp} from './chronicle.mjs';
import {endProgress} from './gm-progress.mjs';
import {recordAmmoUse,record as recordEconomy} from './economy.mjs';
import {initializeCombatReactions,queueCombatReaction} from './combat-reactions.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max?v:fail('전투 수치를 확인하세요.');
const int=(v,min,max)=>Number.isInteger(v)?num(v,min,max):fail('정수 수치가 필요합니다.');
const text=(v,max=200)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('내용을 확인하세요.');
const owner=(r,u)=>{if(r.owner!==u.id)fail('방장 권한이 필요합니다.',403);};
const get=(r,id)=>r.characters.find(c=>c.id===id)||fishTarget(r,id)||fail('전투 인물을 찾을 수 없습니다.');
const trace=(a,phase,result)=>a.attackId?{event:{attackId:a.attackId,title:a.title,actorId:a.actorId,targetId:a.targetId,phase,result}}:{};
const alive=f=>!['unconscious','dead','dying','withdrawn'].includes(f.status);
const ai=c=>c.isNPC&&!c.controllers?.length;
export function defenseSuccess(total,target){return total<=4||total<17&&total<=target;}
export function rangePenalty(distance){const steps=[2,3,5,7,10,15,20,30,50,70,100,150,200,300,500,700,1000];if(distance<=2)return 0;const i=steps.findIndex(n=>distance<=n);return -(i<0?17:i);}
export function validateCombatProfile(p){
 const weapon=validateWeapon(p?.weapon);if(p.highPain&&p.injuryTraits?.lowPain)fail('고통에 강함과 약함을 함께 적용할 수 없습니다.');
 const drByLocation=p.drByLocation?Object.fromEntries(Object.entries(p.drByLocation).map(([k,v])=>{if(!Object.hasOwn(hitLocations,k))fail('지원하는 방어 부위가 아닙니다.');return [k,int(v,0,1000)];})):undefined;
 return {armor:validateArmor(p.armor),...(p.telekinesis===5?{telekinesis:5}:{}),encumbrance:int(p.encumbrance??0,0,4),dx:int(p.dx,1,100),ht:int(p.ht,1,100),speed:num(p.speed,.25,50),move:int(p.move,0,100),dodge:int(p.dodge,0,100),parry:p.parry===null?null:int(p.parry,0,100),block:p.block===null?null:int(p.block,0,100),dr:int(p.dr,0,1000),...(drByLocation?{drByLocation}:{}),highPain:p.highPain===true,injuryTraits:Object.fromEntries(['lowPain','noBrain','noVitals','toughSkin','groinSensitive'].map(k=>[k,p.injuryTraits?.[k]===true])),weaponHand:['left','right','both'].includes(p.weaponHand)?p.weaponHand:'unspecified',weapon};
}

function roll3(die){const dice=[die(6),die(6),die(6)];if(dice.some(d=>!Number.isInteger(d)||d<1||d>6))fail('주사위 오류');return {dice,total:dice.reduce((a,b)=>a+b,0)};}
function check(target,die){const r=roll3(die);return {...r,...(target>=3?gurpsSuccessRoll(r.total,target):{success:defenseSuccess(r.total,target),margin:target-r.total,outcome:r.total>=17?'criticalFailure':'failure'}),target};}
function health(r,c,target,label,die){const result=check(target,die);log(r,`${c.name} · ${label} ${result.dice.join('+')}=${result.total} / ${target} · ${result.success?'성공':'실패'}`, undefined, c.id);return result;}
function endTelekinesis(r,id){releaseTKObjects(r,id);const b=r.combat;if(!b)return;b.grapples=(b.grapples||[]).filter(g=>!(g.actorId===id&&g.telekinesis));if(b.fighters[id])delete b.fighters[id].tkConcentrating;}
function concentration(r,c,die){const f=r.combat.fighters[c.id];if(!f.tkConcentrating)return;
 if(!alive(f)||f.stunned||!health(r,c,(sheetSkill(c,/^Will$/)??fail('집중 유지 Will이 필요합니다.'))-3+conditionModifier(c,'concentration')-(f.shock||f.activeShock||0),'염동 집중 유지',die).success){endTelekinesis(r,c.id);log(r,c.name+' · 염동 집중 중단 · 잡기 해제', undefined, c.id);}
}
function dropDisarmedWeapon(r,c,die){
 const b=r.combat,f=b.fighters[c.id],origin=spatialPosition(r,c.id),direction=die(6)-1,angle=direction*Math.PI/3;
 let end={...origin,x:origin.x+(b.theater?(direction<3?1:-1):Math.cos(angle)),y:origin.y+(b.theater?0:Math.sin(angle))};
 if(!visibleLine(r,origin,end))end=origin;
 f.dropped=true;f.disarmed=true;f.weaponRecovery=2;f.lostWeapon=end;
 log(r,c.name+' · 무기 낙하 위치 '+Math.round(end.x*100)/100+', '+Math.round(end.y*100)/100+' yd', undefined, c.id);
}
function reduced(value,c){let n=value;if(c.hp<c.maxHp/3)n=Math.ceil(n/2);if(c.fp<c.maxFp/3)n=Math.ceil(n/2);return n;}
function token(r,id){const m=r.maps.find(m=>m.id===r.combat.mapId);return {map:m,token:m?.tokens.find(t=>t.characterId===id&&!t.hidden)};}
function distance(r,a,b){const detached=offMapDistance(r,a,b);if(detached!==null){if(!Number.isFinite(detached))fail('두 지도 밖 위치의 상호 거리는 아직 연결되지 않았습니다.');return detached;}if(r.combat.theater)return Math.abs(r.combat.theater.positions[a]-r.combat.theater.positions[b]);const x=token(r,a),y=token(r,b);if(!x.token||!y.token)fail('같은 지도에 공개 토큰이 필요합니다.');return Math.hypot((x.token.x-y.token.x)*x.map.columns,(x.token.y-y.token.y)*x.map.rows)*x.map.unit;}
function state(r){if(r.combat?.status!=='active')fail('진행 중인 전투가 없습니다.',409);return r.combat;}
function controlled(r,u,id){const c=get(r,id);if(!canControl(c,u))fail('이 인물의 조작 권한이 없습니다.',403);return c;}
function finish(r,reason,winnerTeam=null){
 retainAquariumSpace(r);
 const b=r.combat;b.status='ended';b.reason=reason;b.winnerTeam=winnerTeam;b.pending=null;delete b.attackSequence;b.endedAt=new Date().toISOString();
 // A queued response for this encounter becomes obsolete; an applying job finishes normally.
 if(r.gmJob?.status==='queued'&&r.gmJob.combatId===b.id&&['combat','combatReview'].includes(r.gmJob.kind)){
  r.gmJob.message='전투가 종료되어 대기 중인 전투 판정을 취소했습니다.';endProgress(r,'cancelled');
 }
 for(const id of b.order){const f=b.fighters[id];cancelPlanForManual(f);delete f.counterattackTargets;get(r,id).combatState={status:f.status,stunned:!!f.stunned,prone:!!f.prone,posture:postureOf(f),grip:f.grip||"normal",dropped:!!f.dropped,...(f.lostWeapon?{lostWeapon:structuredClone(f.lostWeapon)}:{}),...(f.disarmed?{disarmed:true}:{}),shock:Math.max(f.shock||0,f.activeShock||0),shockSeconds:Math.max(f.shock||0,f.activeShock||0)?1:0};}
 // Keep sub-minute combat time, never round every fight up to a minute.
 if(r.chronicle.clock){const seconds=(r.chronicle.combatSeconds||0)+b.elapsedSeconds,minutes=Math.floor(seconds/60);r.chronicle.combatSeconds=seconds%60;if(minutes){const d=new Date(stamp(r.chronicle.clock.date,r.chronicle.clock.time)+minutes*60000);r.chronicle.clock={date:d.toISOString().slice(0,10),time:d.toISOString().slice(11,16)};}}
 log(r,`전투 종료 · ${reason} · ${b.elapsedSeconds}초 경과`);
}
function victory(r){
 const b=r.combat;
 // Campaign house rule: check participants' HP without changing life/consciousness states.
 const depleted=['party','enemy'].filter(team=>{
  const ids=Object.keys(b.fighters).filter(id=>b.fighters[id].team===team&&!b.fighters[id].summon);
  return ids.length>0&&ids.every(id=>get(r,id).hp<=0);
 });
 if(depleted.length){
  finish(r,depleted.length===2?'양측 전원 HP 0 이하 · 무승부':depleted[0]==='enemy'?'상대 전원 HP 0 이하 · 파티 승리':'파티 전원 HP 0 이하 · 상대 승리',depleted.length===2?null:depleted[0]==='enemy'?'party':'enemy');
  return true;
 }
 const teams=new Set(Object.values(b.fighters).filter(f=>!f.summon&&alive(f)).map(f=>f.team));
 if(teams.size<2){finish(r,teams.size?`${teams.has('party')?'파티':'상대'} 측만 전투 가능`:'양측 전투 불능',teams.size?[...teams][0]:null);return true;}
 return false;
}
function next(r){
 if(r.combat?.waitInterrupt&&!r.combat.waitInterrupt.ready){restoreWaitTurn(r);victory(r);return;}
 // Count the occupied round once, including a fight ending partway through it.
 const b=r.combat;if(b.fighters[b.order[b.index]]){const ending=b.fighters[b.order[b.index]];ending.activeShock=0;for(const [id,o] of Object.entries(ending.counterattackTargets||{}))if(o.ready)delete ending.counterattackTargets[id];if(ending.feint?.ready)delete ending.feint;}b.elapsedSeconds=b.round*combatRoundSeconds(b);if(victory(r))return;
 for(let i=0;i<b.order.length;i++){b.index=(b.index+1)%b.order.length;if(b.index===0){b.round++;}const f=b.fighters[b.order[b.index]];if(alive(f)){delete f.wait;f.activeShock=f.shock||0;f.shock=0;f.stepUsed=false;f.movedYards=0;f.parries=0;f.blocked=false;f.acrobaticUsed=false;delete f.effortOffense;delete f.effortDefense;delete f.rapidRecovery;delete f.retreatFrom;f.turnChecked=false;f.maneuver='';delete f.unbalancedUsed;delete f.attackLimb;delete f.attackingHand;f.unarmedParries={};b.suppression=(b.suppression||[]).filter(z=>z.actorId!==b.order[b.index]);if(f.feint)f.feint.ready=true;for(const o of Object.values(f.counterattackTargets||{}))o.ready=true;return;}}
}
export function skipUnavailableTurn(r){const b=r.combat;if(b?.status==='active'&&!b.pending&&!alive(b.fighters[b.order[b.index]]))next(r);}
// Consume a non-attack ability maneuver through the same turn authority.
export function powerTurn(r,id,validateOnly=false,maneuver='concentrate'){
 if(r.combat?.status!=='active')return;
 const b=r.combat,f=b.fighters[id];
 if(b.pending||b.order[b.index]!==id||!f||!alive(f)||f.stunned)fail('현재 능력을 사용할 차례가 아닙니다.');
 requireControlAction(get(r,id),maneuver);validateHeldAction(r,get(r,id),maneuver,null);
 if(!validateOnly){cancelPlanForManual(f);const c=get(r,id);if(c.heldMagazine){dropMagazine(r,c,c.heldMagazine);delete c.heldMagazine;}delete f.reload;f.aim=null;f.maneuver=maneuver;next(r);}
}
function hurt(r,attack,die,review={}){
 if(attack.disarm){const c=get(r,attack.actorId),target=get(r,attack.targetId),tf=r.combat.fighters[target.id],tw=target.combatProfile.weapon;
  const a=check(attack.weapon.skill-(r.combat.fighters[c.id].activeShock||0),die),d=check((tw.kind==='melee'?tw.skill:target.combatProfile.dx)+(target.combatProfile.weaponHand==='both'?2:0),die),margin=a.margin-d.margin;
  if(a.outcome==='criticalFailure')dropDisarmedWeapon(r,c,die);
  if(a.outcome!=='criticalFailure'&&margin>0)dropDisarmedWeapon(r,target,die);else if(a.outcome!=='criticalFailure'&&margin>-3){tf.dropped=true;tf.weaponRecovery=1;}
  log(r,`${c.name} · 무장해제 ${a.total}/${a.target} 대 ${d.total}/${d.target} · ${a.outcome==='criticalFailure'?'공격자 무기 낙하':margin>0?'무기 낙하 · 회수 필요':margin>-3?'상대 무기 준비 해제':'상대 유지'}`,trace(attack,'hit','disarm'), c.id);completeAttack(r,die);return;}
 if(attack.grapple){const b=r.combat;(b.grapples||=[]).push({actorId:attack.actorId,targetId:attack.targetId,hands:attack.hands,telekinesis:!!attack.telekinesis});log(r,`${get(r,attack.actorId).name} → ${get(r,attack.targetId).name} · 몸통 잡기 성공 · DX −4`,trace(attack,'hit','grappled'), get(r,attack.actorId).id);completeAttack(r,die);return;}

 const hits=attack.weapon.kind==='firearm'?(attack.hits??1):1;
 for(let hit=0;hit<hits;hit++)hurtOne(r,attack,die,review,hit+1,hits);
 completeAttack(r,die);
}
function hurtOne(r,attack,die,review,hitNumber,hitCount){
 const c=get(r,attack.targetId),p=c.combatProfile,w=attack.weapon;
 const match=/^(\d+)d6([+-]\d+)?$/.exec(w.damage),dice=Array.from({length:Number(match[1])},()=>die(6));
 let raw=Math.max(w.type==='cr'?0:1,(review.maximum?Number(match[1])*6:dice.reduce((a,b)=>a+b,0))+Number(match[2]||0));
 if(w.ammoDamageMultiplier)raw=Math.max(1,Math.floor(raw*w.ammoDamageMultiplier));
 if(w.kind!=='melee'&&w.halfRange&&attack.distance>=w.halfRange)raw=Math.floor(raw/2);
 raw*=review.multiplier||1;
 const location=c.summonOwnerId?'torso':attack.hitLocation||'torso',locationDamage=damageLocation(c,location,w.type),armor=locationDamage.dr;
 const effectiveArmor=projectileDR(armor,w),dr=review.dr==='ignore'?0:review.dr==='half'?Math.floor(effectiveArmor/2):effectiveArmor;
 const penetration=Math.max(0,raw-dr),mult=locationDamage.multiplier;
 const layer=armorAt(c,location,w.type),blunt=!penetration&&layer.flexible?Math.floor(raw/(w.type==='cr'?5:10)):0;
 const uncapped=penetration?Math.max(1,Math.floor(penetration*mult)):blunt;
 const previousHp=c.hp,logStart=r.messages.length;
 if(w.unarmed&&armor>=3&&!c.combatProfile?.injuryTraits?.toughSkin){const attacker=get(r,attack.actorId),part=w.attackLimb||(w.limb==='foot'?'rightFoot':'leftHand'),self=Math.max(0,Math.min(armor,Math.floor(raw/5))-damageLocation(attacker,part,'cr').dr);if(self)applyInjury(r,attacker,self,die,{location:part,type:'cr',emit:(t,d)=>log(r,attacker.name+' · 맨손 반동 · '+t,{injury:d}, attacker.id)});}
 const amount=c.summonOwnerId?hurtFish(r,c.id,uncapped,{type:w.type,supernatural:w.supernatural===true,area:w.area===true}):applyInjury(r,c,uncapped,die,{location,type:w.type,emit:(text,details)=>log(r,c.name+' · '+text,{injury:details}, c.id)}).amount;if(c.summonOwnerId)c.hp=fishRecord(r,c.id).fish.hp;else markBleeding(r,c,amount,w.type,{newWound:false});
 const state=r.combat.fighters[c.id];
 if(amount){concentration(r,c,die);interruptPlan(state,'피해를 받아 진행 예약을 중단했습니다. 상태 확인 후 다시 선언하세요.');}
 log(r,`${get(r,attack.actorId).name} → ${c.name} · ${w.name}\n명중 ${attack.roll.total}/${attack.target}${hitCount>1?' · 탄환 '+hitNumber+'/'+hitCount:''} · 피해 ${w.damage} [${dice.join(', ')}] → ${raw} · DR ${dr} · 부상 ${amount} · HP ${c.hp}/${c.maxHp}${['cr','cut'].includes(w.type)?'\n밀쳐내기·유연 방어구 등 특수 효과는 GM 검토':''}`,{
  impact:{damage:amount,hpBefore:previousHp,hpAfter:c.hp},
  damage:[['공격 부위',hitLocations[location].label],['피해 유형',w.type],['관통 피해',penetration],['부상 배수','×'+mult],['HP 변화',previousHp+' → '+c.hp],['반감 사거리 적용',w.kind!=='melee'&&w.halfRange&&attack.distance>=w.halfRange?'적용':'없음'],['특수 피해 배수','×'+(review.multiplier||1)],['최대 피해',review.maximum?'적용':'없음']],
  effects:[['충격 페널티',state.shock?'−'+state.shock:'없음'],['신체적 기절',state.stunned?'적용':'없음'],['넘어짐',state.prone?'적용':'없음'],['무기 놓침',state.dropped?'적용':'없음'],['전투 상태',({active:'전투 가능',unconscious:'의식 없음',dead:'사망',dying:'치명상',withdrawn:'이탈'})[state.status]||state.status]]
 }, get(r,attack.actorId).id);
 for(const message of r.messages.slice(logStart)){message.combatId=r.combat.id;message.combatDetails={...message.combatDetails,...trace(attack,'damage','applied')};}
}
function conscious(r,c,f,die){
 if(f.turnChecked||c.hp>0)return true;
 f.turnChecked=true;const h=health(r,c,c.combatProfile.ht-Math.floor(Math.max(0,-c.hp)/c.maxHp),'의식 유지',die);
 if(!h.success){f.status='unconscious';f.aim=null;return false;}return true;
}
export function queueCombatAI(r){
 const b=r.combat;if(!b||['queued','running','applying'].includes(r.gmJob?.status))return;
 if(queueCombatReaction(r))return;
 if(b.status!=='active')return;
 if(b.pending?.kind==='critical'){r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'combatReview',combatId:b.id,at:new Date().toISOString(),requesterId:r.owner};return;}
 if(b.pending&&b.pending.kind!=='defense')return;
 const id=b.pending?.targetId||b.order[b.index],c=get(r,id);
 if(ai(c))r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'combat',actorId:id,combatId:b.id,at:new Date().toISOString(),requesterId:r.owner};
}
export function advanceCombatPlans(r,die){advancePlans(r,die,(...args)=>{combatCommand(...args);syncConditions(args[0],die);});}
export function combatCommand(r,u,op,p,die,effortAuthorized=false,fromPlan=false){
 if(op==='combatPlan')return planCommand(r,u,p);
 if(op==='combatAct'&&p.action==='reload'&&p.continueUntilDone===true)return planCommand(r,u,{...p,kind:'reload'});
 if(op==='combatObject')return registerCombatObject(r,u,p);if(op==='locateWeapon')return locateWeapon(r,u,p);if(op==='recoverWeapon')return recoverOutside(r,u,p);
 if(!['combatProfile','combatStart','combatJoin','combatAct','combatDefend','combatReview','combatEnd','combatRetry','combatRecovery','combatModifier'].includes(op))return null;
 if(op==='combatRecovery'){owner(r,u);if(r.combat?.status==='active')fail('전투 밖에서 상태를 정정하세요.');const c=get(r,p.characterId);const reason=text(p.reason,500);c.combatState={status:'active',stunned:false,prone:false,dropped:false};log(r,`${c.name} · 전투 상태 정정 · ${reason}`, undefined, c.id);return {};}
 if(op==='combatProfile'){
  const c=get(r,p.characterId);if(c.owner!==u.id&&r.owner!==u.id)fail('소유자만 전투 시트를 수정할 수 있습니다.',403);
  if(r.combat?.status==='active')fail('전투 중에는 장비 수치를 바꿀 수 없습니다.');
  const nextProfile=validateCombatProfile(p.profile);
  if(r.economy?.enabled){
   owner(r,u);const old=c.combatProfile?.weapon,w=nextProfile.weapon;
   if(w.kind!=='melee'){
    const ammo=r.economy.items.find(i=>i.id===p.profile.weapon.ammoItemId&&i.kind==='ammo');if(!ammo)fail('등록된 탄약 종류를 연결하세요.');
    if(w.cartridge&&!ammoFits(w,ammo,r.economy.items))fail('총기와 탄약 규격이 맞지 않습니다.');w.cartridge||=ammo.cartridge;
    w.ammoItemId=ammo.id;w.capacity=int(p.profile.weapon.capacity,1,1000);
    if(w.ammo!==(old?.kind!=='melee'?old?.ammo||0:0))fail('탄약 수는 시트에서 바꿀 수 없습니다. 소지품에서 장전하세요.');
    if(w.ammo>w.capacity)fail('장전된 탄약보다 장탄수가 작습니다. 먼저 탄약을 회수하세요.');
   }
   if(old?.ammo>0&&(old.kind!==w.kind||old.name!==w.name||old.ammoItemId&&old.ammoItemId!==w.ammoItemId))fail('무기를 바꾸기 전에 장전된 탄약을 회수하세요.');
  }
  if(c.combatProfile?.weapon?.insertedMagazine&&c.combatProfile.weapon.name===nextProfile.weapon.name)nextProfile.weapon.insertedMagazine=structuredClone(c.combatProfile.weapon.insertedMagazine);
  c.combatProfile=nextProfile;c.statsPending=false;return {};
 }
 if(op==='combatStart'){
  if(p.theater)for(const f of p.fighters||[]){const detached=offMapPosition(r,f.id);if(detached)p.theater.positions[f.id]=-detached.distanceYards;}
  owner(r,u);if(r.campaign.system!=='gurps4')fail('겁스 4판 전투입니다.');
  if(r.combat?.status==='active'||['queued','running'].includes(r.gmJob?.status)||(!p.theater&&r.actions.some(a=>a.status!=='resolved')))fail('현재 진행을 먼저 마치세요.');
  if(!Array.isArray(p.fighters)||p.fighters.length<2||p.fighters.length>12||new Set(p.fighters.map(f=>f.id)).size!==p.fighters.length)fail('참가자는 2~12명, 중복 없이 선택하세요.');
  if(r.economy?.enabled)for(const f of p.fighters){const c=get(r,f.id),w=c.combatProfile?.weapon;if(!c.assets?.confirmed)fail('참가 인물의 시작 자산을 먼저 확정하세요.');if(w&&w.kind!=='melee'&&(!w.ammoItemId||!w.capacity))fail(`${c.name}의 무기에 탄종과 장탄수를 연결하세요.`);}
  if(!p.theater&&r.maps.find(m=>m.id===r.mapId)?.distanceUnit!=='yd')fail('겁스 전투 지도의 단위를 야드(yd)로 설정하세요.');
  const fighters={};
  for(const f of p.fighters){const c=get(r,f.id);connectLegacyTemplateDetails(c);if(!['party','enemy'].includes(f.team))fail('진영을 확인하세요.');if(!c.combatProfile||c.statsPending)fail(`${c.name}의 전투 장비·수치를 먼저 저장하세요.`);validateCombatProfile(c.combatProfile);if(!Number.isInteger(c.maxHp)||c.maxHp<1||!Number.isInteger(c.maxFp)||c.maxFp<1)fail('최대 HP·FP를 확인하세요.');if(c.hp<=0||c.fp<=0||c.combatState&&!alive(c.combatState))fail(`${c.name}의 부상을 먼저 확인하세요.`);if(!p.theater&&!r.maps.find(m=>m.id===r.mapId)?.tokens.some(t=>t.characterId===c.id&&!t.hidden))fail(`${c.name}의 공개 토큰을 현재 지도에 배치하세요.`);fighters[c.id]={team:f.team,status:'active',...c.combatState,shock:0,activeShock:0,parries:0};}
  if(new Set(Object.values(fighters).map(f=>f.team)).size!==2)fail('양측 참가자가 필요합니다.');
  // Random tie key is generated once and persisted, never re-rolled by clients.
  if(p.theater){if(!p.theater.positions||p.fighters.some(f=>!Number.isFinite(p.theater.positions[f.id])||Math.abs(p.theater.positions[f.id])>10000)||!p.fighters.some(f=>f.id===p.theater.openingActorId))fail('텍스트 전투의 거리와 선행 행동을 확인하세요.');}
  const ties=Object.fromEntries(p.fighters.map(f=>[f.id,roll3(die).total]));
  const order=p.fighters.map(f=>f.id).sort((a,b)=>get(r,b).combatProfile.speed-get(r,a).combatProfile.speed||get(r,b).combatProfile.dx-get(r,a).combatProfile.dx||ties[b]-ties[a]||a.localeCompare(b));
  if(p.theater){const start=order.indexOf(p.theater.openingActorId);order.push(...order.splice(0,start));}
  r.combat={id:crypto.randomUUID(),status:'active',mapId:r.mapId,caseId:r.chronicle.activeCaseId,order,fighters,...(p.theater?{theater:structuredClone(p.theater)}:{}),index:p.theater?order.indexOf(p.theater.openingActorId):0,round:1,roundSeconds:DEFAULT_COMBAT_ROUND_SECONDS,elapsedSeconds:0,pending:null};
  log(r,'전투 시작 · '+order.map(id=>get(r,id).name).join(' → '));syncFishFighters(r);initializeCombatReactions(r);return {};
 }
 if(op==='combatAct'&&r.combat?.status!=='active'&&peaceActions.has(p.action))return peaceAction(r,u,p);
 const b=state(r);
 if(op==='combatJoin'){
  owner(r,u);if(b.pending)fail('진행 중 공격을 먼저 마치세요.');
  if(!Array.isArray(p.fighters)||!p.fighters.length||new Set(p.fighters.map(f=>f.id)).size!==p.fighters.length||b.order.length+p.fighters.length>12)fail('합류 명단을 확인하세요.');
  for(const entry of p.fighters){const c=get(r,entry.id);if(b.fighters[c.id]||!c.isNPC||c.controllers?.length||!['enemy','party'].includes(entry.team)||!c.combatProfile||c.statsPending||c.hp<=0||c.fp<=0||c.combatState&&!alive(c.combatState))fail('합류 가능한 등록 NPC가 필요합니다.');validateCombatProfile(c.combatProfile);if(b.theater)num(entry.position,-10000,10000);else if(!token(r,c.id).token)fail('현재 전투 지도에 공개 토큰이 필요합니다.');}
  // Append to the current round without resetting initiative, pending actions or time.
  for(const entry of p.fighters){const c=get(r,entry.id);b.fighters[c.id]={team:entry.team,status:'active',...c.combatState,shock:0,activeShock:0,parries:0};b.order.push(c.id);if(b.theater)b.theater.positions[c.id]=entry.position;log(r,c.name+' · 교전 합류 · '+text(p.reason,500), undefined, c.id);}return {};
 }
 if(op==='combatModifier'){owner(r,u);if(b.pending)fail('공격 전에 보정을 정하세요.');const f=b.fighters[b.order[b.index]];f.attackModifier=int(p.modifier,-20,20);log(r,`${get(r,b.order[b.index]).name} · 다음 공격 보정 ${f.attackModifier} · ${text(p.reason,500)}`, undefined, get(r,b.order[b.index]).id);return {};}
 if(op==='combatEnd'){owner(r,u);if(b.pending)fail('대기 중인 방어·검토를 먼저 마치세요.');finish(r,text(p.reason,500));return {};}
 if(op==='combatRetry'){owner(r,u);return {};}
 if(op==='combatReview'){
  owner(r,u);const pending=b.pending;if(pending?.kind!=='critical')fail('대기 중인 대성공·대실패가 없습니다.');
  const reason=text(p.reason,500);log(r,`특수 판정 검토 · ${reason}`,trace(pending,pending.miss||pending.defenseFailure?'hit':'damage','review'));
  if(pending.miss){if(!pending.suppressionZoneId)delete b.attackSequence;completeAttack(r,die);}else {if(![1,2,3].includes(p.multiplier)||!['normal','half','ignore'].includes(p.dr))fail('피해 적용을 확인하세요.');hurt(r,pending,die,{multiplier:p.multiplier,dr:p.dr,maximum:p.maximum===true});}return {};
 }
 if(op==='combatDefend'){
  const a=b.pending;if(a?.kind!=='defense'||p.characterId!==a.targetId)fail('현재 방어 대상이 아닙니다.',409);
  const c=controlled(r,u,a.targetId),f=b.fighters[c.id],profile=c.combatProfile;
  if(p.defense!=='none'){if(f.wait)f.wait.defended=true;if(c.activity?.status==='queued')c.activity.disrupted=true;}
  if(!conscious(r,c,f,die)){hurt(r,a,die);return {};}
  if(c.summonOwnerId&&!['dodge','none'].includes(p.defense))fail('유영어는 회피만 가능합니다.');
  if(!['dodge','parry','block','none'].includes(p.defense))fail('방어를 선택하세요.');
  if(p.defense!=='none'&&controlFlags(c).noDefense)fail('마비 상태에서는 능동 방어할 수 없습니다.');
  if(p.defense!=='none'&&noDefense(f))fail('제압 사격 중에는 다음 자기 차례까지 능동방어를 할 수 없습니다.');
  const effort=validateEffort(p,c,f,true);if(effort&&!ai(c)&&!effortAuthorized)fail('플레이어 추가 노력은 선언과 FP 확인을 거쳐 실행하세요.');
  if(effort==='rapidRecovery')f.rapidRecovery=true;
  if(p.defense==='none'){log(r,`${c.name} · 방어하지 않음`,trace(a,'hit','hit'), c.id);hurt(r,a,die);return {};}
  concentration(r,c,die);
  if(a.telekinesis&&['parry','block'].includes(p.defense)&&!health(r,c,(sheetSkill(c,/^Per$/)??profile.dx)-2,'보이지 않는 공격 청각',die).success){p={...p,defense:'dodge'};log(r,c.name+' · 청각 판정 실패 · 회피로 방어', undefined, c.id);}
  if(a.disarm&&p.defense==='block')fail('무장해제는 회피 또는 공격받은 무기로 받아내세요.');
  if(a.weapon.kind==='firearm'&&p.defense!=='dodge')fail('총격은 회피로 방어하세요.');
  const karate=p.defense==='parry'&&p.parryMode==='karate',brawling=p.defense==='parry'&&(p.parryMode==='brawling'||profile.weapon.unarmed);
  if(brawling&&(freeHands(r,c)<1||!Number.isInteger(brawlingParry(c))))fail('맨손 받아내기 수치와 자유로운 손이 필요합니다.');
  if(a.disarm&&(karate||brawling))fail('공격받는 무기로 받아내세요.');
  if(karate&&(freeHands(r,c)<1||!sheetSkill(c,/^(Karate|타격술)(?:\s|$)/i)))fail('타격술과 자유로운 손이 필요합니다.');
  if(p.defense==='parry'&&!karate&&!brawling&&(weaponDisabled(c)||profile.parry===null||f.dropped||f.maneuver==='moveAttack'&&!f.rapidRecovery||a.weapon.kind==='missile'&&!a.weapon.thrown))fail('이 공격에는 받아내기를 사용할 수 없습니다.');
  if(p.defense==='block'&&(isCrippled(c,'leftArm')&&isCrippled(c,'rightArm')||profile.block===null||f.blocked||f.dropped))fail('막기를 사용할 수 없습니다.');
  if((karate||brawling)&&(f.maneuver==='moveAttack'||a.weapon.kind==='missile'&&!a.weapon.thrown))fail('현재 맨손 받아내기를 할 수 없습니다.');
  if(effort)spendEffort(c,f,effort,t=>log(r,t,undefined,c.id),true);
  let target=(karate?Math.floor(sheetSkill(c,/^(Karate|타격술)(?:\s|$)/i)/2)+3+(c.fields?.some(x=>/Combat Reflexes|전투반사신경/.test(x.name))?1:0)-(profile.encumbrance||0):brawling?(c.combatUnarmed?.parry??(profile.weapon.unarmed?profile.parry:brawlingParry(c))):profile[p.defense])+conditionModifier(c,'defense')+conditionModifier(c,'vision')+zoneVision(r,c.id,a.actorId);if(p.defense==='dodge')target=reduced(target,c);
  if(brawling&&a.weapon.kind==='melee'&&!a.weapon.unarmed&&a.weapon.damageBasis!=='thrust')target-=3;
  if(p.defense==='parry'){if(karate||brawling){f.unarmedParries??={};const hands=availableHands(r,c).filter(h=>!f.maneuver?.startsWith('committed')||h!==f.attackingHand);if(!hands.length)fail('적극적 공격에 사용하지 않은 자유로운 손이 필요합니다.');const hand=hands.sort((a,z)=>(f.unarmedParries[a]||0)-(f.unarmedParries[z]||0))[0];target-=4*(f.unarmedParries[hand]||0);f.unarmedParries[hand]=(f.unarmedParries[hand]||0)+1;}else{target-=parryStep(c)*(f.parries||0);f.parries=(f.parries||0)+1;}}if(p.defense==='block')f.blocked=true;
  target+=tacticalDefense(f,p.defense,{unarmed:karate||brawling})-(f.stunned&&!controlFlags(c).stunned?4:0);
  if(p.defense==='parry'&&a.weapon.thrown)target-=2;
  target-=(a.counterattack?(p.defense==='parry'?2:1):0);
  target+=(a.telegraphic?2:0)+(a.targetedDefenseBonus||0)-(a.telekinesis?4:0)-(a.deceptiveLevels||0)-(a.feintPenalty||0);
  for(const key of ['retreat','acrobatic'])if(p[key]!==undefined&&typeof p[key]!=='boolean')fail('방어 선택을 확인하세요.');
  if(p.retreat||f.retreatFrom===a.actorId&&a.weapon.kind==='melee'){requireLocalAccess(r,c.id);requireMobile(r,c);
   if(a.weapon.kind!=='melee'||f.stunned||f.prone||(f.maneuver==='moveAttack'||f.maneuver?.startsWith('committed'))||legDisabled(c))fail('현재 공격에는 후퇴 방어를 사용할 수 없습니다.');
   if(f.retreatFrom&&f.retreatFrom!==a.actorId)fail('이번 차례에 다른 상대에게 이미 후퇴했습니다.');
   if(!f.retreatFrom){
    const step=Math.max(1,Math.ceil(reduced(profile.move,c)/10));
    if(b.theater){const positions=b.theater.positions;positions[c.id]+=(Math.sign(positions[c.id]-positions[a.actorId])||1)*step;}
    else{
     const t=token(r,c.id),enemy=token(r,a.actorId);num(p.x,0,1);num(p.y,0,1);
     const metric=(x,y)=>Math.hypot((x.x-y.x)*t.map.columns,(x.y-y.y)*t.map.rows)*t.map.unit;
     const end={x:p.x,y:p.y},moved=metric(t.token,end);
     if(moved<.01||moved>step+.01||metric(end,enemy.token)<=metric(t.token,enemy.token)||!clearMovement(t.map,t.token,end))fail('한 걸음 범위의 막히지 않은 후퇴 위치가 필요합니다.');
     t.token.x=end.x;t.token.y=end.y;
    }
    f.retreatFrom=a.actorId;
   }
   target+=p.defense==='dodge'||karate?3:1;log(r,`${c.name} · 후퇴 방어 ${p.defense==='dodge'||karate?'+3':'+1'}`, undefined, c.id);
  }
  if(p.acrobatic){
   const skill=c.fields?.find(x=>/^(Acrobatics|곡예)(?:\s|$|\()/i.test(x.name));const level=Number.parseFloat(skill?.value);
   if(p.defense!=='dodge'||f.acrobaticUsed||f.stunned||f.prone||legDisabled(c)||!Number.isInteger(level)||level<3||/미습득|미구매|기본값|default|(?:^|[\s[(])0\s*CP/i.test(skill?.value||''))fail('습득한 곡예 기능으로 차례당 한 번만 곡예 회피를 할 수 있습니다.');
   const acro=check(level-(f.activeShock||0)+conditionModifier(c,'DX'),die);f.acrobaticUsed=true;target+=acro.success?2:-2;
   log(r,`${c.name} · 곡예 ${acro.total}/${acro.target} · 회피 ${acro.success?'+2':'−2'}`, undefined, c.id);
  }
  if(effort==='feverishDefense')target+=2;
  if(p.counterattack===true)counterattackLevel(c,selectAttackWeapon(c,p.attackModeId||''));
  const roll=roll3(die),success=defenseSuccess(roll.total,target);
  if(success){recordCounterattackDefense(r,c.id,a.actorId);if(p.counterattack===true&&!f.stunned){cancelPlanForManual(f);planCommand(r,u,{characterId:c.id,kind:'counterattack',targetId:a.actorId,attackModeId:p.attackModeId||'',hitLocation:'torso'});}}
  if(effort&&gurpsSuccessRoll(roll.total,target).outcome==='criticalFailure'){if(effort==='rapidRecovery')delete f.rapidRecovery;effortInjury(r,c,p.defense==='dodge'?'rightLeg':'rightArm',die);}f.aim=null;
  if(p.defense==='dodge'&&!success&&(roll.total===18||roll.total===17&&target<=15||roll.total>=target+10)){f.prone=true;log(r,`${c.name} · 회피 대실패로 넘어짐`, undefined, c.id);}

  log(r,`${c.name} · ${{dodge:'회피',parry:'받아내기',block:'막기'}[p.defense]} ${roll.dice.join('+')}=${roll.total} / ${target} · ${success?'성공':'실패'}`,trace(a,'hit',success?'defended':'hit'), c.id);
  if(a.weapon.kind==='firearm'){
   const avoided=dodgedHits(roll.total,target,a.hits??1);a.hits=Math.max(0,(a.hits??1)-avoided);
   log(r,`${c.name} · 회피 ${avoided}발 / 남은 명중 ${a.hits}발`,trace(a,'hit',a.hits?'hit':'defended'), c.id);
   if(a.hits)hurt(r,a,die);else completeAttack(r,die);
  }else if(success){completeAttack(r,die);}else if(['parry','block'].includes(p.defense)&&(roll.total===18||roll.total===17&&target<=15||roll.total>=target+10)){b.pending={...a,kind:'critical',defenseFailure:true,reviewRoll:roll,tableRoll:roll3(die)};log(r,'방어 대실패 · 특수 효과 검토 후 피해를 적용합니다.',trace(a,'hit','review'),c.id);}else hurt(r,a,die);return {};
 }
 if(b.pending)fail('현재 공격의 방어·검토가 끝나야 합니다.',409);
 const id=b.order[b.index];if(p.characterId!==id)fail('현재 차례가 아닙니다.',409);
 const c=controlled(r,u,id),f=b.fighters[id],profile=c.combatProfile;
 if(interruptWait(r,u,p,die,effortAuthorized,fromPlan))return {interrupted:true};
 if(!fromPlan)cancelPlanForManual(f);
 const effort=validateEffort(p,c,f);if(effort&&!ai(c)&&!effortAuthorized)fail('플레이어 추가 노력은 선언과 FP 확인을 거쳐 실행하세요.');
 if(!['attack','aim','defend','wait','move','stand','ready','reload','stowMagazine','recoverMagazine','fillMagazine','emptyMagazine','feint','grapple','breakFree','release','takedown','recover','suppress','grip','posture','evaluate','disarm','switchWeapon','tkStrike','tkGrapple','tkHold','tkLift','tkMove','tkDrop'].includes(p.action))fail('지원하지 않는 전투 행동입니다.');
 requireControlAction(c,p.action);
 if(f.stunned&&p.action!=='wait')fail('기절 상태에서는 아무것도 하지 않고 회복을 시도하세요.');
 if(p.action!=='wait'&&!conscious(r,c,f,die)){next(r);return {};}
 if(p.telegraphic!==undefined&&typeof p.telegraphic!=='boolean')fail('예고 공격 선택을 확인하세요.');
 if(f.tkConcentrating&&!['tkStrike','tkGrapple','tkHold','tkLift','tkMove','tkDrop','release'].includes(p.action))endTelekinesis(r,id);
 validateHeldAction(r,c,p.action,p.action==='attack'?selectAttackWeapon(c,p.attackModeId||''):null);
 if(p.action==='release'){endTelekinesis(r,id);b.grapples=(b.grapples||[]).filter(g=>g.actorId!==id);log(r,c.name+' · 잡기 해제', undefined, c.id);return {};}
 if(!['reload','stowMagazine'].includes(p.action)&&c.heldMagazine){dropMagazine(r,c,c.heldMagazine);delete c.heldMagazine;log(r,c.name+' · 보관을 중단하고 헌 탄창을 현장에 떨어뜨림', undefined, c.id);}
 if(!['reload','fillMagazine','emptyMagazine','stowMagazine'].includes(p.action))delete f.reload;
 delete f.equipmentRecovery;
 if(p.action!=='recover')delete f.recovering;
 const movementStart=spatialPosition(r,id);
 if(p.action==='posture'){requireLocalAccess(r,c.id);requireMobile(r,c);const from=postureOf(f),to=p.posture;if(['standing','crouching'].includes(from)&&['standing','crouching'].includes(to)){setPosture(f,to);log(r,c.name+' · '+postures[to].label, undefined, c.id);return {};}if([from,to].every(x=>['standing','kneeling'].includes(x))&&!f.stepUsed&&!legDisabled(c)){setPosture(f,to);f.stepUsed=true;f.movedYards=Math.max(1,Math.ceil(reduced(profile.move,c)/10));log(r,c.name+' · 한 걸음 대신 자세 변경', undefined, c.id);return {};}}
 if(!['evaluate','attack','feint'].includes(p.action))delete f.evaluate;
 if(p.action==='attack'&&p.drawWeapon&&f.dropped!==false&&!selectAttackWeapon(c,p.attackModeId||'').unarmed){
  if(f.lostWeapon||f.disarmed||weaponDisabled(c))fail('잃거나 떨어뜨린 무기는 먼저 회수하세요.');
  const skill=fastDrawTarget(c,-(f.activeShock||0));
  if(skill===null){combatCommand(r,u,'combatAct',{characterId:id,action:'ready'},die);return {};}
  const draw=check(skill,die);log(r,c.name+' · 빠른 뽑기 '+draw.total+' / '+skill+' · '+(draw.success?'성공':'실패'), undefined, c.id);
  f.dropped=false;
  if(!draw.success){if(draw.outcome==='criticalFailure'){f.dropped=true;f.disarmed=true;f.lostWeapon=spatialPosition(r,id);}f.maneuver='ready';next(r);return {};}
 }
 f.maneuver=p.action;
 if(p.action!=='aim'&&p.action!=='attack'&&p.action!=='suppress')f.aim=null;
 if(p.action==='attack'){
  const personal=selectAttackWeapon(c,p.attackModeId||'');
  if(personal.unarmed){if(personal.limb==='hand'&&freeHands(r,c)<1||personal.limb==='foot'&&legDisabled(c))fail('공격할 자유로운 손·발이 필요합니다.');}else{if(weaponDisabled(c))fail('무기를 사용하는 부위가 손상되었습니다.');if(f.dropped)fail('무기를 먼저 준비하세요.');}
if(personal.limb==='foot'&&['kneeling','prone','supine'].includes(postureOf(f)))fail('누운 자세의 발차기는 별도 기술 검토가 필요합니다.');
  const target=get(r,p.targetId),other=b.fighters[target.id];if(!other||other.team===f.team||!alive(other))fail('공격 가능한 상대를 선택하세요.');
  if(concealedFrom(target,c.id)&&(!p.unseenTarget||!p.perceptionReason?.trim()||!Number.isInteger(p.modifier)||p.modifier>=0))fail('직접 확인되지 않은 상대입니다. 수색하거나 실제 위치 근거와 비시각 공격 보정을 재정하세요.');
  let w=gripWeapon(selectAttackWeapon(c,p.attackModeId||''),f);if(w.unarmed)w.attackLimb=w.limb==='foot'?'rightFoot':availableHands(r,c)[0]+'Hand';const maneuver=p.maneuver||'attack',hitLocation=p.hitLocation||'torso';
  if(w.kind==='melee')requireLocalAccess(r,id,target.id);
  if(!Object.hasOwn(attackManeuvers,maneuver)||!Object.hasOwn(hitLocations,hitLocation))fail('공격 방법과 부위를 확인하세요.');
  if(maneuver==='moveAttack'&&w.kind!=='melee'&&w.bulk===undefined)fail('이동 사격에는 확인된 Bulk가 필요합니다.');
  if(p.telegraphic&&((p.deceptiveLevels||0)||w.kind!=='melee'))fail('예고 공격은 기만 공격과 병용할 수 없는 근접 공격입니다.');
  if(hitLocation==='jaw'&&p.attackSide!=='front')fail('턱 공격은 정면 위치 확인이 필요합니다.');
  w=effortWeapon(w,p);const tactical=maneuverAttack(w,f,p);w=tactical.weapon;
  const fire=firingPlan(w,p.shots??1);
  if(target.summonOwnerId&&hitLocation!=='torso')fail('유영어에는 인간 부위를 지정할 수 없습니다.');damageLocation(target,hitLocation,w.type);
  const counter=p.counterattack===true?counterattackLevel(c,personal):null;
  if(counter&&!counterattackOpportunity(r,id,target.id))fail('Counterattack은 직전 방어 성공 상대에게 바로 다음 자기 턴에만 사용할 수 있습니다.');
  const options=attackOptions(c,w,p),technique=targetedVitals(c,w,hitLocation);if(effort==='flurry')options.rapidPenalty=Math.floor(options.rapidPenalty/2);
  if(isCrippled(c,'leftEye')&&isCrippled(c,'rightEye')&&(hitLocation!=='torso'||w.kind!=='melee'))fail('시각 상실 상태입니다. 위치를 파악한 근접 공격 외에는 GM 재정이 필요합니다.');
  const beforeDistance=distance(r,id,target.id);
  if(f.prone&&w.kind==='melee'&&w.reach===0&&!other.prone&&!['leftLeg','rightLeg','leftFoot','rightFoot'].includes(hitLocation))fail('누운 자세의 접촉 공격은 서 있는 상대의 상체에 닿지 않습니다.');
  if(maneuver==='moveAttack'&&w.kind!=='melee'){
   requireLocalAccess(r,id);requireMobile(r,c);if(b.theater){const yards=num(p.moveYards??0,0,reduced(profile.move,c));if(yards+(f.movedYards||0)>reduced(profile.move,c))fail('이동력 범위를 벗어났습니다.');if(legDisabled(c)&&yards)fail('다리·발 부상으로 접근할 수 없습니다.');b.theater.positions[id]+=Math.sign(b.theater.positions[target.id]-b.theater.positions[id])*Math.min(yards,beforeDistance);f.movedYards=(f.movedYards||0)+Math.min(yards,beforeDistance);f.stepUsed=true;}
   else combatMove(r,u,id,p.x,p.y,true);f.aim=null;
  }else if(['stepAttack','moveAttack'].includes(maneuver)||tactical.steps||effort==='giantStep')approachForAttack(r,c,target,w,maneuver==='moveAttack'?maneuver:'stepAttack',effort==='giantStep'?2:tactical.steps||1);
  const d=distance(r,id,target.id);if(d>w.reach+.01)fail('무기의 사거리 밖입니다. 접근 공격을 선택하세요.');
  f.maneuver=maneuver;f.unbalancedUsed=!!w.unbalanced;
  if(offMapLine(r,id,target.id)===false||offMapLine(r,id,target.id)===null&&!b.theater&&!clearLine(token(r,id).map,token(r,id).token,token(r,target.id).token))fail('벽이나 닫힌 문에 가려 공격할 수 없습니다.');
  const modifier=int(p.modifier??0,-20,20);if(modifier&&r.owner!==u.id)fail('상황 보정은 GM이 설정한 수치를 사용하세요.');
  const eyePenalty=visionAttackModifier(c,w.kind,f.aim?.targetId===target.id);
  let effective=w.skill+eyePenalty+zoneVision(r,id,target.id)+conditionModifier(c,'attack')+conditionModifier(c,'vision')-(f.activeShock||0)+grapplePenalty(r,c)+modifier+(f.attackModifier||0)+(w.kind==='melee'||!['torso','groin','leftLeg','rightLeg'].includes(hitLocation)?0:postures[postureOf(other)].ranged)+tactical.skill+(p.telegraphic?4:0)+(w.kind==='melee'?postures[postureOf(f)].attack:0)+(!p.telegraphic&&w.kind==='melee'&&f.evaluate?.targetId===target.id?f.evaluate.turns:0);
  if(w.kind!=='melee'){if(!w.thrown&&w.ammo<=0)fail('탄약이 없습니다. 전투 밖에서 장비를 확인하세요.');effective+=rangePenalty(d)+(f.aim?.targetId===target.id?w.acc+Math.min(2,f.aim.turns-1):0);}
  const projectile=projectilePlan(r,c,w,fire.shots,d);w=projectile.weapon;fire.bonus=w.kind==='firearm'?rapidFireBonus(projectile.projectiles):0;
  const locationPenalty=technique?technique.level-w.skill:hitLocations[hitLocation].penalty;
  effective+=locationPenalty-options.rapidPenalty-options.deceptive*2+fire.bonus+(counter?.modifier||0);
  if(maneuver==='moveAttack'&&effort!=='heroicCharge')effective=w.kind==='melee'?Math.min(9,effective-4):effective+Math.min(-2,w.bulk);
  if(options.deceptive&&effective<10)fail('기만 공격의 최종 유효 기능은 10 이상이어야 합니다.');
  if(effective<3)fail('유효 기능이 3 미만이라 공격할 수 없습니다.');
  const hitDetails=[['Counterattack 보정',counter?.modifier||0],['기동 보정',tactical.skill],['자세 보정',w.kind==='melee'?postures[postureOf(f)].attack:0],['평가',f.evaluate?.targetId===target.id?f.evaluate.turns:0],['그립',f.grip||'normal'],['공격 방식',w.name],['행동',attackManeuvers[maneuver]],['접근 거리',Math.round((beforeDistance-d)*100)/100+' yd'],['부위 보정',locationPenalty],['이동 공격 보정',maneuver==='moveAttack'&&effort!=='heroicCharge'?(w.kind==='melee'?'−4 · 최종 기능 최대 9':Math.min(-2,w.bulk)):'없음'],['발사 수',w.kind==='firearm'?fire.shots:'—'],['연사 명중 보너스',fire.bonus],['반동',w.recoil??'—'],['무기 기능',w.skill],['급소 찌르기 기술',technique?.level??'없음'],['연속 공격 보정',-options.rapidPenalty],['기만 공격 보정',-options.deceptive*2],['눈 부상 보정',eyePenalty],['충격 보정',-(f.activeShock||0)],['상황 보정',modifier+(f.attackModifier||0)],['대상 자세 보정',w.kind==='melee'?0:postures[postureOf(other)].ranged],['거리',Math.round(d*100)/100+' yd'],['거리 보정',w.kind==='melee'?0:rangePenalty(d)],['조준 보정',w.kind!=='melee'&&f.aim?.targetId===target.id?w.acc+Math.min(2,f.aim.turns-1):0]];
  const unaware=b.unawareOfAttack?.actorId===id&&b.unawareOfAttack?.targetId===target.id;delete b.unawareOfAttack;
  const prepared={counterattack:!!counter,extraEffort:effort,effortPerStrike:['flurry','mightyBlow'].includes(effort),telegraphic:p.telegraphic===true,actorId:id,targetId:target.id,target:effective,weapon:structuredClone(w),distance:d,hitLocation,maneuver,techniqueId:technique?.id||'',deceptiveLevels:options.deceptive+(f.grip==='reverse'&&w.kind==='melee'&&!w.unarmed&&(options.deceptive||f.feint?.ready&&f.feint.targetId===target.id)?1:0),unaware,hitDetails,shots:projectile.projectiles,shells:fire.shots,feintPenalty:!p.telegraphic&&f.feint?.ready&&f.feint.targetId===target.id?f.feint.penalty:0};
  delete f.evaluate;
  if(p.rapidStrike||tactical.double)b.attackSequence={remaining:1,attack:{...structuredClone(prepared),unaware:false}};
  prepared.resource={shells:fire.shots};
  if(w.thrown){const owned=ownedKnife(r,c);if(!owned)fail('소지품에 실제 단검이 필요합니다.');prepared.weapon.itemId=owned.id;}
  if(effort&&!prepared.effortPerStrike)spendEffort(c,f,effort,t=>log(r,t,undefined,c.id));
  if(!interceptSuppression(r,id,movementStart,spatialPosition(r,id),{kind:'attack',prepared},die))commitStrike(r,prepared,die);
 }else if(['tkLift','tkMove','tkDrop'].includes(p.action)){
  const message=tkObjectAction(r,c,p);f.tkConcentrating=p.action!=='tkDrop';f.maneuver='concentrate';log(r,c.name+' · '+message, undefined, c.id);next(r);
 }else if(['tkStrike','tkGrapple','tkHold'].includes(p.action)){
  if(profile.telekinesis!==5)fail('검토된 TK5 능력이 필요합니다.');
  const target=get(r,p.targetId),tf=b.fighters[target.id];if(!tf||tf.team===f.team||!alive(tf)||distance(r,id,target.id)>10||!(offMapLine(r,id,target.id)??visibleLine(r,spatialPosition(r,id),spatialPosition(r,target.id))))fail('10야드 안의 보이는 염동 대상을 선택하세요.');
  if(p.action==='tkHold'){if(!grips(r,id).some(g=>g.telekinesis&&g.targetId===target.id))fail('유지할 염동 잡기가 없습니다.');f.tkConcentrating=true;f.maneuver='concentrate';log(r,c.name+' · 염동 잡기 유지', undefined, c.id);next(r);return {};}
  if(p.action==='tkGrapple'&&target.summonOwnerId)fail('비고체 대상을 붙잡을 수 없습니다.');
  endTelekinesis(r,id);f.tkConcentrating=true;f.maneuver='concentrate';
  const skill=profile.dx-(f.activeShock||0)+conditionModifier(c,'concentration'),location=p.action==='tkGrapple'?'torso':p.hitLocation||'torso';
  if(location==='jaw'&&p.attackSide!=='front')fail('턱 공격은 정면 위치 확인이 필요합니다.');
   damageLocation(target,location,'cr');if(skill+hitLocations[location].penalty<3)fail('염동 공격 유효 기능이 3 미만입니다.');
  const w={name:p.action==='tkGrapple'?'염동 잡기':'염동 타격',kind:'melee',skill,damage:'1d6-5',type:'cr',reach:10,supernatural:true};
  strike(r,{actorId:id,targetId:target.id,target:skill+hitLocations[location].penalty,weapon:w,distance:distance(r,id,target.id),hitLocation:location,telekinesis:true,grapple:p.action==='tkGrapple',hands:0,deceptiveLevels:0,hitDetails:[['염동 ST',5],['집중',1],['보이지 않는 공격 방어',-4]]},die);
 }else if(p.action==='grip'){
  const w=selectAttackWeapon(c);if(!w.reverseGrip||f.dropped||weaponDisabled(c)||!['normal','reverse'].includes(p.grip))fail('준비된 역수 가능 무기와 그립을 선택하세요.');
  if(f.grip===p.grip||!f.grip&&p.grip==='normal')fail('이미 그 그립입니다.');
  f.grip=p.grip;log(r,c.name+' · 준비 행동으로 '+(p.grip==='reverse'?'역수':'정수')+' 전환', undefined, c.id);next(r);
 }else if(p.action==='posture'){
  const before=postureOf(f),after=p.posture;if(!Object.hasOwn(postures,after))fail('자세를 선택하세요.');
  if(['prone','supine'].includes(before)&&after==='standing')fail('누운 자세에서 먼저 앉거나 무릎을 꿇으세요.');
  if(['standing','crouching'].includes(after)&&legDisabled(c))fail('다리·발 부상으로 지지 없이 설 수 없습니다.');
  requireMobile(r,c);setPosture(f,after);log(r,c.name+' · '+postures[after].label, undefined, c.id);next(r);
 }else if(p.action==='evaluate'){requireLocalAccess(r,id,p.targetId);
  const target=get(r,p.targetId),w=selectAttackWeapon(c);if(!b.fighters[target.id]||b.fighters[target.id].team===f.team||!alive(b.fighters[target.id])||w.kind!=='melee'||distance(r,id,target.id)>reduced(profile.move,c)+w.reach||!(offMapLine(r,id,target.id)??visibleLine(r,spatialPosition(r,id),spatialPosition(r,target.id))))fail('보이고 접근 공격으로 닿을 상대를 평가하세요.');
  f.evaluate={targetId:target.id,turns:Math.min(3,f.evaluate?.targetId===target.id?f.evaluate.turns+1:1)};log(r,c.name+' · 상대 평가 +'+f.evaluate.turns, undefined, c.id);next(r);
 }else if(p.action==='disarm'){requireLocalAccess(r,id,p.targetId);
  const target=get(r,p.targetId),tf=b.fighters[target.id],w=gripWeapon(selectAttackWeapon(c,p.attackModeId||''),f),tw=target.combatProfile.weapon;
  if(!tf||tf.team===f.team||!alive(tf)||f.dropped||tf.dropped||w.unarmed||w.kind!=='melee'||tw.unarmed||distance(r,id,target.id)>w.reach)fail('사거리 안에 있는 상대의 준비된 무기를 겨냥하세요.');
  if(!(offMapLine(r,id,target.id)??visibleLine(r,spatialPosition(r,id),spatialPosition(r,target.id))))fail('공격 경로가 막혔습니다.');
  const size=tw.kind==='firearm'?(Math.abs(tw.bulk||0)<=2?5:3):tw.reach===0?5:tw.reach===1?4:3;
  const skill=w.skill-size-2-(f.activeShock||0)+postures[postureOf(f)].attack+grapplePenalty(r,c);if(skill<3)fail('무장해제 유효 기능이 3 미만입니다.');
  strike(r,{actorId:id,targetId:target.id,target:skill,weapon:w,distance:distance(r,id,target.id),hitLocation:'torso',disarm:true,deceptiveLevels:0,hitDetails:[['무기 크기',-size],['무장해제',-2]]},die);
 }else if(p.action==='switchWeapon'){
  const weapons=c.combatLoadout||[],index=weapons.findIndex(w=>w.weapon.id===p.weaponId);if(index<0||f.dropped&&!f.switching||freeHands(r,c)<1)fail('소지한 예비 무기와 자유로운 손을 확인하세요.');
  if(f.switching!==p.weaponId){f.switching=p.weaponId;f.dropped=true;log(r,c.name+' · 기존 무기를 수납', undefined, c.id);next(r);return {};}
  delete f.switching;f.dropped=false;const selected=weapons[index];weapons[index]={weapon:profile.weapon,parry:profile.parry,weaponHand:profile.weaponHand};profile.weapon={...validateWeapon(selected.weapon),...(selected.weapon.insertedMagazine?{insertedMagazine:structuredClone(selected.weapon.insertedMagazine)}:{})};profile.parry=selected.parry;profile.weaponHand=selected.weaponHand||'right';delete f.grip;
  log(r,c.name+' · 준비 행동으로 '+profile.weapon.name+' 전환', undefined, c.id);next(r);
 }else if(p.action==='suppress'){
  requireMobile(r,c);const w=selectAttackWeapon(c,p.attackModeId||'');
  if(w.kind!=='firearm'||w.rof<5||w.pellets||f.dropped||weaponDisabled(c)||f.movedYards)fail('준비된 RoF 5 이상의 일반 총기로 제자리 제압 사격을 하세요.');
  const fire=firingPlan(w,p.shots??w.rof);if(fire.shots<5)fail('2야드 구역당 최소 5발이 필요합니다.');
  const origin=spatialPosition(r,id),center={...origin,x:num(p.zoneX,-10000,10000),y:num(p.zoneY,-10000,10000)};
  if(!origin||b.theater&&center.y!==0||yards(origin,center)<1||yards(origin,center)>w.reach||!visibleLine(r,origin,center))fail('사거리 안의 막히지 않은 2야드 제압 구역을 지정하세요.');
  const projectile=projectilePlan(r,c,w,fire.shots,yards(origin,center)),bonus=rapidFireBonus(fire.shots);
  const aimed=f.aim&&spatialPosition(r,f.aim.targetId),aimBonus=aimed&&yards(aimed,center)<=1?w.acc+Math.min(2,f.aim.turns-1):0;profile.weapon.ammo-=fire.shots;if(r.economy?.enabled)recordAmmoUse(r,u,c,fire.shots);
  const zone={id:crypto.randomUUID(),actorId:id,origin,center,weapon:projectile.weapon,shots:fire.shots,remaining:fire.shots,checked:[],skill:w.skill+aimBonus-(f.activeShock||0)+conditionModifier(c,'attack')+(f.attackModifier||0),cap:6+bonus,bonus};
  (b.suppression||=[]).push(zone);f.aim=null;f.attackModifier=0;
  log(r,c.name+' · 2야드 구역 제압 사격 '+fire.shots+'발 · 다음 자기 차례까지 방어 불가', undefined, c.id);
  const targets=Object.keys(b.fighters).filter(x=>x!==id&&alive(b.fighters[x]));
  const reactions=targets.flatMap(targetId=>suppressionThreats(r,targetId).filter(z=>z.id===zone.id).map(z=>({zoneId:z.id,targetId})));
  beginSuppression(r,reactions,{kind:'next'},die);
 }else if(p.action==='feint'){

  const target=get(r,p.targetId),w=selectAttackWeapon(c,p.attackModeId||'');
  if(!b.fighters[target.id]||b.fighters[target.id].team===f.team||!alive(b.fighters[target.id])||w.kind!=='melee'||(!w.unarmed&&f.dropped)||distance(r,id,target.id)>w.reach+.01||p.targetObserves!==true)fail('준비된 근접 무기와 사거리, 상대의 관찰 가능 여부가 필요합니다.');
  if(offMapLine(r,id,target.id)===false||offMapLine(r,id,target.id)===null&&!b.theater&&!clearLine(token(r,id).map,token(r,id).token,token(r,target.id).token))fail('상대가 페인트를 볼 수 없습니다.');
  const attack=check(w.skill-(f.activeShock||0)+(f.evaluate?.targetId===target.id?f.evaluate.turns:0),die),defense=check(defenseFeintSkill(r,target)-(b.fighters[target.id].activeShock||0),die);
  const penalty=attack.success?Math.max(0,attack.margin-(defense.success?defense.margin:0)):0;
  delete f.evaluate;f.feint={targetId:target.id,penalty,ready:false};log(r,`${c.name} · 페인트 ${attack.total}/${attack.target} 대 ${defense.total}/${defense.target} · 다음 자기 공격 방어 −${penalty}`, undefined, c.id);next(r);
 }else if(p.action==='grapple'){
  const target=get(r,p.targetId),hands=int(p.hands??1,1,2);if(target.summonOwnerId)fail('비고체 물고기를 인간 잡기로 붙들 수 없습니다.');if(p.maneuver==='stepAttack')approachForAttack(r,c,target,{kind:'melee',reach:0},'stepAttack');
  if(!b.fighters[target.id]||b.fighters[target.id].team===f.team||!alive(b.fighters[target.id])||distance(r,id,target.id)>.01||freeHands(r,c)<hands||grips(r,id).length||grips(r,id,true).length)fail('접촉 거리와 자유로운 손이 필요합니다. 기존 잡기는 먼저 처리하세요.');
  strength(c);strength(target);if(f.prone!==!!b.fighters[target.id].prone&&b.fighters[target.id].prone)fail('누운 상대는 같은 자세로 접근해야 합니다.');
  const targetSkill=grappleSkill(c)+grapplePenalty(r,c)-(f.activeShock||0);
  strike(r,{actorId:id,targetId:target.id,target:targetSkill,weapon:{name:'몸통 잡기',kind:'melee',skill:targetSkill,damage:'1d6',type:'cr',reach:0,unarmed:true,limb:'hand'},distance:0,hitLocation:'torso',grapple:true,hands,hitDetails:[['잡는 손',hands]],deceptiveLevels:0},die);
 }else if(p.action==='breakFree'){
  const held=grips(r,id,true).find(g=>!p.targetId||g.actorId===p.targetId);if(!held)fail('빠져나올 잡기를 선택하세요.');
  const enemy=get(r,held.actorId),ef=b.fighters[enemy.id],attack=check(strength(c),die),defense=check((held.telekinesis?enemy.combatProfile.telekinesis:strength(enemy)+(held.hands===2?5:0))-(ef.stunned?4:0),die),success=attack.margin>defense.margin;
  if(success)b.grapples=b.grapples.filter(g=>g!==held);
  log(r,`${c.name} · 잡기 탈출 ${attack.total}/${attack.target} 대 ${defense.total}/${defense.target} · ${success?'성공':'실패'}`, undefined, c.id);next(r);
 }else if(p.action==='takedown'){
  const grip=grips(r,id).find(g=>g.targetId===p.targetId),target=get(r,p.targetId);if(!grip||b.fighters[target.id].prone)fail('잡고 있는 서 있는 상대만 넘어뜨릴 수 있습니다.');
  const attack=check(Math.max(strength(c),grappleSkill(c))-(f.prone?4:0),die),defense=check(Math.max(strength(target),grappleSkill(target)),die),margin=attack.margin-defense.margin;
  if(margin){const loser=margin>0?target.id:id;b.fighters[loser].prone=true;b.grapples=(b.grapples||[]).filter(g=>g.actorId!==loser);}
  log(r,`${c.name} · 넘어뜨리기 ${attack.total}/${attack.target} 대 ${defense.total}/${defense.target} · ${margin>0?'상대 넘어짐':margin<0?'본인 넘어짐':'변화 없음'}`, undefined, c.id);next(r);
 }else if(p.action==='recover'){
  const loose=r.looseWeapons?.find(x=>x.id===p.lootId&&!x.recovered&&x.combatId===b.id);if(!loose||!loose.located)fail('위치가 확인된 투척 무기를 선택하세요.');
  const d=b.theater?Math.abs(b.theater.positions[id]-loose.position):Math.hypot((token(r,id).token.x-loose.position.x)*token(r,id).map.columns,(token(r,id).token.y-loose.position.y)*token(r,id).map.rows)*token(r,id).map.unit;
  if(d>.1||freeHands(r,c)<1)fail('무기 위치에 접근하고 손을 비우세요.');
  if(!f.prone&&!f.recovering){f.recovering=loose.id;log(r,c.name+' · 무기 회수 준비 1/2', undefined, c.id);}
  else{if(f.recovering&&f.recovering!==loose.id)fail('회수하던 무기를 선택하세요.');c.assets.items[loose.itemId]=(c.assets.items[loose.itemId]||0)+1;loose.recovered=true;delete f.recovering;log(r,c.name+' · 투척 무기 1개 회수', undefined, c.id);}
  next(r);
 }else if(['fillMagazine','emptyMagazine'].includes(p.action)){
  if(['leftArm','rightArm','leftHand','rightHand'].some(l=>isCrippled(c,l)))fail('양손을 사용할 수 있어야 합니다.');
  const key=JSON.stringify([p.action,p.magazineId||'',p.itemId||'',p.ammoItemId||'']),prior=f.reload;
  // One round is transferred after two Ready maneuvers, preserving interruption.
  const probe=structuredClone(c);p.action==='fillMagazine'?fillMagazine(r,probe,{lootId:p.magazineId,itemId:p.itemId,quantity:1,ammoItemId:p.ammoItemId}):emptyMagazine(probe,p.magazineId);
  const progress=prior?.key===key?prior.progress+1:1;f.reload={key,progress};
  if(progress>=2){
   if(p.action==='fillMagazine')fillMagazine(r,c,{lootId:p.magazineId,itemId:p.itemId,quantity:1,ammoItemId:p.ammoItemId});
   else{const m=c.assets.magazines.find(m=>m.id===p.magazineId);m.rounds--;c.assets.items[m.ammoItemId]=(c.assets.items[m.ammoItemId]||0)+1;}
   delete f.reload;
  }
  log(r,c.name+' · 탄창 '+(p.action==='fillMagazine'?'삽탄':'비우기')+' '+progress+'/2 준비 행동 · 1발', undefined, c.id);next(r);
 }else if(p.action==='recoverMagazine'){
  const g=groundMagazine(r,c,p.magazineId,u.id===r.owner||effortAuthorized);
  if(['leftArm','rightArm','leftHand','rightHand'].some(l=>isCrippled(c,l)))fail('탄창 회수에는 사용할 수 있는 양손이 필요합니다.');
  if(['standing','crouching'].includes(postureOf(f))){setPosture(f,'kneeling');log(r,c.name+' · 탄창 회수를 위해 무릎 꿇기', undefined, c.id);next(r);return {};}
  recoverMagazine(r,c,g);log(r,c.name+' · 떨어진 탄창 회수 · '+g.magazine.rounds+'발', undefined, c.id);next(r);
 }else if(p.action==='stowMagazine'||p.action==='reload'&&c.heldMagazine){
  if(!c.heldMagazine)fail('보관할 손의 탄창이 없습니다.');
  if(['leftArm','rightArm','leftHand','rightHand'].some(l=>isCrippled(c,l)))fail('탄창 보관에는 사용할 수 있는 양손이 필요합니다.');
  if(p.reloadMode==='drop'){dropMagazine(r,c,c.heldMagazine);delete c.heldMagazine;delete f.reload;log(r,c.name+' · 손의 탄창을 현장에 떨어뜨림', undefined, c.id);return {};}
  (c.assets.magazines??=[]).push(c.heldMagazine);delete c.heldMagazine;delete f.reload;log(r,c.name+' · 헌 탄창 보관 완료', undefined, c.id);next(r);
 }else if(p.action==='reload'){
  const w=selectAttackWeapon(c),plan=reloadPlan(c,{magazineId:p.magazineId||f.reload?.magazineId,quantity:p.quantity??f.reload?.rounds??1,reloadMode:p.reloadMode||f.reload?.reloadMode||'retain'});
  if(w.kind!=='firearm'||f.dropped||['leftArm','rightArm','leftHand','rightHand'].some(l=>isCrippled(c,l)))fail('양손과 준비된 총기, 확인된 장전 시간이 필요합니다.');
  const key=JSON.stringify(plan),progress=f.reload?.key===key?f.reload.progress+1:1;
  f.reload={...plan,key,progress};
  log(r,`${c.name} · 탄창 교체 ${progress}/${plan.seconds} 준비 행동`, undefined, c.id);
  if(progress>=(plan.baseSeconds||plan.seconds)){
   const swapped=completeReload(c,plan,{holdRemoved:plan.kind==='magazine'});delete f.reload;
   if(swapped.removedMagazine){if(plan.reloadMode==='retain'){c.heldMagazine=swapped.removedMagazine;f.reload={...plan,phase:'stow',progress};}else dropMagazine(r,c,swapped.removedMagazine);}
   log(r,`${c.name} · 장전 완료 ${profile.weapon.ammo}발 · ${swapped.removedMagazine?(plan.reloadMode==='retain'?'헌 탄창은 손에 있음 · Ready 1회로 보관, 다른 행동 시 떨어뜨림':'헌 탄창을 현장에 떨어뜨림'):'개별 장전 완료'}`, undefined, c.id);
   if(r.economy?.enabled)recordEconomy(r,u,'combatReload',`${c.name} · 예비 탄창 교체 완료 · ${plan.rounds}발`,{characterId:c.id,magazineId:plan.magazineId,quantity:plan.rounds,loaded:profile.weapon.ammo});
  }
  next(r);
 }else if(p.action==='move'){
  requireMobile(r,c);if(legDisabled(c))fail('다리·발 부상으로 보행할 수 없습니다. 보조 이동은 GM 재정이 필요합니다.');
  requireLocalAccess(r,id,p.targetId);if(b.theater){const other=b.fighters[p.targetId];if(!other||other.team===f.team)fail('다가갈 상대를 선택하세요.');const positions=b.theater.positions,d=distance(r,id,p.targetId),step=Math.min(Math.max(0,postureMove(f,reduced(profile.move,c))-(f.movedYards||0)),p.moveYards>0?num(p.moveYards,0,d):Math.max(0,d-selectAttackWeapon(c,p.attackModeId||'').reach));positions[id]+=Math.sign(positions[p.targetId]-positions[id])*step;f.stepUsed=true;f.movedYards=(f.movedYards||0)+step;}else combatMove(r,u,id,p.x,p.y,true);log(r,`${c.name} · 이동`, undefined, c.id);if(!interceptSuppression(r,id,movementStart,spatialPosition(r,id),{kind:'next'},die))next(r);
 }else {
  if(p.action==='aim'){const target=b.fighters[p.targetId];if(profile.weapon.kind==='melee'||!target||target.team===f.team||!alive(target))fail('조준할 상대를 선택하세요.');f.aim={targetId:p.targetId,turns:f.aim?.targetId===p.targetId?f.aim.turns+1:1};}
  if(p.action==='stand'){if(legDisabled(c))fail('다리·발 부상으로 지지 없이 설 수 없습니다.');if(f.rising){setPosture(f,'standing');f.rising=false;}else if(f.prone)f.rising=true;}
  if(p.action==='ready'&&grips(r,id,true).length&&!health(r,c,profile.dx+grapplePenalty(r,c),'잡힌 상태의 준비',die).success){f.dropped=true;next(r);return {};}
  if(p.action==='ready'&&f.lostWeapon){
   const origin=spatialPosition(r,id);if(yards(origin,f.lostWeapon)>1.01||!visibleLine(r,origin,f.lostWeapon))fail('떨어진 무기에 닿는 위치까지 먼저 이동하세요.');
   if(['standing','crouching'].includes(postureOf(f))){setPosture(f,'kneeling');f.weaponRecovery=1;f.maneuver='posture';log(r,c.name+' · 떨어진 무기 회수를 위해 무릎 꿇기', undefined, c.id);next(r);return {};}
  }
  if(p.action==='ready'){delete f.switching;delete f.disarmed;delete f.weaponRecovery;delete f.lostWeapon;if(largeKnife(c)&&r.economy?.enabled&&!ownedKnife(r,c))fail('준비할 단검이 없습니다. 투척한 칼을 먼저 회수하세요.');if(weaponDisabled(c))fail('사용 가능한 손과 무기를 확인하세요.');f.dropped=false;}
  if(p.action==='defend'){if(!['dodge','parry','block',undefined,''].includes(p.defenseChoice))fail('전력방어 종류를 확인하세요.');f.defenseChoice=p.defenseChoice||'dodge';}
  if(p.action==='wait')recoverControls(r,c,die,successRoll,lifecycleLog);
  if(p.action==='wait'&&f.stunned){const h=health(r,c,profile.ht,'기절 회복',die);if(h.success)f.stunned=false;}
  log(r,`${c.name} · ${{aim:'조준',defend:'전력방어 · '+({dodge:'회피',parry:'받아내기',block:'막기'}[f.defenseChoice]||'회피')+' +2',wait:'아무것도 하지 않음',stand:f.prone?'몸 일으키기':'일어나기',ready:'무기 준비'}[p.action]}`, undefined, c.id);next(r);
 }
 return {};
}
// The server owns the continuation. A retry, defense or AI command cannot add attacks.
function completeAttack(r,die){
 const b=r.combat;b.pending=null;if(b.suppressionResolution){continueSuppression(r,die);return;}const sequence=b.attackSequence;
 if(sequence?.remaining){
  const a=sequence.attack,f=b.fighters[a.actorId],other=b.fighters[a.targetId];
  const ended=['party','enemy'].some(team=>b.order.filter(id=>b.fighters[id].team===team).every(id=>get(r,id).hp<=0));
  if(alive(f)&&!f.stunned&&!f.dropped&&alive(other)&&!ended){
   delete b.attackSequence;if(a.effortPerStrike)spendEffort(get(r,a.actorId),f,a.extraEffort,t=>log(r,t,undefined,a.actorId));strike(r,a,die);return;
  }
 }
 delete b.attackSequence;if(b.status==='active')next(r);
}
function strike(r,prepared,die){
 const b=r.combat,c=get(r,prepared.actorId),target=get(r,prepared.targetId),other=b.fighters[target.id];
 markStealthCue(r,c,'공격 동작·소음·발사 위치 노출 여부');
 const a={...prepared,attackId:crypto.randomUUID(),title:`${c.name} → ${target.name} · ${prepared.weapon.name}`,kind:'defense',roll:check(prepared.target,die)};
 if(a.extraEffort&&a.roll.outcome==='criticalFailure')effortInjury(r,c,a.extraEffort==='giantStep'||a.weapon.limb==='foot'?'rightLeg':'rightArm',die);
 if(a.weapon.thrown){(r.looseWeapons||=[]).push({id:crypto.randomUUID(),itemId:a.weapon.itemId,ownerId:c.id,combatId:b.id,mapId:r.mapId,placeId:r.worldLibrary?.placeId||'',targetId:target.id,position:b.theater?b.theater.positions[target.id]:{...token(r,target.id).token},recovered:false,located:a.roll.success});}
 if(a.telegraphic&&a.roll.outcome==='criticalSuccess'&&gurpsSuccessRoll(a.roll.total,a.target-4).outcome!=='criticalSuccess')a.roll.outcome='success';
 if(!a.roll.success&&a.roll.margin===-1&&hitLocations[a.hitLocation]?.fallback){a.hitLocation=hitLocations[a.hitLocation].fallback;a.roll.success=true;a.roll.outcome='success';a.roll.margin=0;log(r,'1 차이 실패 · '+hitLocations[a.hitLocation].label+' 명중',undefined,a.actorId);}
 if(a.techniqueId){
  const f=b.fighters[c.id];f.targetedUses??=[];
  let usage=f.targetedUses.find(x=>x.targetId===target.id&&x.techniqueId===a.techniqueId);
  if(!usage){usage={targetId:target.id,techniqueId:a.techniqueId,count:0};f.targetedUses.push(usage);}
  a.targetedDefenseBonus=usage.count>=2?1:0;usage.count++;
 }
 if(a.weapon.kind!=='melee'&&a.roll.outcome==='criticalFailure'&&a.roll.total<17)a.roll.outcome='failure';
 const roll=a.roll;if(a.weapon.kind==='firearm')a.hits=bulletHits(roll,a.shots||1,a.weapon.recoil);if(a.suppressionZoneId){const z=b.suppression.find(z=>z.id===a.suppressionZoneId);a.hits=Math.min(a.hits,z.remaining);z.remaining-=a.hits;}
 log(r,`${c.name} → ${target.name} · ${a.weapon.name} · 명중 ${roll.dice.join('+')}=${roll.total} / ${a.target} · ${roll.success?'명중 판정 성공':'실패'}`,{hit:[...a.hitDetails,...(a.weapon.kind==='firearm'?[['명중 탄환 수',a.hits]]:[]),['반복 기술 방어 보너스',a.targetedDefenseBonus||0],['기만 공격 방어 페널티',-a.deceptiveLevels]],...trace(a,'hit',!roll.success?'miss':roll.outcome==='criticalSuccess'?'review':'pendingDefense')}, c.id);
 if(roll.outcome==='criticalFailure'||roll.outcome==='criticalSuccess'){
  b.pending={...a,kind:'critical',miss:!roll.success,tableRoll:roll3(die)};
  log(r,'대성공·대실패표 효과는 GM 검토 후 확정합니다.',trace(a,'hit',roll.success?'review':'miss'));
 }else if(!roll.success){if(a.weapon.unarmed&&a.weapon.limb==='foot'&&!health(r,c,c.combatProfile.dx+(b.fighters[c.id].maneuver==='defensiveAttack'?2:0),'발차기 균형',die).success)b.fighters[c.id].prone=true;completeAttack(r,die);}
 else if(!alive(other)||noDefense(other)||controlFlags(target).noDefense||a.unaware){if(noDefense(other))log(r,target.name+' · 기동에 따른 방어 불가',trace(a,'hit','hit'), target.id);if(a.unaware)log(r,target.name+' · 공격을 인지하지 못해 능동방어 없음',trace(a,'hit','hit'), target.id);hurt(r,a,die);}
 else b.pending=a;
}
// Approach and attack are one maneuver; next() is called only after attack resolution.
function approachForAttack(r,c,target,w,maneuver,steps=1){
 requireLocalAccess(r,c.id,target.id);
 const b=r.combat,f=b.fighters[c.id],d=distance(r,c.id,target.id),needed=Math.max(0,d-w.reach);
 if(needed<=.01)return;if(postureOf(f)==='sitting')fail('앉은 자세에서는 접근할 수 없습니다.');
 if(w.kind!=='melee')fail('접근 공격은 근접 공격 방식을 선택하세요.');
 if(legDisabled(c))fail('다리·발 부상으로 접근할 수 없습니다.');
 requireControlAction(c,'move');requireMobile(r,c);const move=postureMove(f,reduced(c.combatProfile.move,c)),allowance=maneuver==='moveAttack'?move:Math.max(1,Math.ceil(move/10))*steps;
 // A previously dragged step shares the same movement budget, never another free Move.
 const used=f.movedYards??(f.stepUsed?Math.max(1,Math.ceil(move/10)):0);
 if(needed+used>allowance+.01)fail('이번 차례에 접근해서 공격할 수 있는 거리 밖입니다.');
 if(b.theater)b.theater.positions[c.id]+=Math.sign(b.theater.positions[target.id]-b.theater.positions[c.id])*needed;
 else{
  const a=token(r,c.id),z=token(r,target.id),ratio=needed/d,end={x:a.token.x+(z.token.x-a.token.x)*ratio,y:a.token.y+(z.token.y-a.token.y)*ratio};
  if(!clearMovement(a.map,a.token,end))fail('벽이나 닫힌 문을 통과할 수 없습니다.');
  a.token.x=end.x;a.token.y=end.y;
 }
 f.stepUsed=true;f.movedYards=used+needed;f.aim=null;
}

export function combatMove(r,u,id,x,y,full=false,die=()=>Math.floor(Math.random()*6)+1){
 const b=state(r),f=b.fighters[id];if(b.theater)fail('텍스트 전투에서는 이동 행동으로 거리를 변경하세요.');if(b.pending||b.order[b.index]!==id||!f||!alive(f)||f.stunned||f.prone)fail('현재 이동할 수 없습니다.',409);
 requireLocalAccess(r,id);
 const start=spatialPosition(r,id),c=controlled(r,u,id),t=token(r,id);if(!t.token)fail('토큰이 없습니다.');num(x,0,1);num(y,0,1);
 if(c.hp<=0&&!f.turnChecked)fail('의식 유지 판정이 필요합니다. 이동 행동을 선택하세요.');
 if(legDisabled(c))fail('다리·발 부상으로 보행할 수 없습니다.');
 requireMobile(r,c);const move=postureMove(f,reduced(c.combatProfile.move,c));
 if(!clearMovement(t.map,t.token,{x,y}))fail('벽이나 닫힌 문을 통과할 수 없습니다.');
 if(f.stepUsed)fail('이번 차례의 이동을 이미 사용했습니다.');
 const d=Math.hypot((x-t.token.x)*t.map.columns,(y-t.token.y)*t.map.rows)*t.map.unit;
 if(d>(full?move:Math.max(1,Math.ceil(move/10)))+.01)fail(full?'이동력 범위를 벗어났습니다.':'드래그는 한 걸음만 가능합니다. 긴 이동은 이동 행동을 사용하세요.');
 t.token.x=x;t.token.y=y;f.stepUsed=true;f.movedYards=(f.movedYards||0)+d;f.aim=null;
 if(!full)interceptSuppression(r,id,start,spatialPosition(r,id),{kind:'none'},die);
}

// Statistics never determine an NPC's intent. Only settle factual encounter end;
// the GM selects attacks, defense, restraint and retaliation for every NPC.
export function settlePreparedCombat(r,die){
 if(r.combat?.status!=='active')return;
 resumeWait(r,die);queueAwareness(r);
 victory(r);
}

function commitStrike(r,a,die){
 const c=get(r,a.actorId),f=r.combat.fighters[c.id],w=c.combatProfile.weapon;
 const unusable=a.weapon.unarmed?(a.weapon.limb==='foot'?legDisabled(c):freeHands(r,c)<1):f.dropped||weaponDisabled(c);
 if(!alive(f)||f.stunned||unusable){delete r.combat.attackSequence;log(r,c.name+' · 제압 사격으로 행동 중단', undefined, c.id);next(r);return;}
 if(a.effortPerStrike)spendEffort(c,f,a.extraEffort,t=>log(r,t,undefined,c.id));
 if(a.weapon.thrown){c.assets.items[a.weapon.itemId]--;f.dropped=true;}
 else if(a.weapon.kind!=='melee'){w.ammo-=a.resource.shells;a.weapon.ammo=w.ammo;if(r.economy?.enabled)recordAmmoUse(r,{id:c.owner},c,a.resource.shells);}
 f.aim=null;f.attackModifier=0;strike(r,a,die);
}
function interceptSuppression(r,id,from,to,resume,die){
 const reactions=suppressionThreats(r,id,from,to).map(z=>({zoneId:z.id,targetId:id}));
 if(!reactions.length)return false;beginSuppression(r,reactions,resume,die);return true;
}
function beginSuppression(r,reactions,resume,die){r.combat.suppressionResolution={reactions,resume};continueSuppression(r,die);}
function continueSuppression(r,die){
 const b=r.combat,work=b.suppressionResolution;
 while(work.reactions.length){
  const reaction=work.reactions.shift(),z=b.suppression.find(z=>z.id===reaction.zoneId),id=reaction.targetId;
  if(!z||z.remaining<=0||!alive(b.fighters[id])||!alive(b.fighters[z.actorId])||b.fighters[z.actorId].stunned)continue;
  z.checked.push(id);const d=yards(z.origin,spatialPosition(r,id)),effective=Math.min(z.cap,z.skill+rangePenalty(d)+z.bonus-(b.fighters[id].prone?2:0));
  if(effective<3)continue;
  strike(r,{actorId:z.actorId,targetId:id,target:effective,weapon:z.weapon,distance:d,hitLocation:randomLocation(die),shots:z.remaining,deceptiveLevels:0,suppressionZoneId:z.id,hitDetails:[['제압 사격 상한',z.cap],['남은 탄환',z.remaining]]},die);return;
 }
 const resume=work.resume;delete b.suppressionResolution;
 if(victory(r))return;
 if(resume.kind==='attack')commitStrike(r,resume.prepared,die);else if(resume.kind==='next')next(r);
}

function effortInjury(r,c,location,die){applyInjury(r,c,1,die,{location,type:'cr',emit:(t,d)=>log(r,c.name+' · 추가 노력 대실패 · '+t,{injury:d}, c.id)});}
