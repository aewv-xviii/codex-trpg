import {center,findPath,index} from './exploration-geometry.js';
import {canControl} from './character-control.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function explorationMarkup(m){
 if(!m?.exploration)return '';
 const seen=new Set(m.explorationView?.visible||[]),known=new Set(m.explorationView?.explored||[]);
 const fog=Array.from({length:m.columns*m.rows},(_,i)=>seen.has(i)?'':`<rect x="${i%m.columns}" y="${Math.floor(i/m.columns)}" width="1.02" height="1.02" fill="${known.has(i)?'#080e14':'#060a10'}" opacity="${known.has(i)?.65:.98}"/>`).join('');
 const walls=m.exploration.walls.map(w=>`<line x1="${w.a.x*m.columns}" y1="${w.a.y*m.rows}" x2="${w.b.x*m.columns}" y2="${w.b.y*m.rows}" class="${w.door?(w.open?'open-door':'closed-door'):'explore-wall'}"/>`).join('');
 const doors=m.exploration.walls.filter(w=>w.door).map(w=>`<button class="explore-object door ${w.open?'is-open':''}" data-explore-door="${w.id}" style="left:${(w.a.x+w.b.x)*50}%;top:${(w.a.y+w.b.y)*50}%" aria-label="${esc(w.name)} ${w.open?'열림':'닫힘'}"><span>${w.open?'▱':'▯'}</span></button>`).join('');
 const points=m.exploration.points.map(p=>`<button class="explore-object clue ${p.completed?'is-done':''}" data-explore-point="${p.id}" style="left:${p.x*100}%;top:${p.y*100}%" aria-label="${esc(p.name)}"><span>${p.completed?'✓':'◇'}</span><small>${esc(p.name)}</small></button>`).join('');
 return `<svg class="explore-fog" viewBox="0 0 ${m.columns} ${m.rows}" preserveAspectRatio="none" aria-hidden="true">${fog}${walls}</svg>${doors}${points}<svg id="explore-route" viewBox="0 0 ${m.columns} ${m.rows}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
}
export function previewRoute(m,t,to){
 const svg=document.getElementById('explore-route');if(!svg)return;
 const path=findPath(m,t,to);svg.innerHTML=path?`<polyline points="${[t,...path].map(p=>`${p.x*m.columns},${p.y*m.rows}`).join(' ')}"/><circle cx="${to.x*m.columns}" cy="${to.y*m.rows}" r=".18"/>`:'';
 let out=document.getElementById('route-status');if(!out){out=document.createElement('div');out.id='route-status';out.className='route-status';out.setAttribute('role','status');document.getElementById('map-scroll').append(out);}out.textContent=path?`${path.length}칸 · ${path.length*m.exploration.secondsPerCell}초 · 놓아서 이동 요청`:'문이나 벽에 막힌 경로';
}
export function openExplorationObject(ctx,type,id,selected){
 const r=ctx.room,m=r.maps.find(m=>m.id===r.mapId);if(!m?.exploration)return;
 const chars=r.characters.filter(c=>canControl(c,ctx.me)&&m.tokens.some(t=>t.characterId===c.id));
 if(!chars.length)return ctx.toast('조작할 캐릭터가 없습니다.');
 const chosen=chars.find(c=>c.id===ctx.activeCharacter?.()?.id)?.id||chars.find(c=>c.id===m.tokens.find(t=>t.id===selected)?.characterId)?.id||chars[0].id;
 const selector=chars.length===1?`<input type="hidden" name="characterId" value="${chosen}">`:`<label>행동할 인물<select name="characterId">${chars.map(c=>`<option value="${c.id}" ${c.id===chosen?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`;
 const point=m.exploration.points.find(p=>p.id===id),door=m.exploration.walls.find(w=>w.id===id),npc=r.characters.find(c=>c.id===id);
 const item=type==='point'?point:type==='door'?door:npc;if(!item)return;
 if(type==='npc')return ctx.beginDialogue(id,chosen);
 if(type==='door')return ctx.command('exploreInteract',{characterId:chosen,targetId:id,verb:door.open?'close':'open'});
 let content='';
 if(type==='point')content=`<p>${esc(point.description)}</p><div class="explore-cost">${point.completed?'조사 완료':`${point.minutes}분 · ${point.mode==='skill'?'시트 기능 판정':point.mode==='gm'?'GM 검토':'직접 조사'}`}</div>${point.mode==='gm'?'<label>조사 방법<textarea name="text" maxlength="2000" placeholder="어디를 어떻게 살피나요?" required></textarea></label>':''}<button class="primary" ${point.completed?'disabled':''}>${point.completed?'기록에 저장됨':'조사하기'}</button>`;
 if(type==='door')content=`<p>${door.open?'열려 있는 문':'닫혀 있는 문'}</p><button class="primary">${door.open?'닫기':'열기'}</button>`;

 ctx.modal(item.name,`<form id="explore-form" class="form-stack">${selector}${content}</form>`,()=>{
  document.getElementById('explore-form').onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));
   const result=await ctx.command('exploreInteract',{...p,targetId:id,verb:type==='door'?(door.open?'close':'open'):'inspect'});
   if(result)ctx.closeModal();
  };
 });
}
