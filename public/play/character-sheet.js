import {conditionBadges,conditionDisclosure} from './conditions-view.js';
import {assetsMarkup} from './economy.js';
import {combatProfileDialog} from './combat.js';
import {canControl} from './character-control.js';
import {portraitMarkup} from './portrait-crop.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups={attributes:'능력치',defense:'이동·방어',skills:'기능',traits:'장점·단점',other:'기타'};
const core=[['ST','근력'],['DX','민첩'],['IQ','지능'],['HT','건강'],['Will','의지'],['Per','지각']];
let updateOpenSheet;
export function refreshCharacterSheet(room){if(document.getElementById('sheet-root'))updateOpenSheet?.(room);}
function category(f){
 if(f.section)return f.section;
 if(/^(ST|DX|IQ|HT|Will|Per)(\s|$)/i.test(f.name))return 'attributes';
 if(/속도|이동|회피|받아내기|막기|^DR$|speed|move|dodge|parry|block/i.test(f.name))return 'defense';
 if(/장점|단점|불리점|특성|특전|버릇/.test(f.name))return 'traits';
 if(f.name==='CP'||f.name==='포인트')return 'other';
 return 'skills';
}
export function resourceBar(label,value,max){
 const percent=Math.max(0,Math.min(100,(Number(value)||0)/(Number(max)||1)*100));
 return `<span class="resource-meter ${label.toLowerCase()}"><span><b>${label}</b><strong>${esc(value)} <i>/ ${esc(max)}</i></strong></span><span class="meter-track" role="meter" aria-label="${label}" aria-valuemin="${Math.min(0,value)}" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${value} / ${max}"><span style="width:${percent}%"></span></span></span>`;
}
export function rosterCard(c,{active=false,controllable=false,controllerName='',state=c.combatState}={}){
 const p=c.portraits?.find(p=>p.id===c.expressionId)||c.portraits?.[0];
 return `<button class="character-chip ${active?'is-selected':''}" data-roster-character="${esc(c.id)}" aria-pressed="${active}" aria-label="${esc(c.name)} · ${controllable?'한 번 눌러 선택, ':''}두 번 눌러 시트 열기"><span class="roster-portrait">${p?portraitMarkup(p,`${c.name} · ${p.label}`):`<span class="roster-initial">${esc(c.name.slice(0,1))}</span>`}</span><span class="roster-status"><b class="roster-name">${esc(c.name)}</b>${resourceBar('HP',c.hp,c.maxHp)}${resourceBar('FP',c.fp,c.maxFp)}${conditionBadges(c,state)}</span></button>`;
}
export function openCharacterSheet(ctx,id){
 let c=ctx.room.characters.find(c=>c.id===id);if(!c)return;
 const own=c.owner===ctx.me.id||ctx.room.owner===ctx.me.id,gm=ctx.room.owner===ctx.me.id,gurps=ctx.room.campaign?.system==='gurps4';
 const controlled=!ctx.account&&canControl(c,ctx.me);
 let tab='attributes',editing=false,items,dirty=false,conditionsOpen=false;
 let liveState=structuredClone(ctx.room.combat?.status==='active'?ctx.room.combat.fighters[c.id]:c.combatState);
 const source=()=>structuredClone(c.fields||ctx.room.campaign?.sheetTemplate||[]);
 items=source();
 function row(f,i){
  return `<div class="sheet-field">${editing?`<input data-field="${i}" data-key="name" aria-label="항목 이름 ${i+1}" value="${esc(f.name)}" maxlength="60" required><input data-field="${i}" data-key="value" aria-label="${esc(f.name)} 값" value="${esc(f.value)}" maxlength="200" placeholder="미입력"><select data-field="${i}" data-key="section" aria-label="${esc(f.name)} 분류">${Object.entries(groups).map(([k,v])=>`<option value="${k}" ${category(f)===k?'selected':''}>${v}</option>`).join('')}</select><button type="button" data-remove="${i}" aria-label="${esc(f.name)} 항목 삭제">×</button>`:`<span>${esc(f.name)}</span><strong>${esc(f.value)||'—'}</strong>`}</div>${editing&&f.formula?`<label class="legacy-formula">기존 주사위 식<input data-field="${i}" data-key="formula" aria-label="${esc(f.name)} 주사위 식" value="${esc(f.formula)}" maxlength="20"></label>`:''}`;
 }
 function contents(){
  if(['inventory','notes'].includes(tab)){
   const fields=tab==='inventory'?[['inventory','장비 메모',4000]]:[['conditions','상태 메모',2000],['connections','인물 관계·기록',2000]];
   return (tab==='inventory'&&!ctx.account&&gurps?`<div class="sheet-equipment-heading"><h3>전투 수치</h3><p>무기 피해·방어력·부위별 방호력</p><button type="button" id="combat-profile">${gm||own&&!ctx.room.economy?.enabled?'전투 수치 설정':'전투 수치 보기'}</button></div>`:'')+(tab==='inventory'&&!editing&&!ctx.account?assetsMarkup(ctx.room,c):'')+fields.map(([key,label,max])=>`<section class="sheet-section"><h3>${label}</h3>${editing?`<textarea data-note="${key}" aria-label="${label}" maxlength="${max}" rows="8">${esc(notes[key])}</textarea>`:`<p class="sheet-prose">${esc(c[key])||'아직 기록된 내용이 없습니다.'}</p>`}</section>`).join('');
  }
  if(tab==='other'&&!editing&&c.advancement)return `<section class="sheet-section"><h3>성장 CP</h3><p>미사용 <b>${esc(c.advancement.earnedCP-c.advancement.spentCP)} CP</b> · 케이스 획득 ${esc(c.advancement.earnedCP)} CP</p><p class="fine">캐릭터 작성 CP와 별도 기록 · 능력 구매는 시트 검토 후 반영</p></section><div class="sheet-fields">${items.map((f,i)=>({f,i})).filter(({f})=>category(f)===tab).map(({f,i})=>row(f,i)).join('')}</div>`;
  let list=items.map((f,i)=>({f,i})).filter(({f})=>category(f)===tab);
  if(tab==='attributes'&&!editing){
   const used=new Set();
   const stats=core.map(([key,label])=>{
    const found=list.find(({f})=>new RegExp(`^${key}(\\s|$)`,'i').test(f.name));if(found)used.add(found.i);
    return `<article class="sheet-stat"><span>${key}<small>${label}</small></span><strong>${esc(found?.f.value)||'—'}</strong></article>`;
   }).join('');
   return `<div class="sheet-stat-grid">${stats}</div>${list.filter(x=>!used.has(x.i)).map(({f,i})=>row(f,i)).join('')}<p class="sheet-footnote">— 는 아직 입력하지 않은 수치입니다. 구매한 능력치를 시트 편집에서 기록하세요.</p>`;
  }
  return `${tab==='skills'&&!editing?'<label class="sheet-search">기능 찾기<input id="sheet-search" type="search" placeholder="이름으로 검색"></label>':''}<div class="sheet-fields ${editing?'editing':''}">${list.map(({f,i})=>row(f,i)).join('')||'<p class="sheet-empty">등록된 항목이 없습니다.</p>'}</div>${editing?'<button type="button" id="sheet-add">＋ 항목 추가</button>':''}`;
 }
 let notes={inventory:c.inventory||'',conditions:c.conditions||'',connections:c.connections||''};
 function paint(){
  const root=document.getElementById('sheet-root');if(!root)return;
  const p=c.portraits?.find(p=>p.id===c.expressionId)||c.portraits?.[0];
  const portrait=p?portraitMarkup(p):`<span>${esc(c.name.slice(0,1))}</span>`;
  const portraitControl=own?`<button type="button" class="sheet-portrait" ${ctx.account?'data-account-portrait':'data-portrait-character="'+id+'"'} aria-label="${esc(c.name)} 초상화 편집" title="초상화 편집">${portrait}<span class="portrait-edit-mark" aria-hidden="true">✎</span></button>`:`<div class="sheet-portrait">${portrait}</div>`;
  root.innerHTML=`<header class="sheet-identity">${portraitControl}<div class="sheet-biography"><span class="sheet-kicker">${gurps?'GURPS · 4TH EDITION':'CHARACTER RECORD'}</span><div class="sheet-name-row"><h3>${esc(c.name)}</h3>${own?`<button type="button" id="sheet-edit">${editing?'편집 취소':'시트 편집'}</button>`:''}</div><p class="sheet-description" tabindex="0" aria-label="캐릭터 설명">${esc(c.description)||'인물 기록'}</p></div><div class="sheet-resources">${resourceBar('HP',c.hp,c.maxHp)}${resourceBar('FP',c.fp,c.maxFp)}${!ctx.account?`<button type="button" class="sheet-inventory-link" id="sheet-inventory">소지품</button>`:''}</div></header>
   ${!ctx.account?conditionDisclosure(c,liveState,conditionsOpen):'<p class="sheet-account-note">계정 원본 · 세션 사본은 바뀌지 않습니다.</p>'}
   <nav class="sheet-tabs" role="tablist" aria-label="시트 항목">${Object.entries({...groups,...(ctx.account?{inventory:'장비'}:{}),notes:'상태·기록'}).map(([key,label])=>`<button type="button" role="tab" aria-selected="${tab===key}" data-sheet-tab="${key}">${label}</button>`).join('')}</nav>
   <form id="sheet-form"><div class="sheet-content" role="tabpanel" aria-label="${groups[tab]|| (tab==='inventory'?'장비':'상태·기록')}">${contents()}</div>${editing?'<footer class="sheet-save"><span id="sheet-save-status">저장 전에는 판정 수치가 바뀌지 않습니다.</span><button class="primary" type="submit">시트 저장</button></footer>':''}</form>
   ${!editing&&gm?`<details class="sheet-resource-edit"><summary>HP·FP 조정 (GM)</summary><form id="sheet-resources-form"><div class="resource-inputs">${[['hp','현재 HP'],['maxHp','최대 HP'],['fp','현재 FP'],['maxFp','최대 FP']].map(([key,label])=>`<label>${label}<input type="number" name="${key}" aria-label="${label}" value="${c[key]}" step="1" required></label>`).join('')}</div><label>조정 사유<input name="reason" maxlength="500" required placeholder="부상, 회복 등"></label><button type="submit">상태 반영</button></form></details>`:''}`;
  root.querySelector('.sheet-conditions')?.addEventListener('toggle',e=>{conditionsOpen=e.currentTarget.open;});
  root.querySelector('#sheet-inventory')?.addEventListener('click',()=>ctx.openInventory?.(id));
  root.querySelector('#combat-profile')?.addEventListener('click',()=>combatProfileDialog(ctx,id));
  root.querySelector('[data-account-portrait]')?.addEventListener('click',()=>ctx.portraits());
  root.querySelectorAll('[data-sheet-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.sheetTab;paint();});
  root.querySelector('#sheet-edit')?.addEventListener('click',()=>{editing=!editing;items=source();notes={inventory:c.inventory||'',conditions:c.conditions||'',connections:c.connections||''};dirty=false;paint();});
  root.querySelectorAll('[data-field]').forEach(input=>input.oninput=()=>{items[Number(input.dataset.field)][input.dataset.key]=input.value;dirty=true;});
  root.querySelectorAll('[data-note]').forEach(input=>input.oninput=()=>{notes[input.dataset.note]=input.value;dirty=true;});
  root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{items.splice(Number(b.dataset.remove),1);dirty=true;paint();});
  root.querySelector('#sheet-add')?.addEventListener('click',()=>{if(items.length>=120)return ctx.toast('항목은 120개까지 추가할 수 있습니다.');items.push({name:'',value:'',formula:'',section:tab});dirty=true;paint();root.querySelector('.sheet-field:last-child input')?.focus();});
  root.querySelector('#sheet-search')?.addEventListener('input',e=>{root.querySelectorAll('.sheet-field').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(e.target.value.toLowerCase()));});
  root.querySelector('#sheet-form').onsubmit=async e=>{
   e.preventDefault();if(!editing)return;
   if(items.some(f=>!f.name.trim())){ctx.toast('추가한 항목의 이름을 입력하세요.');return;}
   const result=await ctx.command('sheet',{characterId:id,fields:items,...notes,sheetRevision:c.sheetRevision||0});
   if(result){c=result.room.characters.find(c=>c.id===id);items=source();editing=false;dirty=false;paint();}
  };
  root.querySelector('#sheet-resources-form')?.addEventListener('submit',async e=>{
   e.preventDefault();const p=Object.fromEntries(new FormData(e.target));for(const k of ['hp','fp','maxHp','maxFp'])p[k]=Number(p[k]);
   const result=await ctx.command('resource',{characterId:id,...p});
   if(result){c=result.room.characters.find(c=>c.id===id);paint();}
  });
 }
 updateOpenSheet=room=>{
  if(ctx.account)return;ctx.room=room;
  const next=room?.characters.find(ch=>ch.id===id);
  if(!next){ctx.closeModal();return;}
  const nextState=room.combat?.status==='active'?room.combat.fighters[id]:next.combatState;
  if(!editing&&(JSON.stringify(next)!==JSON.stringify(c)||JSON.stringify(nextState)!==JSON.stringify(liveState))){const root=document.getElementById('sheet-root'),descriptionScroll=root.querySelector('.sheet-description')?.scrollTop||0,detailScroll=root.querySelector('.condition-details')?.scrollTop||0;conditionsOpen=root.querySelector('.sheet-conditions')?.open||false;c=next;liveState=structuredClone(nextState);items=source();paint();root.querySelector('.sheet-description').scrollTop=descriptionScroll;if(root.querySelector('.condition-details'))root.querySelector('.condition-details').scrollTop=detailScroll;}
 };
 ctx.modal(`${c.name} · 캐릭터 시트`,'<section id="sheet-root" class="character-sheet"></section>',paint);
}
