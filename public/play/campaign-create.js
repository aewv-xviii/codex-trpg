const slots=[['bible','캠페인 바이블','세계관·인물·비밀 설정'],['gmInstructions','AI GM 시작 프롬프트','캠페인 내내 적용할 진행 지침']];
export function campaignCreateFields(){
 return `<p class="fine">GURPS 4판 · 이름을 정하면 시작 준비 화면이 열립니다.</p><details><summary>세계관·GM 지침 파일 추가 (선택)</summary>${slots.map(([slot,label,hint])=>`<section class="setup-file-card"><header><b>${label}</b><span>GM 전용</span></header><p>${hint}</p><label class="setup-file-picker">파일 선택<input type="file" data-create-file="${slot}" aria-label="${label} 파일" accept=".txt,.md,.pdf"></label><p data-create-state="${slot}" role="status">선택한 파일 없음</p><button type="button" data-create-clear="${slot}" hidden>선택 취소</button></section>`).join('')}<p class="fine">파일은 ‘캠페인 만들기’를 누를 때 새 캠페인에 저장됩니다.</p></details><details><summary>참가자용 소개 · 직접 작성</summary><label>참가자용 세계관 소개<textarea name="world" maxlength="20000"></textarea></label></details>`;
}
export function bindCampaignCreate(form,ctx){
 const files=new Map(),pending=new Set(),errors=new Set(),revisions=new Map();
 let submitting=false;
 const submit=form.querySelector('button.primary');
 const refresh=()=>{submit.disabled=submitting||pending.size>0||errors.size>0;};
 for(const input of form.querySelectorAll('[data-create-file]')){
  const slot=input.dataset.createFile,state=form.querySelector(`[data-create-state="${slot}"]`),clear=form.querySelector(`[data-create-clear="${slot}"]`);
  clear.onclick=()=>{revisions.set(slot,(revisions.get(slot)||0)+1);input.value='';files.delete(slot);pending.delete(slot);errors.delete(slot);state.textContent='선택한 파일 없음';clear.hidden=true;refresh();};
  input.onchange=async()=>{
   const file=input.files[0];if(!file)return;
   const revision=(revisions.get(slot)||0)+1;revisions.set(slot,revision);files.delete(slot);errors.delete(slot);pending.add(slot);clear.hidden=false;state.textContent=file.name+' 읽는 중';refresh();
   try{
    if(!/\.(txt|md|pdf)$/i.test(file.name))throw Error('TXT·MD·PDF 파일을 선택하세요.');
    const content=(await ctx.readDocument(file)).trim();
    if(!content||content.length>200000)throw Error('내용이 있는 20만 자 이하 파일을 선택하세요.');
    if(revisions.get(slot)!==revision)return;
    files.set(slot,{slot,name:file.name,content});state.textContent=`${file.name} · ${content.length.toLocaleString()}자 · 등록 대기`;
   }catch(e){if(revisions.get(slot)!==revision)return;errors.add(slot);state.textContent=e.message;}
   finally{if(revisions.get(slot)===revision){pending.delete(slot);refresh();}}
  };
 }
 form.onsubmit=async e=>{
  e.preventDefault();if(submitting||pending.size||errors.size)return;
  const fields=new FormData(form),setup={files:[...files.values()]},world=String(fields.get('world')||'').trim();
  if(world)setup.world=world;
  const payload={title:fields.get('title'),setup};
  if(fields.get('sourceRoomId'))payload.sourceRoomId=fields.get('sourceRoomId');
  submitting=true;refresh();
  try{if(await ctx.command('create',payload)){ctx.closeModal();ctx.setup();}}
  finally{submitting=false;refresh();}
 };
}
