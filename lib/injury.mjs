import {armorAt} from './combat-armor.mjs';
import {gurpsSuccessRoll} from './gurps.mjs';
import {hitLocations,legDisabled,weaponDisabled} from '../public/play/injury-state.js';
const fail=m=>{throw Error(m);};
export function injuryTraits(c){return {highPain:!!c.combatProfile?.highPain,...c.combatProfile?.injuryTraits};}
export function damageLocation(c,location,type){
 const part=Object.hasOwn(hitLocations,location)?hitLocations[location]:null;if(!part)fail('지원하지 않는 부위입니다.');
 const eye=location.endsWith('Eye'),traits=injuryTraits(c),baseLocation=part.parent||location;
 if(part.joint&&!['cr','cut','pi-','pi','pi+','pi++'].includes(type))fail('관절은 타격·절단·관통체 공격만 지원합니다.');
 if((location==='vitals'||eye)&&!(location==='vitals'&&type==='cr')&&!['imp','pi-','pi','pi+','pi++'].includes(type))fail('급소·눈은 등록된 관통 공격으로 지정하세요.');
 // Armour coverage is never inferred from torso DR. Unarmoured profiles are unambiguous.
 const base=c.combatProfile?.dr||0;
 if(!['torso','neck'].includes(baseLocation)&&base>0&&c.combatProfile?.drByLocation?.[location]===undefined&&c.combatProfile?.drByLocation?.[baseLocation]===undefined)fail('이 부위의 방호력을 전투 수치에서 먼저 확인하세요.');
 const dr=(c.combatProfile?.drByLocation?.[location]??c.combatProfile?.drByLocation?.[baseLocation]??base)+(location==='skull'&&!traits.noBrain?2:0);
 let multiplier={'pi-':.5,cut:1.5,'pi+':1.5,imp:2,'pi++':2}[type]||1;
 if(location==='neck')multiplier=type==='cut'?2:type==='cr'?1.5:multiplier;
 if(location==='vitals'&&!traits.noVitals)multiplier=type==='cr'?1:3;
 if((location==='skull'||eye)&&!traits.noBrain)multiplier=4;
 if(part.divisor&&part.divisor!==10&&['imp','pi+','pi++'].includes(type))multiplier=1;
 return {dr:dr+armorAt(c,baseLocation,type).dr,multiplier};
}
function check(target,die){const dice=[die(6),die(6),die(6)];if(dice.some(n=>!Number.isInteger(n)||n<1||n>6))fail('주사위 오류');const total=dice.reduce((a,b)=>a+b,0);return {dice,total,target,...(target>=3?gurpsSuccessRoll(total,target):{success:total<=4,margin:target-total,outcome:total<=4?'criticalSuccess':total>=17||total>=target+10?'criticalFailure':'failure'})};}
// Traumatic wounds and secondary HP loss share survival thresholds, not shock/knockdown.
export function resolveInjury(r,c,amount,die,{source='trauma',location='torso',type='cr',emit=()=>{}}={}){
 if(!Number.isInteger(amount)||amount<0||!Number.isInteger(c.maxHp)||c.maxHp<1)fail('부상 수치를 확인하세요.');
 const f=r.combat?.status==='active'?r.combat.fighters[c.id]:null,state=f||(c.combatState??={status:'active'}),traits=injuryTraits(c),part=hitLocations[location];
 if(!Object.hasOwn(hitLocations,location))fail('부상 부위를 확인하세요.');
 if(!amount||state.status==='dead')return {amount:0,major:false,checks:[]};
 const ht=Number(c.fields?.find(x=>x.name==='HT'||x.name==='건강')?.value||c.combatProfile?.ht);
 const checks=[],before=c.hp,trauma=source==='trauma',threshold=part.divisor?Math.floor(c.maxHp/part.divisor)+1:Infinity,crippling=trauma&&amount>=threshold;
 const original=amount;
 if(trauma&&part.divisor&&part.divisor!==10)amount=Math.min(amount,threshold);
 c.hp-=amount;
 const major=trauma&&(amount>c.maxHp/2||crippling);
 if(trauma){
  c.woundRevision=(c.woundRevision||0)+1;
  const unit=Math.max(1,Math.floor(c.maxHp/10)),shock=traits.highPain?0:Math.min(4,Math.floor(amount/unit))*(traits.lowPain||location==='groin'&&type==='cr'&&traits.groinSensitive?2:1);
  if(f)f.shock=Math.min(traits.lowPain||location==='groin'&&type==='cr'&&traits.groinSensitive?8:4,(f.shock||0)+shock);
  else if(shock){state.shock=shock;state.shockSeconds=1;}
  if(crippling){
   c.injuries??={};const injuryLocation=part.joint?part.parent:location,previous=c.injuries[injuryLocation],destroyAt=part.joint?Math.floor(c.maxHp/hitLocations[part.parent].divisor)+1:threshold;
   c.injuries[injuryLocation]={location:injuryLocation,recoveryPenalty:part.joint?-2:0,label:part.label,crippled:true,destroyed:!!previous?.destroyed||original>=destroyAt*2,recovery:previous?.recovery||'pending',source:'GURPS B421–422'};
   if(legDisabled(c))state.prone=true;
   if(weaponDisabled(c))state.dropped=true;
   emit(part.label+' · '+(c.injuries[injuryLocation].destroyed?'파괴':'사용 불가'),{kind:'crippling',location});
  }
 }
 const roll=(target,label)=>{if(!Number.isInteger(ht)||ht<1)fail(c.name+'의 HT가 필요합니다.');const result=check(target,die);checks.push({label,...result});emit(label+' '+result.total+'/'+target+' · '+(result.success?'성공':'실패'),{kind:'injury',label,roll:result});return result;};
 if(c.hp<=-5*c.maxHp){state.status='dead';emit('HP −5배 도달 · 사망',{kind:'death'});}
 else for(let n=1;n<=4;n++)if(before>-n*c.maxHp&&c.hp<=-n*c.maxHp){const h=roll(ht,'생존');if(!h.success){state.status=state.status==='dying'||h.margin<-2||h.outcome==='criticalFailure'?'dead':'dying';emit(state.status==='dying'?'치명상 · 처치 필요':'사망',{kind:state.status});break;}}
 if(trauma&&!['dead','dying'].includes(state.status)){
  const head=['skull','face','jaw','leftEye','rightEye'].includes(location),sensitive=head&&!traits.noBrain||location==='vitals'&&!traits.noVitals||location==='groin'&&type==='cr'&&traits.groinSensitive;
  const shockPossible=!traits.highPain&&amount>=Math.max(1,Math.floor(c.maxHp/10));
  if(major||sensitive&&shockPossible){
   const penalty=major?(head&&!traits.noBrain?(['face','jaw'].includes(location)?-5:-10):(location==='vitals'&&!traits.noVitals||location==='groin'&&type==='cr'&&traits.groinSensitive)?-5:0):0;
   const h=roll(ht+penalty-(!major&&location==='groin'&&type==='cr'&&traits.groinSensitive?5:0)-(location==='jaw'&&type==='cr'?1:0)+(traits.highPain?3:traits.lowPain?-4:0),major?'중상':'넘어짐·기절');
   if(!h.success){state.stunned=true;state.prone=true;state.dropped=true;state.aim=null;if(h.margin<=-5||h.outcome==='criticalFailure')state.status='unconscious';}
  }
 }
 if(state.status==='dead')c.effects=(c.effects||[]).filter(e=>e.key!=='bleeding');
 return {amount,major,checks};
}
export function shockModifier(r,c,attribute,{reactive=false}={}){
 if(reactive||!['DX','IQ','Will','Per'].includes(attribute))return 0;
 const f=r.combat?.status==='active'?r.combat.fighters[c.id]:null;
 const penalty=f?.activeShock||(!f&&c.combatState?.shockSeconds>0?c.combatState.shock:0)||0;return penalty?-penalty:0;
}
export function settleCrippling(r,c,die,emit){
 if(r.combat?.status==='active'||c.combatState?.status==='dead')return;
 for(const [part,wound] of Object.entries(c.injuries||{})){
  if(wound.recovery==='pending'){
   const ht=Number(c.fields?.find(x=>x.name==='HT'||x.name==='건강')?.value||c.combatProfile?.ht);
   if(!Number.isInteger(ht)||ht<1)fail(c.name+'의 부상 회복 HT가 필요합니다.');
   const roll=wound.destroyed?null:check(ht+(wound.recoveryPenalty||0),die);
   wound.recovery=wound.destroyed||roll.outcome==='criticalFailure'?'permanent':roll.success?'temporary':'lasting';
   if(wound.recovery==='lasting'){
    const months=die(6);if(!Number.isInteger(months)||months<1||months>6)fail('주사위 오류');wound.months=months;
    if(r.chronicle?.clock){const d=new Date(r.chronicle.clock.date+'T00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const end=new Date(d);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);d.setUTCDate(Math.min(day,end.getUTCDate()));wound.recoveryDate=d.toISOString().slice(0,10);}
   }
   emit(wound.label+' 부상 · '+({temporary:'HP 완전 회복까지',lasting:wound.months+'개월 회복 필요',permanent:'영구 손상'})[wound.recovery],{kind:'cripplingRecovery',roll,location:part});
  }
  if(wound.recovery==='temporary'&&c.hp>=c.maxHp||wound.recovery==='lasting'&&wound.recoveryDate&&r.chronicle?.clock?.date>=wound.recoveryDate){delete c.injuries[part];emit(wound.label+' 기능 회복',{kind:'cripplingRecovery',location:part});}
 }
}

export function visionAttackModifier(c,kind,aimed=false){const count=['leftEye','rightEye'].filter(p=>c.injuries?.[p]).length;return count===2?-10:count===1?(kind==='melee'||aimed?-1:-3):0;}
