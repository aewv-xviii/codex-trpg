import {attackManeuvers,postures} from '../public/play/combat-options.js';
export {attackManeuvers,postures};
const fail=s=>{throw Error(s);};
export {addDamage} from '../public/play/gurps-damage.js';
import {addDamage} from '../public/play/gurps-damage.js';
export const postureOf=f=>f.prone?(f.posture==='supine'?'supine':'prone'):(f.posture||'standing');
export function postureMove(f,move){const p=postureOf(f);return p==='sitting'?0:['prone','supine'].includes(p)?1:p==='kneeling'?Math.max(1,Math.floor(move/3)):p==='crouching'?Math.max(1,Math.floor(move*2/3)):move;}
export function setPosture(f,value){if(!Object.hasOwn(postures,value))fail('자세를 확인하세요.');f.posture=value;f.prone=['prone','supine'].includes(value);delete f.rising;}
export const noDefense=f=>f.maneuver==='suppress'||f.maneuver?.startsWith('allOut');
export function gripWeapon(w,f){
 if(f.grip!=='reverse'||w.unarmed||w.kind!=='melee')return w;
 if(!w.reverseGrip)fail('역수 그립이 검토된 날붙이가 아닙니다.');
 const dice=Number.parseInt(w.damage),thrust=w.damageBasis==='thrust';
 return {...w,damage:addDamage(w.damage,thrust?1:-Math.max(2,dice)),reach:Math.max(0,w.reach-1)};
}
export function maneuverAttack(w,f,p){
 const maneuver=p.maneuver||'attack';if(!Object.hasOwn(attackManeuvers,maneuver))fail('공격 기동을 확인하세요.');
 if(w.kind!=='melee'&&!['attack','stepAttack','moveAttack','allOutDetermined'].includes(maneuver))fail('이 기동은 준비된 근접 공격에 사용하세요.');
 if(p.rapidStrike&&maneuver==='allOutDouble')fail('전력 2회와 연속 공격 조합은 별도 다중 공격 선언이 필요합니다.');
 let skill=0,damage=0;
 if(maneuver==='allOutDetermined')skill=w.kind==='melee'?4:1;
 if(maneuver==='committedDetermined')skill=2;
 if(['allOutStrong','committedStrong'].includes(maneuver)){
  if(!w.damageBasis&&!w.unarmed)fail('강타에는 ST 기반 피해가 확인된 무기가 필요합니다.');
  damage=maneuver==='allOutStrong'?Math.max(2,Number.parseInt(w.damage)):1;
 }
 if(maneuver==='defensiveAttack')damage=-Math.max(2,Number.parseInt(w.damage));
 const steps=p.steps??0;if(!Number.isInteger(steps)||steps<0||steps>2)fail('한 걸음 수를 확인하세요.');
 if(steps>1&&!maneuver.startsWith('committed')&&p.extraEffort!=='giantStep')fail('두 걸음은 적극적 공격 또는 거인 걸음에만 가능합니다.');
 if(steps===2&&maneuver.startsWith('committed'))skill-=2;
 f.defensiveChoice=['parry','block'].includes(p.defensiveChoice)?p.defensiveChoice:'parry';
 f.attackLimb=w.unarmed?w.limb:'weapon';f.attackingHand=w.attackLimb?.replace(/Hand$/,'');
 return {weapon:{...w,damage:addDamage(w.damage,damage)},skill,steps,double:maneuver==='allOutDouble'};
}
export function tacticalDefense(f,defense,{unarmed=false}={}){
 if(noDefense(f))fail('이 기동 중에는 다음 자기 차례까지 능동방어를 할 수 없습니다.');
 let modifier=postures[postureOf(f)].defense;
 if(f.maneuver?.startsWith('committed')){
  if(defense==='parry'&&!unarmed&&f.attackLimb==='weapon'||defense==='dodge'&&f.attackLimb==='foot')fail('적극적 공격에 사용한 무기·발로는 이 방어를 할 수 없습니다.');
  // A hand attack leaves the other free hand available, tracked by the caller.
  modifier-=2;
 }
 if(f.maneuver==='defensiveAttack'&&f.attackLimb!=='foot'&&defense===f.defensiveChoice&&!(defense==='parry'&&f.unbalancedUsed))modifier++;
 if(f.maneuver==='defend'&&defense===(f.defenseChoice||'dodge'))modifier+=2;
 if(defense==='parry'&&!unarmed&&f.grip==='reverse')modifier-=2;
 if(defense==='parry'&&!unarmed&&f.unbalancedUsed&&!f.rapidRecovery&&!(f.maneuver==='defensiveAttack'&&f.defensiveChoice==='parry'))fail('불균형 무기로 공격한 뒤에는 다음 차례까지 받아낼 수 없습니다.');
 return modifier;
}
