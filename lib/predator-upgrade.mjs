// Explicit owner maintenance; never callable by a model proposal.
export const visualGrantId='predator-visual-1';
export function grantPredatorVisual(r,u,p){
 const fail=m=>{throw Error(m);};
 if(u.id!==r.owner)fail('방장 권한이 필요합니다.');
 if(['queued','running','applying'].includes(r.gmJob?.status))fail('GM 작업 종료 후 적용하세요.');
 const c=r.characters.find(x=>x.id===p.characterId);
 if(!c?.fields?.some(f=>f.name==='시트 출처'&&f.value.includes('PC-GYH-001')))fail('고영환의 기존 시트가 필요합니다.');
 if(c.abilityGrants?.[visualGrantId])fail('이미 적용된 확장입니다.');
 if(p.sheetRevision!==(c.sheetRevision||0)||p.approved!==true||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>1000)fail('최신 시트와 명시적 승인 사유가 필요합니다.');
 const field=name=>c.fields.find(f=>f.name===name);
 if(field('CP')?.value!=='200 (미사용 0)'||!field('장점 · 포식어')?.value.startsWith('38CP.'))fail('시작 200CP/포식어 38CP 상태를 다시 확인하세요.');
 const values={
  'CP':'205 (미사용 0; 사용자 승인 시각 확장 +5CP)',
  '장점 · 거짓 수족관':'총 85CP. 기존 80CP + 시각 확장 5CP. 기존 소환·감각·사거리·저항 조건 유지.',
  '장점 · 포식어':'43CP. 기본 38CP + 시각 확장 5CP, 2026-10-23 사용자 승인. 단일 대상이 보는 사람·물체 하나의 전체 모습을 다른 형상으로 바꿀 수 있음.',
  '장점 · 포식어 범위':'시각 확장 구매: 차재헌 전신을 벽의 얼룩으로 보이게 하는 시도 허용. 한 관찰자·한 형상, 단순 짧은 움직임. 다른 감각은 미세 편집. 실명·마비·정신지배·현실 변경 불가.',
  '장점 · 포식어 집중':'1초 집중 후 10초 동안 재집중 없이 지속하는 v1.4 시험 하우스룰 적용. 일반 Independence 및 복잡한 자율 환영은 미구매.',
  '장점 · 포식어 응용':'시각은 전체 형상 하나의 치환까지 구매. 소리·냄새·맛·촉각은 작은 단서 하나만 편집. 카메라·다른 관찰자·실물에는 변화 없음.',
  '성장 계획':'시각 1단계(+5CP)만 구매 완료. 추가 물고기·Talent2·굴절 강화·다른 감각 확장·광역·Independence·감각공유는 미구매.'
 };
 for(const [name,value] of Object.entries(values)){const f=field(name);if(!f)fail('필수 시트 항목 누락: '+name);f.value=value;}
 c.abilityGrants??={};c.abilityGrants[visualGrantId]={cp:5,at:new Date().toISOString(),author:u.id,reason:p.reason};
 c.description=c.description.replace('200CP','205CP').replace('시작 200CP만 등록했으며 성장 계획은 미구매다.','시작 200CP에 사용자 승인 시각 확장 +5CP를 적용했다. 다른 성장 계획은 미구매다.');
 c.sheetRevision=(c.sheetRevision||0)+1;
 r.messages.push({id:crypto.randomUUID(),type:'system',author:u.id,name:u.name,at:new Date().toISOString(),text:'고영환 포식어 시각 확장 +5CP 적용 · 포식어 43CP / 총 205CP. 한 대상이 보는 사람·물체 하나의 전체 형상 치환 허용. 1초 집중, IQ13 대 Will, 10초 재집중 없는 지속(시험값). 이전 판정·전투 차례·시간·HP·소지품 보존. '+p.reason});
 return {characterId:c.id,grantId:visualGrantId,cp:205,sheetRevision:c.sheetRevision};
}
