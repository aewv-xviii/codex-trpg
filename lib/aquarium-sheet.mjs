import {aquariumDocuments,aquariumSourceHash} from './data/aquarium-sources.mjs';
// Explicit owner maintenance. Never available in model proposal schemas.
export function syncAquariumSheet(r,u,p){
 const fail=m=>{throw Error(m);};
 if(u.id!==r.owner)fail('방장 권한이 필요합니다.');
 if(['queued','running','applying'].includes(r.gmJob?.status))fail('진행 중인 GM 작업을 마친 뒤 시트를 갱신하세요.');
 const c=r.characters.find(c=>c.id===p.characterId);
 if(!c?.fields?.some(f=>f.name==='시트 출처'&&f.value.includes('PC-GYH-001')))fail('고영환의 등록 시트가 필요합니다.');
 if(p.sheetRevision!==(c.sheetRevision||0)||p.sourceHash!==aquariumSourceHash||p.approved!==true)fail('최신 시트와 원문 버전 및 승인을 확인하세요.');
 if(c.abilitySheet?.sourceHash===aquariumSourceHash)return {unchanged:true};
 const oldCP=c.fields.find(f=>f.name==='CP')?.value||'';
 if(!/^(200|205) \(미사용 0/.test(oldCP))fail('추가 성장 CP가 있는 시트는 별도로 대조해야 합니다.');
 const values={
  'CP':'200 (미사용 0)',
  '장점 · 거짓 수족관':'총 95CP. v2 시작 빌드: 기존80 + 시각 형상 확장5 + Talent1→3 10. Poor Wealth 재배분이며 성장 CP를 추가 차감하지 않음.',
  '장점 · 유영어 ×2':'20CP = 48CP Ally 두 마리 각8CP + 정신 명령 링크4CP. 등장빈도15이하 ×3.',
  '장점 · 유영어 소환':'비닐1단위, 집중1초, 쌍 공통15이하. 실패 재료 소모·즉시 새 재료로 재시도. 유지비 없음. 현재 개체 상태는 능력 상태 기록 참조.',
  '장점 · 유영어 간이 수치':'ST2 DX13 IQ6 HT10 HP6 FP10 Will6 Per12. DR0 Dodge8 Air Move11 SM-6. 48CP, 무호흡. 일반 단일피해1HP 상한, 특수공격은 Diffuse 상한(관통1/그외2), 영역·원뿔·폭발은 정상 피해. HP0 즉시 파괴·수리 불가.',
  '장점 · 유영어 활용':'200야드 안 생각 명령은 자유 행동. 더 멀면 IQ12+Telesend 거리수정, 집중1초. 단순 정찰·0.8lb 이하 작은 물건 운반. 벽/닫힌 문 통과·공격·구속·사람 손/주머니 회수·감각공유는 미구매. 보고는 실제 귀환 후 시각 신호.',
  '장점 · 굴절어':'5CP. Obscure(Vision)2, 고정 반경2야드, 시각 의존 판정-2. 아군·적·카메라 모두 영향. 겹치면 한 번.',
  '장점 · 굴절어 제한':'발동 순간 물고기 직접 시야. DX12-4+Talent3=11, 조준 Acc3 후14, 최대100야드. Attack1회, 10초 시험값. 실패시 구역 없음. 정밀 분신·실제 이동 불가.',
  '장점 · 포식어':'43CP. 기본38CP + 현재 구매된 시각 형상 확장5CP. 단일 대상·한 감각, 다른 감각은 미세 단서 편집.',
  '장점 · 포식어 판정':'집중1초, IQ12+Talent3=15 대 Will. 같은 장면에 활성 물고기를 직접 알아본 대상, 영환이 직접 보거나 접촉. 시전자 실패시 저항 굴림 생략, 동률 방어. 주의분산 보정 중복 없음.',
  '장점 · 포식어 범위':'현재 시각 형상 확장 구매. 한 관찰자가 보는 형상 하나의 치환과 단순 짧은 동작. 기존 사용자 승인인 동료→벽 얼룩 활용도 유지. 복잡한 자율 행동·정신지배·실명·마비·질식·광역은 미구매.',
  '장점 · 포식어 집중':'발동 집중1초 뒤 10초 동안 재집중 없이 지속(시험값). 다른 행동 가능. 효과의 남은 시간은 서버 상태 참조.',
  '장점 · 포식어 응용':'한 대상의 지각만 변경. 카메라·실물·다른 관찰자·다른 감각·기억은 그대로. 구체적 단서와 전술적 판단은 GM 재정. 자동 명중·방어불가 아님. 모순 확인 후 Will에 성공해도 환각 자체는 남은 시간 유지.',
  '장점 · 초상 흔적 탐지':'4CP. 활성 유영어가 있으면 영환 위치에서 Per13+Talent3=16에 실제 거리·방해 수정. 가까운 현재 활성 희귀 정신계 초상 흔적의 존재 탐지.',
  '장점 · 탐지 제한':'원격 물고기 시점·정체/능력/인원수/벽너머 좌표 자동확정 불가. 가까운 범위·차폐·대상 적격은 원문과 현장 근거로 GM 재정. 10야드는 시험값이며 하드코딩된 감지벽이 아님.',
  '장점 · 감각 환류':'포식 성공 후 해당 감각+1, 60초, 비중첩. 후각·미각은 같은 슬롯. 일반 공격/방어 기능에 가산하지 않음.',
  '장점 · 감각 환류 하우스룰':'8CP, 집중 종료 후에도 남은60초 유지. 현재 보너스는 지속 상태 기록 참조.',
  '장점 · 거짓 수족관 Talent 3':'15CP. 포식어15, Detect16, 굴절어11. 일반 기능·소환빈도·명령 링크에는 더하지 않음.',
  '단점 · Poor Wealth':'-15CP. v2 재배분. 시작재산 $4000은 과거 시작 예산이며 현재 현금·소지품을 재설정하지 않음.',
  '성장 계획':'현재 시각1단계와 Talent3 구매. 광역 환각+45CP, 단일Choking까지+64, 16야드Choking까지+84는 이후 성장이며 미구매. 추가 물고기·물고기 절도·감각공유·현실조작 미구매.',
  '소환·효과 시작 상태':'v2 문서의 시작값은 현재 플레이 상태를 초기화하지 않는다. 현재 물고기·지속효과·자원은 서버 상태 참조.',
  '시트 출처':'go_yeonghwan_gurps4e_200cp_v2.md schema2.0 / PC-GYH-001. 현재 구매·판정값은 v2, 세부 절차는 거짓 수족관 v1.4. 실제 플레이 자원·위치·소유권 유지.'
 };
 c.fields=c.fields.filter(f=>!/^장점 · 거짓 수족관 Talent \d+$/.test(f.name));
 for(const [name,value] of Object.entries(values)){const f=c.fields.find(f=>f.name===name);if(f)f.value=value;else c.fields.push({name,value,formula:''});}
 c.abilityGrants??={};c.abilityGrants['predator-visual-1']={...c.abilityGrants['predator-visual-1'],cp:5,includedInStartingCP:true,source:'gyh-sheet-v2'};
 c.abilitySheet={revision:'2.0',sourceHash:aquariumSourceHash,at:new Date().toISOString()};
 c.description=c.description.replace(/20[05]CP/g,'200CP').replace('시작 200CP에 사용자 승인 시각 확장 +5CP를 적용했다. 다른 성장 계획은 미구매다.','v2 시작 200CP에 시각 확장과 Talent3 포함. 나머지 성장은 미구매.');
 c.sheetRevision=(c.sheetRevision||0)+1;
 for(const doc of aquariumDocuments){const old=r.documents.find(x=>x.id===doc.id);if(old)Object.assign(old,structuredClone(doc));else r.documents.push(structuredClone(doc));}
 r.campaign.rulebookIds=[...new Set([...(r.campaign.rulebookIds||[]),...(r.campaign.rulebookId?[r.campaign.rulebookId]:[]),...aquariumDocuments.map(d=>d.id)])];
 r.messages.push({id:crypto.randomUUID(),type:'system',author:u.id,name:'시트 갱신',at:new Date().toISOString(),text:'고영환 v2 시트·거짓 수족관 v1.4 반영: 총200CP, 능력95CP, Talent3, 포식어15/Detect16/굴절어11. 현재 HP·FP·현금·소지품·물고기·위치·판정 기록은 유지.'});
 return {characterId:c.id,sheetRevision:c.sheetRevision,sourceHash:aquariumSourceHash};
}
