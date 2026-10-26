import {rulebookSettings} from './rulebook-settings.js';
import {setupHome,bindSetupHome} from './setup-home.js';
import {combatProfileDialog} from './combat.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const area=(name,label,value,max=10000)=>`<label>${label}<textarea name="${name}" maxlength="${max}" rows="4">${esc(value)}</textarea></label>`;
const input=(name,label,value='',type='text')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" required></label>`;
const fileCard=(c,slot,label,hint)=>{
 const source=c.sourceFiles?.[slot],value=c[slot]||'';
 return `<section class="setup-file-card"><header><b>${label}</b><span>GM 전용</span></header><p>${hint}</p><div class="setup-file-saved"><strong>${esc(source?.name||(value?'직접 작성한 내용':'등록된 파일 없음'))}</strong>${value?`<small>${value.length.toLocaleString()}자 · 저장됨</small>`:''}</div><label class="setup-file-picker">${value?'파일 교체':'파일 불러오기'}<input data-setup-file="${slot}" type="file" accept=".txt,.md,.pdf"></label><p data-file-state="${slot}" role="status"></p><details><summary>본문 확인·수정</summary>${area(slot,label+' 본문',value,200000)}</details></section>`;
};
export async function campaignSetup(ctx){
 let step='home',records=[];try{records=(await ctx.request({op:'accountList'})).characters;}catch{}
 const room=()=>ctx.current();
 function draw(){
  const r=room(),c=r.campaign,own=r.owner===ctx.me.id;
  ctx.closeModal();
  const local=c.localBookIds??r.localLibrary?.books.filter(b=>b.kind==='rule'&&b.emptyPages<b.pages).map(b=>b.id)??[],docs=c.rulebookIds||[c.rulebookId];
  const fields=step==='home'?setupHome(r,ctx.me,records):step==='world'?(own?fileCard(c,'bible','캠페인 바이블','세계관·인물·비밀 설정이 담긴 원본 파일')+fileCard(c,'gmInstructions','AI GM 시작 프롬프트','캠페인 내내 적용할 진행 지침')+`<details><summary>참가자용 세계관 소개 · 선택 사항</summary>${area('world','참가자 공개',c.world,20000)}</details>`:area('world','참가자 공개 세계관',c.world,20000)):step==='books'?rulebookSettings(r,local,docs):step==='party'?`<div class="setup-party">${r.characters.filter(x=>!x.isNPC).map(x=>`<article><b>${esc(x.name)}</b><small>${esc(r.members.find(m=>m.id===x.owner)?.name||'')} · ${r.partyCharacterIds.includes(x.id)?'시작 파티':'대기'}</small><span>HP ${x.maxHp} · FP ${x.maxFp} · ${x.combatProfile?'전투 수치 등록됨':'전투 수치 미등록'}</span>${x.owner===ctx.me.id?`<div class="entry-actions"><button type="button" data-setup-char="${x.id}">시트·장비</button><button type="button" data-combat-profile="${x.id}">전투 수치</button><button type="button" data-setup-party="${x.id}">${r.partyCharacterIds.includes(x.id)?'대기시키기':'파티 참가'}</button></div>`:''}</article>`).join('')}</div><p><button type="button" data-open-economy>시작 소지금 · 물품 설정</button></p><button type="button" id="setup-new-char">＋ 내 캐릭터 만들기</button>${records.filter(x=>!r.characters.some(ch=>(ch.accountId||ch.id)===x.id)).map(x=>`<button type="button" data-import-character="${x.id}">${esc(x.profile.name)} · 보관함에서 투입</button>`).join('')}<p class="fine">친구는 본인 계정으로 참가해 자신의 캐릭터를 준비합니다. 초상화는 나중에 추가해도 됩니다.</p>`:step==='case'?input('caseTitle','첫 케이스 이름',c.caseTitle)+fileCard(c,'caseScenario','케이스 시나리오','이번 케이스에서 사용할 시나리오 파일')+fileCard(c,'openingPrompt','첫 장면 지시 · 선택 사항','첫 장면에만 적용합니다. 계속 적용할 지침은 세계관 탭에 등록하세요.')+`<p class="fine">이미지 생성 없이 장소·NPC·사건을 준비합니다.</p>`:`<div class="setup-review"><p>${c.world?.trim()||c.bible?.trim()?'✓':'○'} 세계관${c.sourceFiles?.bible?' · '+esc(c.sourceFiles.bible.name):''}</p><p>${local.length?'✓':'○'} 로컬 룰북 ${local.length}권</p><p>${r.partyCharacterIds.length?'✓':'○'} 시작 파티 ${r.partyCharacterIds.length}/4명</p>${r.characters.filter(x=>r.partyCharacterIds.includes(x.id)&&!x.isNPC).map(x=>{const missing=['ST','DX','IQ','HT','Will','Per'].filter(k=>!x.fields?.some(f=>f.name===k&&Number(f.value)>0));return `<p>${esc(x.name)} · ${missing.length?'미입력: '+missing.join(', '):'기본 능력치 등록됨'}${x.inventory?.trim()?'':' · 시작 장비 미입력'}${x.combatProfile?'':' · 전투 수치 미등록 (전투 전 필요)'}</p>`;}).join('')}<p>${r.economy?.enabled?'✓':'○'} 원화 경제 · ${r.characters.filter(x=>r.partyCharacterIds.includes(x.id)&&x.assets?.confirmed).length}/${r.partyCharacterIds.length}명 자산 확정</p><button type="button" data-open-economy>시작 소지금 · 물품 설정</button><p>${c.caseScenario?.trim()?'✓':'○'} 첫 케이스</p><p class="fine">이미지는 준비 조건이 아닙니다. 수치가 없는 판정은 임의로 굴리지 않습니다.</p></div><button type="button" id="setup-prepare" class="primary" ${r.chronicle.activeCaseId?'disabled':''}>${r.chronicle.activeCaseId?'진행 중인 케이스가 있습니다':'준비 확인 · 케이스 구성'}</button>`;
  ctx.modal('캠페인 준비',`<section class="campaign-setup"><div class="setup-intro"><span>CAMPAIGN / SETUP</span><h3>${esc(r.title)}</h3><p>이야기 · 캐릭터 · 시작 자산. 세 가지만 확인하세요.</p></div><details ${step!=='home'?'open':''}><summary>세계관·룰북 등 상세 설정</summary><nav class="setup-tabs">${[['home','시작 준비'],['world','세계관'],['books','룰북'],['party','파티'],['case','도입'],['review','시작 확인']].map(([id,label])=>`<button type="button" data-setup-step="${id}" aria-pressed="${step===id}">${label}</button>`).join('')}</nav></details><form id="campaign-setup-form" class="form-stack"><fieldset ${!own&&!['party','home'].includes(step)?'disabled':''}>${fields}</fieldset>${own&&step!=='home'?'<button class="primary" type="submit">저장</button>':''}<p id="setup-saved" role="status">${c.setupSavedAt?'저장됨 · '+new Date(c.setupSavedAt).toLocaleTimeString('ko-KR'):''}</p></form></section>`,()=>{
   const form=document.getElementById('campaign-setup-form');
   if(step==='home')bindSetupHome(ctx,records,draw,next=>{step=next;draw();},character);
   const save=async()=>{if(!own||step==='home'||step==='party'||step==='review')return true;const values=Object.fromEntries([...new FormData(form)].filter(([key,value])=>typeof value==='string'&&value!==(room().campaign[key]||'')));if(step==='books'){values.localBookIds=[...form.querySelectorAll('[data-book="local"]:checked')].map(e=>e.value);}return !!await ctx.command('campaignSetup',values);};
   form.querySelectorAll('[data-document-link]').forEach(el=>el.onchange=async()=>{const role=form.querySelector('[data-document-role="'+el.dataset.documentLink+'"]')?.value;if(await ctx.command('classifyDocument',{documentId:el.dataset.documentLink,role,linked:el.checked}))draw();});
   form.querySelectorAll('[data-document-role]').forEach(el=>el.onchange=async()=>{el.disabled=true;try{if(await ctx.command('classifyDocument',{documentId:el.dataset.documentRole,role:el.value,linked:form.querySelector('[data-document-link="'+el.dataset.documentRole+'"]')?.checked===true}))draw();}finally{el.disabled=false;}});
   form.onsubmit=async e=>{e.preventDefault();if(await save()){document.getElementById('setup-saved').textContent='저장됨';}};
   form.querySelectorAll('[data-book="local"]').forEach(el=>el.addEventListener('change',async()=>{
    const boxes=[...form.querySelectorAll('[data-book="local"]')],status=document.getElementById('setup-saved');
    boxes.forEach(b=>b.disabled=true);status.textContent='룰북 선택 저장 중…';
    try{const ok=await save();if(ok){status.textContent='저장됨 · 다음 GM 검색부터 적용';}else{el.checked=!el.checked;status.textContent='저장 실패 · 기존 선택 유지';}}
    finally{boxes.forEach(b=>{const book=room().localLibrary?.books.find(x=>x.id===b.value);b.disabled=book?.emptyPages===book?.pages;});}
   }));
   document.querySelectorAll('[data-setup-step]').forEach(b=>b.onclick=async()=>{if(await save()){step=b.dataset.setupStep;draw();}});
   form.querySelectorAll('[data-setup-file]').forEach(el=>el.addEventListener('change',async()=>{
    const file=el.files[0],slot=el.dataset.setupFile;if(!file)return;
    const state=form.querySelector(`[data-file-state="${slot}"]`);
    el.disabled=true;state.textContent='파일 읽는 중…';
    try{
     if(!/\.(txt|md|pdf)$/i.test(file.name))throw Error('TXT·MD·PDF 파일을 선택하세요.');
     const content=await ctx.readDocument(file);if(!content.trim())throw Error('파일에 내용이 없습니다.');
     if(!await save()){state.textContent='기존 입력을 저장하지 못했습니다.';return;}
     if(!await ctx.command('campaignSetup',{file:{slot,name:file.name,content}})){state.textContent='파일 저장 실패 · 다시 선택하세요.';return;}
     draw();
    }catch(error){state.textContent=error.message;ctx.toast(error.message);}
    finally{el.disabled=false;el.value='';}
   }));
   document.getElementById('setup-new-char')?.addEventListener('click',()=>character());
   form.querySelectorAll('[data-setup-char]').forEach(b=>b.onclick=()=>character(b.dataset.setupChar));
   form.querySelectorAll('[data-combat-profile]').forEach(b=>b.onclick=()=>combatProfileDialog({...ctx,room:room()},b.dataset.combatProfile));
   form.querySelectorAll('[data-setup-party]').forEach(b=>b.onclick=async()=>{if(await ctx.command('partyCharacter',{characterId:b.dataset.setupParty,inParty:!room().partyCharacterIds.includes(b.dataset.setupParty)}))draw();});
   form.querySelectorAll('[data-import-character]').forEach(b=>b.onclick=async()=>{const x=records.find(x=>x.id===b.dataset.importCharacter);if(await ctx.command('deployCharacter',{id:x.id,version:x.version}))draw();});
   document.getElementById('setup-prepare')?.addEventListener('click',async()=>{if(!own)return;if(!await ctx.command('campaignSetup',{ready:true}))return;const c=room().campaign;if(!c.caseTitle?.trim()||!c.caseScenario?.trim()){ctx.toast('도입 탭에 케이스 이름과 줄거리를 입력하세요.');step='case';draw();return;}if(await ctx.command('prepareScenario',{title:c.caseTitle,scenario:c.caseScenario,autoApply:true})){ctx.closeModal();ctx.openScenario();}});
  });
 }
 function character(id){
  const x=room().characters.find(c=>c.id===id),core=['ST','DX','IQ','HT','Will','Per'],extra=(x?.fields||[]).filter(f=>!core.includes(f.name)).map(f=>`${f.name}: ${f.value}`).join('\n');
  ctx.closeModal();ctx.modal(x?'시작 캐릭터 · '+x.name:'시작 캐릭터',`<form id="setup-character" class="form-stack">${!x&&room().owner===ctx.me.id?`<label>소유 계정<select name="ownerId">${room().members.map(m=>`<option value="${esc(m.id)}" ${m.id===ctx.me.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`:''}${input('name','이름',x?.name)}${area('description','소개',x?.description,2000)}<div class="setup-attributes">${core.map(k=>input(k,k,x?.fields?.find(f=>f.name===k)?.value,'number')).join('')}${input('maxHp','최대 HP',x?.maxHp,'number')}${input('maxFp','최대 FP',x?.maxFp,'number')}</div>${area('extra','기능·특성·이동 수치 (한 줄에 이름: 값)',extra,20000)}${area('inventory','장비 메모 · 실제 수량은 자산에서 확정',x?.inventory,4000)}<button type="submit" class="primary">캐릭터 저장</button><button type="button" id="setup-char-back">준비로 돌아가기</button></form>`,()=>{
   document.getElementById('setup-char-back').onclick=draw;
   document.getElementById('setup-character').onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));const fields=core.map(k=>({name:k,value:p[k]}));for(const line of p.extra.split('\n').filter(x=>x.trim())){const at=line.indexOf(':');if(at<1)return ctx.toast('기능·특성은 이름: 값 형식으로 입력하세요.');fields.push({name:line.slice(0,at).trim(),value:line.slice(at+1).trim()});}if(await ctx.command('setupCharacter',{id:id||'',ownerId:p.ownerId,name:p.name,description:p.description,fields,inventory:p.inventory,maxHp:Number(p.maxHp),maxFp:Number(p.maxFp)}))draw();};
  });
 }
 draw();
}
