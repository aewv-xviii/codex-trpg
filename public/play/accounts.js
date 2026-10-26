import {openCharacterSheet} from './character-sheet.js';
import {portraitsDialog} from './presentation.js';
import {portraitMarkup} from './portrait-crop.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function accountManager(ctx){
 let records=[],selected=new Set();
 const run=async(op,p={})=>ctx.command(op,p);
 async function load(){try{records=(await ctx.request({op:'accountList'})).characters;draw();}catch(e){ctx.toast(e.message);}}
 function draw(){
  ctx.closeModal();
  ctx.modal('내 캐릭터 보관함',`<section id="account-manager"><p class="inline-note">계정에 보관하는 원본입니다. 세션을 삭제해도 남습니다. 세션에 투입하면 독립된 시트로 플레이합니다.</p><div class="owner-tools"><button id="account-new">＋ 새 원본</button>${ctx.current()?'<button class="primary" id="account-deploy">선택한 캐릭터 투입</button>':''}<button id="account-reload">새로고침</button></div><div class="account-grid">${records.map(c=>{
   const p=c.profile.portraits?.find(p=>p.id===c.profile.expressionId)||c.profile.portraits?.[0],present=ctx.current()?.characters.some(ch=>(ch.accountId||ch.id)===c.id);
   return `<article class="account-card" data-account="${c.id}"><div class="account-portrait">${p?portraitMarkup(p):`<span>${esc(c.profile.name[0])}</span>`}</div><div><label class="check-label"><input type="checkbox" data-pick="${c.id}" ${selected.has(c.id)?'checked':''} ${present?'disabled':''}><strong>${esc(c.profile.name)}</strong></label><span class="fine">${present?'현재 세션에 참가 중':'GURPS 4판 · 계정 원본'}</span><p class="account-description">${esc(c.profile.description||'아직 소개가 없습니다.')}</p><div class="entry-actions"><button data-original-sheet="${c.id}">시트</button><button data-original-info="${c.id}">정보</button><button data-original-portrait="${c.id}">초상화</button><button class="danger" data-original-delete="${c.id}">삭제</button></div></div></article>`;
  }).join('')||'<p class="empty-note">캐릭터 원본을 만들거나 기존 세션의 내 캐릭터를 불러오세요.</p>'}</div></section>`,()=>{
   const root=document.getElementById('account-manager');
   root.querySelector('#account-reload').onclick=load;
   root.querySelector('#account-new').onclick=()=>info();
   root.querySelectorAll('[data-pick]').forEach(b=>b.onchange=()=>b.checked?selected.add(b.dataset.pick):selected.delete(b.dataset.pick));
   for(const [attr,fn] of [['originalSheet',sheet],['originalInfo',info],['originalPortrait',portrait],['originalDelete',remove]]){
    const kebab=attr.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
    root.querySelectorAll(`[data-${kebab}]`).forEach(b=>b.onclick=()=>fn(records.find(c=>c.id===b.dataset[attr])));
   }
   root.querySelector('#account-deploy')?.addEventListener('click',async()=>{
    const chosen=records.filter(c=>selected.has(c.id)&&!ctx.current()?.characters.some(ch=>(ch.accountId||ch.id)===c.id));
    if(!chosen.length)return ctx.toast('투입할 캐릭터를 선택하세요.');
    for(const c of chosen){if(!await run('deployCharacter',{id:c.id,version:c.version}))return;selected.delete(c.id);}
    ctx.closeModal();ctx.toast(`${chosen.length}명이 세션에 합류했습니다.`);
   });
  });
 }
 function info(c){
  ctx.closeModal();ctx.modal(c?'원본 정보':'새 캐릭터 원본',`<form id="account-info" class="form-stack"><label>이름<input name="name" maxlength="60" value="${esc(c?.profile.name||'')}" required></label><label>소개<textarea name="description" maxlength="2000">${esc(c?.profile.description||'')}</textarea></label><div class="entry-actions"><button class="primary">저장</button><button type="button" id="account-back">보관함</button></div></form>`,()=>{
   document.getElementById('account-back').onclick=load;
   document.getElementById('account-info').onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));if(await run(c?'accountUpdate':'accountCreate',c?{id:c.id,version:c.version,action:'character',values}:values))await load();};
  });
 }
 function adapter(record){
  let c=record;
  const room=()=>({id:'account',owner:ctx.me.id,members:[ctx.me],campaign:{system:'gurps4'},characters:[{...c.profile,id:c.id,owner:ctx.me.id}]});
  const result={...ctx,account:true,room:room(),portraits:()=>portrait(c),command:async(action,values)=>{
   const saved=await run('accountUpdate',{id:c.id,version:c.version,action,values});if(!saved)return null;
   c=saved.character;result.room=room();return {room:result.room};
  }};
  return result;
 }
 function sheet(c){ctx.closeModal();openCharacterSheet(adapter(c),c.id);}
 function portrait(c){ctx.closeModal();portraitsDialog(adapter(c),false,c.id);}
 function remove(c){
  ctx.closeModal();ctx.modal('계정 원본 삭제',`<form id="account-delete" class="form-stack"><p><strong>${esc(c.profile.name)}</strong> 원본을 삭제합니다. 이미 참가한 세션의 캐릭터와 기록은 남습니다.</p><label>이름을 정확히 입력하세요<input name="confirmName" required autocomplete="off"></label><div class="entry-actions"><button class="danger">원본 삭제</button><button type="button" id="account-back">취소</button></div></form>`,()=>{
   document.getElementById('account-back').onclick=load;
   document.getElementById('account-delete').onsubmit=async e=>{e.preventDefault();if(await run('accountDelete',{id:c.id,version:c.version,confirmName:new FormData(e.target).get('confirmName')}))await load();};
  });
 }
 await load();
}
