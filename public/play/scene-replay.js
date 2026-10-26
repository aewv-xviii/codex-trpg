import {sceneSegments,recordedScene} from './scene-records.js';
import {stageMarkup,sceneChevron} from './presentation.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const edgeIcon=last=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${last?'M19 5v14M7 5l7 7-7 7':'M5 5v14M17 5l-7 7 7 7'}"/></svg>`;
export function replayList(room,filter={}){
 const groups=sceneSegments(room,filter);
 return groups.length?`<div class="scene-record-list">${groups.map(g=>`<button class="scene-record" data-replay="${esc(g.id)}"><span class="record-time">${esc(g.time||'—')}<small>${esc(g.phase)}</small></span><span><b>${esc(g.title)}</b><small>${esc(room.chronicle.cases.find(c=>c.id===g.caseId)?.title||'자유 활동')} · ${g.messages.length}개 기록</small></span><span aria-hidden="true">›</span></button>`).join('')}</div>`:'<p class="empty-note">이 날짜의 플레이 기록이 없습니다.</p>';
}
export function replayDialog(ctx,id){
 // Freeze this viewer's archive only. Polling and other participants keep playing.
 const room=structuredClone(ctx.room),group=sceneSegments(room).find(g=>g.id===id);if(!group)return;
 let index=0,mode='scene';
 ctx.modal('플레이 기록', '<div id="scene-replay" class="scene-replay"></div>',()=>{
  const root=document.getElementById('scene-replay');document.getElementById('modal').classList.add('replay-modal');
  const close=()=>{document.getElementById('modal').classList.remove('replay-modal');ctx.closeModal();};
  const paint=()=>{
   const m=group.messages[index],view=recordedScene(room,m);
   root.innerHTML=`<header class="replay-heading"><div><small>${esc(group.date||'날짜 미기록')} · ${esc(m.gameClock?.time||'시각 미기록')} · ${esc(group.phase)}</small><h3>${esc(group.title)}</h3><p>${esc(room.chronicle.cases.find(c=>c.id===group.caseId)?.title||'자유 활동')}</p></div><button data-replay-return>현재 플레이로 돌아가기</button></header><nav class="replay-modes" aria-label="복기 방식"><button data-replay-mode="scene" aria-pressed="${mode==='scene'}">장면</button><button data-replay-mode="text" aria-pressed="${mode==='text'}">대화 기록</button><span>복기 중</span></nav>${mode==='scene'?stageMarkup(view):`<div class="replay-transcript">${group.messages.map((m,i)=>`<button data-replay-line="${i}"><small>${esc(m.gameClock?.time||'—')} · ${esc(m.name)}</small><p>${esc(m.text)}</p></button>`).join('')}</div>`}${mode==='scene'?`<footer class="replay-controls" aria-label="장면 넘기기"><button class="scene-arrow" data-replay-edge="first" aria-label="처음 대사" title="처음 대사" ${index===0?'disabled':''}>${edgeIcon(false)}</button><button class="scene-arrow" data-replay-step="-1" aria-label="이전 대사" title="이전 대사" ${index===0?'disabled':''}>${sceneChevron(-1)}</button><button class="scene-arrow" data-replay-step="1" aria-label="다음 대사" title="다음 대사" ${index===group.messages.length-1?'disabled':''}>${sceneChevron(1)}</button><button class="scene-arrow" data-replay-edge="last" aria-label="마지막 대사" title="마지막 대사" ${index===group.messages.length-1?'disabled':''}>${edgeIcon(true)}</button></footer>`:''}${view._missingScene?'<p class="replay-note">당시 이미지 미기록 · 텍스트로 보관된 장면입니다.</p>':''}${room.owner===ctx.me.id&&group.messages.some(m=>!m.sceneSnapshotId)?legacyForm(room,group):''}`;
  };
  root.onclick=e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.hasAttribute('data-replay-return')){close();ctx.openScene?.();return;}
   if(b.dataset.replayMode){mode=b.dataset.replayMode;paint();}
   if(b.dataset.replayEdge){index=b.dataset.replayEdge==='first'?0:group.messages.length-1;paint();}
   if(b.dataset.replayStep){index=Math.max(0,Math.min(group.messages.length-1,index+Number(b.dataset.replayStep)));paint();}
   if(b.dataset.replayLine){index=Number(b.dataset.replayLine);mode='scene';paint();}
  };
  root.onsubmit=async e=>{e.preventDefault();const form=e.target;if(!form.matches('[data-legacy-scene]'))return;
   const p=Object.fromEntries(new FormData(form));p.from=group.messages[0].sourceMessageId||group.messages[0].id;p.to=group.messages.at(-1).sourceMessageId||group.messages.at(-1).id;
   form.querySelector('button').disabled=true;
   if(await ctx.command('linkLegacyScene',p)){close();ctx.toast('기존 기록의 장소와 배경을 연결했습니다.');}
   else form.querySelector('button').disabled=false;
  };
  paint();
 });
}
function legacyForm(room,group){
 const places=room.worldLibrary?.definition?.places||[];if(!places.length)return '';
 return `<details class="replay-legacy"><summary>GM · 기존 기록의 장소·배경 연결</summary><form data-legacy-scene><label>장소<select name="placeId">${places.map(p=>`<option value="${esc(p.id)}" ${p.id===group.placeId||p.name===group.title?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>배경<select name="background"><option value="">이미지 없음</option><option value="/play/alley.png">기존 테스트 배경</option></select></label><p>이 구간의 미기록 장면에만 적용합니다. 당시 초상화는 복원하지 않습니다.</p><button type="submit">기록에 연결</button></form></details>`;
}
