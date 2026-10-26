import {campaignCreateFields,bindCampaignCreate} from './campaign-create.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=v=>v?new Date(v).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'미정';
const localDate=v=>{if(!v)return '';const d=new Date(v);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export async function sessionManager(ctx){
 let rooms=[],filter='active',query='';
 const root=()=>document.getElementById('session-manager');
 async function reload(){
  try{rooms=(await ctx.request()).rooms;return true;}catch(e){ctx.toast(e.message);return false;}
 }
 async function read(id){
  const response=await fetch('/api/table?room='+encodeURIComponent(id)),data=await response.json();
  if(!response.ok)throw Error(data.error);return data.room;
 }
 function frame(){
  return `<section id="session-manager"><div class="session-intro"><div><span class="session-eyebrow">NIGHT TABLE / ARCHIVE</span><h2>이어서 펼칠 이야기</h2><p class="fine">참가자와 진행 상황을 확인하고 지난 자리에서 이어갑니다.</p></div>${ctx.current()?'<button id="leave-play">플레이 화면 나가기</button>':''}</div>
  <div class="session-toolbar"><input id="session-search" aria-label="캠페인 검색" placeholder="캠페인 이름·참가자 검색" value="${esc(query)}"><button id="session-accounts">내 캐릭터 보관함</button><button id="new-session">＋ 새 캠페인</button><button id="join-session">초대 코드로 참가</button></div>
  <div class="session-filters" role="group" aria-label="캠페인 분류">${[['active','진행 중'],['archived','보관함']].map(([id,label])=>`<button data-filter="${id}" aria-pressed="${filter===id}">${label} <span>${rooms.filter(r=>r.archived===(id==='archived')).length}</span></button>`).join('')}<button id="reload-sessions">새로고침</button></div><div id="session-list"></div></section>`;
 }
 function list(){
  const visible=rooms.filter(r=>r.archived===(filter==='archived')&&`${r.title} ${r.members.map(m=>m.name+' '+m.characters.join(' ')).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  document.getElementById('session-list').innerHTML=visible.map(r=>`<article class="session-card" data-session="${esc(r.id)}">
   <div class="session-card-heading"><span class="pill">${r.role==='owner'?'GM':'플레이어'} · ${r.system==='gurps4'?'GURPS 4판':'범용 판정'}</span>${ctx.current()?.id===r.id?'<span class="session-current">현재 열림</span>':''}</div>
   <h3>${esc(r.title)}</h3><p class="session-recap">${esc(r.session.recap||'지난 이야기를 기록해 두면 다음 세션을 준비하기 편합니다.')}</p>
   <div class="session-facts"><span>참가자 ${r.members.length}/2</span><span>캐릭터 ${r.characterCount}</span><span>기록 ${r.messageCount}</span></div>
   <ul class="session-members">${r.members.map(m=>`<li><b>${esc(m.name)}</b><small>${m.role} · ${esc(m.characters.join(', ')||'캐릭터 미등록')}</small></li>`).join('')}</ul>
   <div class="session-dates"><span>다음 실제 모임 <b>${esc(stamp(r.session.nextAt))}</b></span><span>최근 활동 ${esc(stamp(r.updatedAt))}</span></div>
   <div class="session-actions"><button class="primary" data-open="${esc(r.id)}">${r.archived?'기록 열기':'이어하기'}</button><button data-manage="${esc(r.id)}">${r.role==='owner'?'캠페인 관리':'진행 정보'}</button>${r.role==='owner'?`<button class="danger" data-delete-session="${esc(r.id)}">삭제</button>`:''}</div></article>`).join('')||`<div class="session-empty"><h3>${query?'일치하는 캠페인이 없습니다.':filter==='archived'?'보관한 이야기가 없습니다.':'아직 진행 중인 이야기가 없습니다.'}</h3><p>${query?'다른 이름으로 검색해 보세요.':filter==='archived'?'보관한 캠페인은 기록을 유지하며 여기서 다시 시작할 수 있습니다.':'새 캠페인을 만들거나 받은 초대 코드로 참가하세요.'}</p></div>`;
  root().querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>ctx.chooseRoom(b.dataset.open));
  root().querySelectorAll('[data-delete-session]').forEach(b=>b.onclick=()=>remove(b.dataset.deleteSession));
  root().querySelectorAll('[data-manage]').forEach(b=>b.onclick=()=>manage(b.dataset.manage));
 }
 function draw(){
  ctx.closeModal();ctx.modal('캠페인 관리',frame(),()=>{
   document.getElementById('session-search').oninput=e=>{query=e.target.value;list();};
   root().querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;draw();});
   document.getElementById('reload-sessions').onclick=async()=>{if(await reload())draw();};
   document.getElementById('session-accounts').onclick=ctx.accounts;
   document.getElementById('new-session').onclick=()=>entry(false);
   document.getElementById('join-session').onclick=()=>entry(true);
   const leave=document.getElementById('leave-play');if(leave)leave.onclick=()=>{if(ctx.leave())draw();};
   list();
  });
 }
 function entry(join){
  ctx.closeModal();ctx.modal(join?'초대 코드로 참가':'새 캠페인',`<section id="session-manager"><form id="${join?'join-room':'create-room'}" class="form-stack">${join?'<label>초대 코드<input name="code" required autocomplete="off" spellcheck="false"></label><label>표시 이름<input name="name" value="플레이어 2" maxlength="60" required></label>':`<label>캠페인 이름<input name="title" placeholder="예: 밤의 도시 · 사라진 의뢰인" maxlength="80" required></label>${campaignCreateFields()}${rooms.some(r=>r.role==='owner'&&!r.archived&&!r.quickStart)?`<label>기존 설정·룰북·GM 연결 재사용<select name="sourceRoomId"><option value="">새로 준비</option>${rooms.filter(r=>r.role==='owner'&&!r.archived&&!r.quickStart).map(r=>`<option value="${esc(r.id)}" ${r.id===rooms.find(x=>x.role==='owner'&&!x.archived&&!x.quickStart)?.id?'selected':''}>${esc(r.title)}</option>`).join('')}</select></label>`:''}`}<div class="session-actions"><button class="primary">${join?'참가하기':'캠페인 만들기'}</button><button type="button" id="back-sessions">목록으로</button></div></form></section>`,()=>{
   document.getElementById('back-sessions').onclick=draw;
   const form=document.querySelector('#session-manager form');
   if(!join)bindCampaignCreate(form,ctx);
   else form.onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(form));p.code=p.code.trim();if(await ctx.command('join',p))ctx.closeModal();};
  });
 }
 async function remove(id){
  let r;try{r=await read(id);}catch(e){ctx.toast(e.message);return;}
  ctx.closeModal();ctx.modal('캠페인 삭제',`<section id="session-manager"><h3>${esc(r.title)}</h3><p>이 캠페인의 캐릭터·초상화·지도·대화·판정·자료를 모두 삭제합니다. 다른 참가자도 더 이상 열 수 없으며 되돌릴 수 없습니다.</p><p class="fine">기록을 남기려면 취소 후 캠페인의 기록 메뉴에서 먼저 내보내세요.</p><form id="delete-session-form" class="form-stack"><label>확인을 위해 캠페인 이름을 그대로 입력하세요<input name="confirmName" autocomplete="off" required aria-label="삭제할 캠페인 이름"></label><div class="session-actions"><button id="confirm-delete-session" class="danger" disabled>캠페인 영구 삭제</button><button type="button" id="cancel-delete-session">취소</button></div></form></section>`,()=>{
   const form=document.getElementById('delete-session-form'),input=form.elements.confirmName,button=document.getElementById('confirm-delete-session');
   input.oninput=()=>{button.disabled=input.value!==r.title;};
   document.getElementById('cancel-delete-session').onclick=draw;
   form.onsubmit=async e=>{e.preventDefault();if(input.value!==r.title)return;button.disabled=true;
    if(await ctx.command('deleteSession',{confirmName:input.value},r)){await reload();draw();ctx.toast('캠페인을 삭제했습니다.');}
    else{button.disabled=false;await remove(id);}
   };
  });
 }
 async function manage(id){
  let r;try{r=await read(id);}catch(e){ctx.toast(e.message);return;}
  const own=rooms.find(x=>x.id===id)?.role==='owner',s=r.session||{};
  ctx.closeModal();ctx.modal('진행 정보 · '+r.title,`<section id="session-manager"><p class="fine">${r.archivedAt?'보관 중 · 재개하면 다시 진행할 수 있습니다.':'진행 중'} · 일정은 이 기기의 현지 시간으로 표시합니다.</p>
   <form id="session-details" class="form-stack"><fieldset ${!own||r.archivedAt?'disabled':''}><label>캠페인 이름<input name="title" value="${esc(r.title)}" maxlength="80" required></label>
   <div class="session-fields"><p class="fine">케이스의 시작·종료와 기록은 플레이 화면의 시나리오에서 관리합니다.</p><label>다음 실제 모임<input name="nextAt" type="datetime-local" value="${localDate(s.nextAt)}"></label></div>
   <label>지난 이야기 · 함께 보는 메모<textarea name="recap" maxlength="4000" rows="6" placeholder="어디까지 진행했고, 다음에 무엇을 할까요?">${esc(s.recap||'')}</textarea></label></fieldset>
   <div class="session-actions">${own&&!r.archivedAt?'<button class="primary">변경 저장</button>':''}<button type="button" id="back-sessions">목록으로</button></div></form>
   ${own?`<div class="session-admin">${!r.archivedAt?'<button id="session-invite">초대 코드 확인</button>':''}<button id="session-archive">${r.archivedAt?'캠페인 재개':'캠페인 보관'}</button></div><p class="fine">보관하면 진행과 새 참가를 잠그고 캐릭터·지도·대화 기록을 유지합니다.</p>`:''}</section>`,()=>{
    document.getElementById('back-sessions').onclick=async()=>{if(await reload())draw();};
    document.getElementById('session-details').onsubmit=async e=>{
     e.preventDefault();const p=Object.fromEntries(new FormData(e.target));
     if(await ctx.command('settings',{title:p.title,session:{episode:s.episode||1,recap:p.recap,nextAt:p.nextAt?new Date(p.nextAt).toISOString():''}},r)){await reload();draw();}
    };
    const archive=document.getElementById('session-archive');if(archive)archive.onclick=()=>{
     ctx.closeModal();ctx.modal(r.archivedAt?'캠페인 재개':'캠페인 보관',`<section id="session-manager"><p><strong>${esc(r.title)}</strong>${r.archivedAt?'을 다시 진행합니다.':'을 보관함으로 옮깁니다. 참가자 모두의 진행이 잠기며 기록은 유지됩니다.'}</p><div class="session-actions"><button id="confirm-archive" class="primary">${r.archivedAt?'재개':'보관'}</button><button id="cancel-archive">취소</button></div></section>`,()=>{
      document.getElementById('cancel-archive').onclick=()=>manage(id);
      document.getElementById('confirm-archive').onclick=async()=>{if(await ctx.command('archiveSession',{archived:!r.archivedAt},r)){filter=r.archivedAt?'active':'archived';await reload();draw();}else await manage(id);};
     });
    };
    const invite=document.getElementById('session-invite');if(invite)invite.onclick=()=>{
     ctx.closeModal();ctx.modal('캠페인 초대',`<section id="session-manager"><p>${esc(r.title)} · 참가자 ${r.members.length}/2</p><p class="fine">사이트 접근 권한이 있는 친구에게 코드를 전달하세요.</p><label class="form-stack">초대 코드<input id="session-code" value="${esc(r.joinCode)}" readonly></label><div class="session-actions"><button id="copy-session-code">코드 복사</button><button id="invite-back">돌아가기</button></div></section>`,()=>{
      document.getElementById('invite-back').onclick=()=>manage(id);
      document.getElementById('copy-session-code').onclick=async()=>{try{await navigator.clipboard.writeText(r.joinCode);ctx.toast('초대 코드를 복사했습니다.');}catch{document.getElementById('session-code').select();ctx.toast('선택된 코드를 복사하세요.');}};
     });
    };
   });
 }
 if(await reload())draw();
}
