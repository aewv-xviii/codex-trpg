// GURPS Fourth Edition basic success rolls, not damage or contest resolution.
export const gurpsSheetFields = () => ['ST','DX','IQ','HT','Will','Per','기본 속도','기본 이동력','회피','DR','기능','장점','단점'].map(name=>({name,value:'',formula:''}));
export const outcomeLabel = roll => ({criticalSuccess:'대성공',criticalFailure:'대실패'})[roll.outcome] || (roll.success?'성공':'실패');
export function gurpsSuccessRoll(total, target) {
  if (!Number.isInteger(total) || total < 3 || total > 18 || !Number.isInteger(target) || target < 3)
    throw new Error('겁스 성공 판정은 수정 후 기능 3 이상, 3d6 굴림이 필요합니다.');
  const criticalSuccess = total <= 4 || (total === 5 && target >= 15) || (total === 6 && target >= 16);
  const criticalFailure = !criticalSuccess && (total === 18 || (total === 17 && target <= 15) || total >= target + 10);
  const success = criticalSuccess || (!criticalFailure && total < 17 && total <= target);
  return { success, margin: target - total, outcome: criticalSuccess ? 'criticalSuccess' : criticalFailure ? 'criticalFailure' : success ? 'success' : 'failure' };
}
export function validateGurpsRule(rule) {
  if (rule.formula !== '3d6' || rule.comparator !== 'lte' || rule.target < 3)
    throw new Error('겁스 성공 판정은 3d6, 목표값 이하, 수정 후 기능 3 이상으로 설정하세요. 보정은 목표값에 적용합니다.');
}
