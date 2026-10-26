import {canControl} from './character-control.js';
import {stages,stageLabel,jobLabel,duration,connectionState,updateGMConnection} from './gm-progress-view.js';
import {ammoLedgerMarkup} from './ammo-ledger.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label)=>`<button data-work="${action}">${label}</button>`;
const expanded=new Set();
document.addEventListener('toggle',e=>{
 const id=e.target.dataset?.uiFold;
 if(id&&e.target.isConnected)e.target.open?expanded.add(id):expanded.delete(id);
},true);
const fold=(id,title,body)=>`<details class="management-fold" data-ui-fold="${id}" ${expanded.has(id)?'open':''}><summary>${title}</summary>${body}</details>`;
export function gmManagement(ctx){
 const r=ctx.room,j=r.gmJob||{},gm=r.owner===ctx.me.id;
 const pending=r.actions.filter(a=>a.status==='pending'),planned=r.actions.filter(a=>a.status==='planned');
 const active=['queued','running'].includes(j.status);
 const battle=r.combat?.status==='active',current=battle?[...r.characters,...r.characters.flatMap(c=>c.aquarium?.fish||[])].find(c=>c.id===(r.combat.pending?.targetId||r.combat.order[r.combat.index])):null;
 const turnLabel=battle?(r.combat.pending?.kind==='critical'?'특수 판정 확인 중':(current?.name||'참가자')+' '+(r.combat.pending?'방어':'행동')+' 차례'):'';
 const status=active?({queued:'진행 요청 대기',running:'GM이 진행 중'})[j.status]:j.status==='error'?'진행 확인 필요':battle?turnLabel:planned.length?'판정을 기다리는 중':pending.length?'미처리 선언 확인 필요':({done:'진행 완료',cancelled:'진행 중단'})[j.status]||'행동을 기다리는 중';
 const stage=stageLabel(j.stage,j.kind,gm);
 const elapsed=duration(j.startedAt||j.at);
 const stepStatus={done:'완료',running:'진행 중',pending:'대기',error:'실패',cancelled:'중단'};
 const steps=job=>stages.map(id=>{
  const item=job.steps?.find(x=>x.stage===id),state=item?.status||'pending';
  return `<li class="gm-step" data-state="${state}"><span class="gm-step-icon" aria-hidden="true">${({done:'✓',running:'●',error:'!',cancelled:'—',pending:'○'})[state]}</span><span>${esc(stageLabel(id,job.kind,gm))}</span><small>${stepStatus[state]}${item?.finishedAt?' · '+duration(item.startedAt,Date.parse(item.finishedAt)):''}</small></li>`;
 }).join('');
 const progressSteps=j.id&&(active||j.steps?.length)?`<ol class="gm-steps" aria-label="작업 단계">${steps(j)}</ol>`:'';
 const connection=`<div class="gm-connection" data-gm-connection data-last-seen="${esc(r.gmConnection?.lastSeen||'')}" data-state="${connectionState(r.gmConnection?.lastSeen)==='로컬 GM 연결됨'?'online':'waiting'}"><strong data-connection-label>${connectionState(r.gmConnection?.lastSeen)}</strong><time>${r.gmConnection?.lastSeen?'마지막 응답 '+esc(new Date(r.gmConnection.lastSeen).toLocaleTimeString('ko-KR')):'아직 응답 없음'}</time></div>`;
 const unfinished=j.kind!=='turn'&&j.status==='done'&&pending.some(a=>j.actionIds?.includes(a.id));
 const retryable=!(j.actionIds?.length)||pending.some(a=>j.actionIds.includes(a.id));
 const controls=gm?`<div class="owner-tools">${active?button('gm-stop','중단'):retryable&&(j.kind!=='turn'&&['error','cancelled'].includes(j.status)||unfinished)&&j.id?button('gm-retry',unfinished?'미처리 행동 이어서 진행':'다시 시도'):''}${j.kind==='preparation'&&j.status==='done'?'<button class="primary" data-page="cases">날짜 선택해서 플레이</button>':''}</div>`:'';
 const retryNote=gm&&retryable&&['error','cancelled'].includes(j.status)?`<p class="fine">${esc(stage)}에서 ${j.status==='error'?'실패':'중단'}했습니다. 다시 시도하면 최신 게임 상태로 요청을 다시 처리합니다.</p>`:'';
 const history=gm&&r.gmHistory?.length?fold('gm-history','처리 기록',`<div class="gm-history">${[...r.gmHistory].reverse().map(h=>`<details><summary><b>${jobLabel(h.kind)}</b><span>${stepStatus[h.status]||h.status} · ${duration(h.startedAt||h.at,Date.parse(h.finishedAt))}</span></summary><p class="fine">${esc(new Date(h.finishedAt).toLocaleString('ko-KR'))}${h.attempt>1?' · '+h.attempt+'번째 시도':''}</p><ol class="gm-steps">${steps(h)}</ol></details>`).join('')}</div>`):'';
 const activities=r.characters.filter(c=>canControl(c,ctx.me)&&c.activity&&['queued','paused'].includes(c.activity.status)).map(c=>`<article class="entry"><b>${esc(c.name)} · ${esc(c.activity.label)}</b><p>${c.activity.index+1}/${c.activity.steps.length}단계 · ${c.activity.progress}/${c.activity.steps[c.activity.index]?.seconds||0}초 · ${esc(c.activity.reason)}</p><button data-activity-id="${esc(c.id)}" data-activity-mode="cancel">작업 취소</button>${c.activity.status==='paused'?`<button data-activity-id="${esc(c.id)}" data-activity-mode="resume">작업 재개</button>`:''}</article>`).join('');
 const pendingActions=gm&&!active&&pending.length?fold('gm-pending-actions','미처리 선언',pending.filter(a=>a.scope==='individual').map(a=>`<article class="entry"><b>${esc(r.characters.find(c=>c.id===a.actorId)?.name||'캐릭터')}</b><p class="rule-details">${esc(a.text)}</p>${a.deferred?'<p>선입력 보관 · 자기 차례에 검토</p>':''}<button data-work="gm-retry-action" data-action-id="${esc(a.id)}">이 선언 이어서 진행</button><button data-work="gm-cancel-action" data-action-id="${esc(a.id)}">선언 취소</button>${r.actionErrors?.[a.id]?`<p role="alert" class="rule-details">${esc(r.actionErrors[a.id].message)}</p>`:''}</article>`).join('')):'';
 const hint=active?'결과가 준비되면 대화와 판정에 표시됩니다.':battle?turnLabel+'입니다. 자기 차례에 행동을 입력하세요. 이전 미처리 선언은 전투 진행을 막지 않습니다.':planned.length?'준비된 판정의 결과와 위험을 확인한 뒤 주사위를 굴리세요.':pending.length?'미처리 선언이 있습니다. 해당 요청의 처리 기록을 확인하세요.':'행동과 NPC 대화는 바로 GM에게 전달됩니다.';
 const drafts=r.rules.filter(rule=>rule.status==='draft');
 const ruleCard=rule=>`<article class="entry"><b>${esc(rule.name)}</b><p class="fine">${esc(rule.formula)} ${rule.comparator==='gte'?'≥':'≤'} ${rule.target}</p><details><summary>근거 확인</summary><p class="rule-details">${esc(rule.source)}</p></details>${rule.status==='draft'?`<button data-approve="${rule.id}">이 규칙 승인</button>`:''}</article>`;
 const approvals=gm&&(drafts.length||r.campaign?.templateDraft?.length)?fold('approvals','확인할 제안',`<p class="inline-note">AI가 제안한 새 규칙과 시트 양식은 방장이 확인한 뒤 적용합니다.</p>${drafts.map(ruleCard).join('')}${r.campaign?.templateDraft?.length?`<pre>${esc(r.campaign.templateDraft.map(f=>`${f.name}: ${f.value}`).join('\n'))}</pre>${button('approve-template','시트 양식 승인')}`:''}`):'';
 const management=gm?fold('gm-management','GM 관리',`
  <section class="management-group"><h3>제작 자료 연결</h3><p class="fine">캠페인·케이스·캐릭터 제작은 개인 Codex에서 준비하고, 여기서는 자료 연결과 필요한 수정을 합니다.</p><div class="owner-tools"><button data-campaign-setup>캠페인 준비</button>${button('campaign','룰북 연결 상세')}<button data-do="document">자료 추가</button></div></section>
  ${fold('gm-documents','등록 자료 확인',(r.documents||[]).map(d=>`<article class="entry"><b>${esc(d.title)}</b><span class="pill">${d.visibility==='gm'?'GM 전용':'공개'}</span><div class="entry-actions"><button data-document="${d.id}">읽기</button></div></article>`).join('')||'<p class="fine">웹에 등록한 자료가 없습니다. PC 룰북은 룰·시나리오 선택에서 확인하세요.</p>')}
  <section class="management-group"><h3>장면과 인물</h3><div class="owner-tools">${button('scene-edit','장면 편집')}${button('scenes','장면 보관함')}<button data-create-npc>NPC·동료 등록</button>${button('cast','연출용 NPC 초상화')}${button('map-tools','지도 편집 도구')}<button data-do="secret">GM 비밀 기록</button></div></section>
  ${fold('manual-checks','수동 판정 개입',`<p class="fine">GM의 처리가 막혔을 때 직접 판정 계획을 작성하거나 자동 처리합니다.</p><button data-do="new-rule">규칙 직접 추가</button>${ctx.manualActions()}`)}
  ${fold('active-rules','등록된 규칙',r.rules.filter(rule=>rule.status==='active').map(ruleCard).join('')||'<p class="fine">아직 등록된 규칙이 없습니다.</p>')}
  ${fold('gm-settings','연결·복구',`<div class="owner-tools">${button('scenario-reset','시나리오 시작으로')}${button('pair','PC GM 연결')}${button('checkpoint','복구 지점 저장')}${button('restore','복구 지점 열기')}<button data-do="gm-guide">연결 안내</button></div>${j.message?`<p class="rule-details">${esc(j.message)}</p>`:''}`)}
 `):'';
 return `<section class="section-page gm-overview"><div class="page-heading"><h2>AI GM</h2><span class="pill">${active?'진행 중':'진행 현황'}</span></div>${connection}<div class="owner-tools"><button data-gm-question>GM에게 진행 질문</button></div><div class="gm-progress"><h3>${j.id?jobLabel(j.kind)+' · ':''}${status}</h3>${active?`<p role="status">${j.status==='queued'?'로컬 GM 응답 대기':stage} · <span data-gm-elapsed="${esc(j.startedAt||j.at)}">${elapsed} 경과</span></p>`:''}${progressSteps}${retryNote}${controls}${j.kind==='preparation'?'<p class="fine">이미지는 별도로 준비합니다. 장소·인물·사건 설정이 끝나면 플레이할 수 있습니다.</p>':''}${gm&&j.status==='error'?`<details class="gm-error" open><summary>오류 확인</summary><p class="rule-details">${esc(j.message||'로컬 GM 실행 기록을 확인하세요.')}</p></details>`:''}<p>${hint}</p><div class="gm-counts"><span>선언 ${pending.length}</span><span>판정 ${planned.length}</span>${!battle&&pending.some(a=>a.scope!=='individual')?`<span>공동 선언 ${r.turn?.ready?.length||0}/${r.members.length}</span>`:''}</div>${planned.length?'<button class="primary" data-tab="checks">판정 확인</button>':''}</div>${activities}${pendingActions}${gm?fold('gm-ammunition','아군·적군 탄약 현황',ammoLedgerMarkup(r.ammunitionLedger||[])):''}${history}<div class="owner-tools"><button data-page="documents">공개 자료</button><button data-page="cases">사건 기록</button></div>${approvals}${management}</section>`;
}

setInterval(()=>{for(const el of document.querySelectorAll("[data-gm-elapsed]"))el.textContent=duration(el.dataset.gmElapsed)+' 경과';updateGMConnection();},1000);
