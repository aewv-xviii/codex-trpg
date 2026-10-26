// Shared preflight and server validation. Array order is execution order;
// an unconditional `after` documents ordering, not a success requirement.
export function validateAbilityPlanConditions(steps) {
 if(!Array.isArray(steps)||steps.length<1||steps.length>12)throw Error('능력 단계는 1~12개가 필요합니다.');
 const ids=new Set();
 for(const s of steps){
  if(!s||typeof s.id!=='string'||!s.id.trim()||s.id.length>60)throw Error('능력 단계 ID를 입력하세요.');
  if(ids.has(s.id))throw Error(`능력 단계 ID가 중복되었습니다: ${s.id}`);
  if(!['always','success','failure','tie'].includes(s.when))throw Error(`능력 단계 ${s.id}: 지원하지 않는 조건입니다.`);
  if(typeof s.after!=='string')throw Error(`능력 단계 ${s.id}: after는 앞 단계 ID 또는 빈 문자열이어야 합니다.`);
  if(s.after!==''&&!ids.has(s.after))throw Error(`능력 단계 ${s.id}: after '${s.after}'는 앞선 단계 ID여야 합니다.`);
  if(s.when!=='always'&&s.after==='')throw Error(`능력 단계 ${s.id}: ${s.when} 조건에는 앞선 단계 ID가 필요합니다.`);
  ids.add(s.id);
 }
}
