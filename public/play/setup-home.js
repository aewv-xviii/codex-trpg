import {importContentPack} from './content-packs.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupHome(r,me,records){
 const own=r.owner===me.id,party=r.characters.filter(c=>r.partyCharacterIds.includes(c.id)),missing=party.filter(c=>!c.assets?.confirmed),hasCase=r.chronicle.cases.some(c=>c.visibility==='public'&&c.status==='open'),ready=hasCase&&party.length&&r.economy?.enabled&&!missing.length;
 return '<div class="start-cards">'+
 '<section class="start-card"><span class="start-number">01</span><div><h3>플레이할 이야기</h3><p>'+ (hasCase?'✓ 달력에 케이스가 준비됐어요.':'준비 파일 하나로 지도·인물·전개을 함께 가져옵니다.')+'</p>'+ (own?'<button type="button" id="start-pack">케이스 불러오기</button><button type="button" data-start-step="case" class="quiet">시나리오 원문으로 준비</button>':'<p>방장이 준비 파일을 등록합니다.</p>')+'</div></section>'+
 '<section class="start-card"><span class="start-number">02</span><div><h3>함께할 캐릭터</h3><p>'+esc(party.map(c=>c.name).join(' · ')||'아직 파티가 없습니다.')+'</p><div class="start-characters">'+records.filter(x=>!r.characters.some(c=>(c.accountId||c.id)===x.id)).map(x=>'<button type="button" data-start-character="'+esc(x.id)+'" '+(party.length>=4?'disabled':'')+'>'+esc(x.profile.name)+' 데려오기</button>').join('')+'</div><button type="button" id="start-new">새 캐릭터 작성</button><button type="button" data-start-step="party" class="quiet">파티·시트 관리</button></div></section>'+
 '<section class="start-card"><span class="start-number">03</span><div><h3>시작 소지금·물품</h3><p>'+(party.length?missing.length?esc(missing.map(c=>c.name).join(', '))+'의 시작 자산을 확인하세요.':'✓ 시작 자산이 저장돼 있어요.':'캐릭터를 고르면 여기서 함께 설정합니다.')+'</p>'+(own&&missing.length?'<button type="button" id="start-assets">한 번에 설정</button>':'')+'<button type="button" data-open-economy class="quiet">상점·소지품</button></div></section></div>'+
 '<div class="start-footer"><p>'+(ready?'준비됐어요. 달력에서 케이스를 골라 출발하세요.':'초상화·이미지·전투 수치는 나중에 추가할 수 있어요.')+'</p><button type="button" id="start-calendar" class="primary" '+(!ready?'disabled':'')+'>달력에서 플레이 시작</button></div><p class="fine">준비 파일 등록·이동·정해진 조사는 AI 없이 처리합니다. 자유 대화와 새로운 상황 판단에는 로컬 GM이 필요합니다.</p>';
}
export function bindSetupHome(ctx,records,draw,go,character){
 const bind=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
 document.querySelectorAll('[data-start-step]').forEach(b=>b.onclick=()=>go(b.dataset.startStep));
 bind('start-new',()=>character());bind('start-calendar',()=>{ctx.closeModal();ctx.openScenario();});
 bind('start-pack',()=>{ctx.closeModal();importContentPack({...ctx,room:ctx.current(),onComplete:draw});});
 document.querySelectorAll('[data-start-character]').forEach(b=>b.onclick=async()=>{const c=records.find(c=>c.id===b.dataset.startCharacter);b.disabled=true;if(await ctx.command('deployCharacter',{id:c.id,version:c.version}))draw();else b.disabled=false;});
 bind('start-assets',()=>{
  const r=ctx.current(),missing=r.characters.filter(c=>r.partyCharacterIds.includes(c.id)&&!c.assets?.confirmed),items=r.economy.items;
  ctx.closeModal();ctx.modal('시작 자산 확인','<form id="start-assets-form" class="form-stack"><p class="fine">입력한 금액과 수량만 지급합니다. 시트의 장비 메모는 자동으로 물품이 되지 않습니다.</p>'+missing.map(c=>'<fieldset data-asset-character="'+c.id+'"><legend>'+esc(c.name)+'</legend><label>소지금 (원)<input name="won" type="number" min="0" max="1000000000000" value="0" required></label><details><summary>시작 물품 선택</summary>'+items.map(i=>'<label>'+esc(i.name)+'<input type="number" data-item="'+esc(i.id)+'" min="0" max="99999" value="0" required></label>').join('')+'</details></fieldset>').join('')+'<p class="fine">입력하지 않은 물품과 탄약은 0개로 시작합니다. 기존에 확정한 파티원 자산은 바뀌지 않습니다.</p><button class="primary">이 자산으로 시작</button><button type="button" id="assets-back">돌아가기</button><p id="assets-error" role="status"></p></form>',()=>{
   const form=document.getElementById('start-assets-form');document.getElementById('assets-back').onclick=draw;
   form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button.primary');button.disabled=true;const characters=[...form.querySelectorAll('[data-asset-character]')].map(f=>({characterId:f.dataset.assetCharacter,won:Number(f.querySelector('[name="won"]').value),items:[...f.querySelectorAll('[data-item]')].filter(i=>Number(i.value)>0).map(i=>({itemId:i.dataset.item,quantity:Number(i.value)}))}));if(await ctx.command('confirmStartingAssets',{characters}))draw();else {button.disabled=false;document.getElementById('assets-error').textContent='저장되지 않았습니다. 알림을 확인한 뒤 다시 시도하세요.';}};
  });
 });
}
