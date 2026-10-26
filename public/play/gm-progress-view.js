export const stages=['sources','compose','validate','apply'];
export const stageLabel=(stage,kind,owner=true)=>({
 sources:owner?'설정·참조 자료 확인':'요청 확인',
 compose:kind==='preparation'?(owner?'장소·인물·사건 구성':'장면 준비'):kind==='dialogue'?'NPC 응답 작성':kind==='request'?'관리자 답변 작성':'GM 응답 작성',
 validate:'응답 검증',apply:'게임 상태 반영',
})[stage]||'로컬 GM 응답 대기';
export const jobLabel=kind=>({preparation:'케이스 준비',storyDay:'도입 장면',dialogue:'NPC 대화',request:'관리자 요청',rules:'규칙 준비',combat:'전투 진행',combatReaction:'전투 결과 반응',individual:'개인 행동',turn:'행동 처리',narration:'결과 설명'})[kind]||'GM 요청';
export function duration(start,end=Date.now()){
 const seconds=Math.max(0,Math.floor((Number(end)-Date.parse(start))/1000));
 if(!Number.isFinite(seconds))return '';
 return seconds<60?`${seconds}초`:`${Math.floor(seconds/60)}분 ${seconds%60}초`;
}
export function connectionState(lastSeen,now=Date.now()){
 const age=now-Date.parse(lastSeen);
 return !Number.isFinite(age)?'연결 확인 대기':age<45000?'로컬 GM 연결됨':'로컬 GM 응답 지연';
}
export function updateGMConnection(connection){
 for(const el of document.querySelectorAll('[data-gm-connection]')){
  if(connection!==undefined)el.dataset.lastSeen=connection?.lastSeen||'';
  const seen=el.dataset.lastSeen;
  el.dataset.state=seen&&Date.now()-Date.parse(seen)<45000?'online':'waiting';
  const state=el.querySelector('[data-connection-label]'),last=el.querySelector('time');
  if(state)state.textContent=connectionState(seen);
  if(last){last.dateTime=seen||'';last.textContent=seen?`마지막 응답 ${new Date(seen).toLocaleTimeString('ko-KR')}`:'아직 응답 없음';}
 }
}
