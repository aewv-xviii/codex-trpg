import {addDamage} from './combat-options.mjs';
export const effortOptions=['','heroicCharge','giantStep','greatLunge','flurry','mightyBlow','feverishDefense','rapidRecovery'];
export const effortNames={heroicCharge:'영웅적 돌진',giantStep:'거인 걸음',greatLunge:'긴 찌르기',flurry:'연속 타격 강화',mightyBlow:'강력한 일격',feverishDefense:'필사적 방어',rapidRecovery:'빠른 회수'};
const fail=m=>{throw Error(m);};
export function effortCost(p){return ['flurry','mightyBlow'].includes(p.extraEffort)&&p.rapidStrike?2:p.extraEffort?1:0;}
export function validateEffort(p,c,f,defense=false){
 const e=p.extraEffort||'';if(!effortOptions.includes(e))fail('추가 노력 선택을 확인하세요.');if(!e)return '';
 if(c.fp<=0)fail('FP가 없어 추가 노력을 사용할 수 없습니다.');
 if(defense){
  if(!['feverishDefense','rapidRecovery'].includes(e)||p.defense==='none')fail('사용 가능한 추가 노력 방어를 선택하세요.');
  if(f.effortDefense&&f.effortDefense!==e)fail('개인 차례당 방어 추가 노력 종류는 하나만 가능합니다.');
  if(f.maneuver?.startsWith('allOut')||f.maneuver==='suppress'||f.maneuver?.startsWith('committed'))fail('이 기동에서는 해당 추가 노력 방어를 사용할 수 없습니다.');
  if(e==='rapidRecovery'&&(p.defense!=='parry'||['karate','brawling'].includes(p.parryMode)||f.rapidRecovery||!(f.maneuver==='moveAttack'||['attack','stepAttack'].includes(f.maneuver)&&f.unbalancedUsed)))fail('빠른 회수는 이동 공격 또는 불균형 무기 공격 후 첫 무기 받아내기에 사용하세요.');
 }else{
  if(p.action!=='attack'||['feverishDefense','rapidRecovery'].includes(e))fail('공격 추가 노력은 실제 공격에만 사용할 수 있습니다.');
  if(f.effortOffense)fail('이번 차례의 공격 추가 노력을 이미 사용했습니다.');
  const m=p.maneuver||'attack';
  if(e==='heroicCharge'&&m!=='moveAttack'||e==='giantStep'&&!['attack','stepAttack','defensiveAttack'].includes(m)||e==='greatLunge'&&!['attack','stepAttack','moveAttack','committedStrong','committedDetermined'].includes(m)||e==='mightyBlow'&&!['attack','stepAttack'].includes(m)||e==='flurry'&&(!p.rapidStrike||m==='moveAttack'))fail('추가 노력과 기본 기동의 조합이 맞지 않습니다.');
 }
 if(c.fp<effortCost(p))fail('추가 노력에 필요한 FP가 부족합니다.');
 return e;
}
export function effortWeapon(w,p){
 const e=p.extraEffort;if(!e)return w;
 if(w.kind!=='melee'||w.supernatural)fail('이 추가 노력은 실제 근접 공격에만 사용하세요.');
 if(e==='mightyBlow'){
  if(!w.damageBasis&&!w.unarmed)fail('강력한 일격에는 ST 기반 피해가 확인되어야 합니다.');
  return {...w,damage:addDamage(w.damage,Math.max(2,parseInt(w.damage)))};
 }
 if(e==='greatLunge'){
  if(!w.damageBasis&&!w.unarmed)fail('긴 찌르기의 피해 기반을 확인하세요.');
  return {...w,reach:w.reach+1,damage:addDamage(w.damage,w.damageBasis==='swing'?-Math.max(2,parseInt(w.damage)):0)};
 }
 return w;
}
export function spendEffort(c,f,e,emit,defense=false){
 if(!e)return;if(c.fp<1)fail('추가 노력에 필요한 FP가 부족합니다.');
 c.fp--;f[defense?'effortDefense':'effortOffense']=e;
 emit(`${c.name} · ${effortNames[e]} · FP −1 (${c.fp}/${c.maxFp})`);
}
// Intent is adjudicated by the GM; quoted player provenance and costs are server-owned.
export function declarationEffort(r,a,p){
 if(!p.extraEffort)return;
 if(!['explicit','beyondNormal'].includes(p.effortBasis)||!p.effortQuote?.trim()||!a.text.includes(p.effortQuote)||!p.reason?.trim())fail('추가 노력에는 실제 선언 인용과 FP 사용/통상 능력 초과의 재정 근거가 필요합니다.');
}
export function effortConsentKey(r,c){return JSON.stringify([r.combat?.id,r.combat?.status,r.combat?.round,r.combat?.index,r.combat?.pending?.attackId,c.fp,r.worldLibrary?.placeId,r.mapId]);}
