import {createEffectCursor} from './combat-view.js';
const cursor=createEffectCursor();let queue=[],timer=null,currentRoom='',generation=0;
function surfaces(id){
 const safe=CSS.escape(id);
 return [...document.querySelectorAll(`.battle-strip [data-combat-person="${safe}"],.standing-portrait[data-person="${safe}"],.map-token[data-character="${safe}"]`)].filter(el=>{
  if(!el.getClientRects().length)return false;
  const r=el.getBoundingClientRect(),clip=el.closest('.battle-strip,#table-canvas')?.getBoundingClientRect();
  return !clip||(r.right>clip.left&&r.left<clip.right&&r.bottom>clip.top&&r.top<clip.bottom);
 });
}
function animate(el,kind){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 // Individual translate composes with portrait framing and the token's centered transform.
 const frames=kind==='attack'?[{translate:'0 0',filter:'brightness(1)'},{translate:'5px -2px',filter:'brightness(1.25)'},{translate:'0 0',filter:'brightness(1)'}]:
 kind==='hit'?[{translate:'0 0'},{translate:'-4px 0',filter:'brightness(1.6) sepia(.4)'},{translate:'4px 0'},{translate:'0 0'}]:
 [{opacity:1},{opacity:.45},{opacity:1}];
 el.animate(frames,{duration:kind==='hit'?320:400,easing:'ease-out'});
}
function label(el,text,kind){
 const main=document.querySelector('.main');if(!main||main.querySelector('#workspace-drawer:not([hidden])'))return;
 const rect=el.getBoundingClientRect(),bounds=main.getBoundingClientRect(),badge=document.createElement('span');
 badge.className='battle-impact '+kind;badge.textContent=text;
 badge.style.left=Math.max(45,Math.min(bounds.width-45,rect.left-bounds.left+rect.width/2))+'px';
 badge.style.top=Math.max(100,Math.min(bounds.height-32,rect.top-bounds.top+rect.height*.4))+'px';
 main.append(badge);setTimeout(()=>badge.remove(),900);
}
function play(e){
 const actors=surfaces(e.actorId),targets=surfaces(e.targetId);
 if(e.attack)actors.forEach(el=>animate(el,'attack'));
 const final=['applied','defended','miss'].includes(e.result);if(!final)return;
 const hit=e.result==='applied'&&e.damage>0;
 targets.forEach(el=>animate(el,hit?'hit':'defense'));
 const visible=targets.find(el=>el.matches('.standing-portrait,.map-token'))||targets[0];
 if(visible)label(visible,e.result==='applied'?(e.damage>0?'−'+e.damage+' HP':'피해 없음'):e.result==='defended'?'방어 성공':'빗나감',hit?'damage':'defense');
 const a=actors.find(el=>el.matches('.map-token')),t=targets.find(el=>el.matches('.map-token'));
 if(a&&t&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const main=document.querySelector('.main'),bounds=main.getBoundingClientRect(),from=a.getBoundingClientRect(),to=t.getBoundingClientRect();
  const x=from.left+from.width/2,y=from.top+from.height/2,dx=to.left+to.width/2-x,dy=to.top+to.height/2-y;
  const line=document.createElement('span');line.className='battle-direction';line.style.cssText=`left:${x-bounds.left}px;top:${y-bounds.top}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)}rad)`;main.append(line);setTimeout(()=>line.remove(),450);
 }
}
export function renderCombatEffects(room){
 if(currentRoom!==room?.id){currentRoom=room?.id;generation++;queue=[];clearTimeout(timer);timer=null;document.querySelectorAll('.battle-impact,.battle-direction').forEach(el=>el.remove());}
 const incoming=cursor(room);
 if(document.hidden||document.querySelector('#workspace-drawer:not([hidden])'))return;
 queue.push(...incoming);queue=queue.slice(-6);
 if(timer||!queue.length)return;
 const revision=generation;
 const next=()=>{if(revision!==generation)return;const e=queue.shift();if(e&&!document.hidden)play(e);timer=queue.length?setTimeout(next,650):null;};
 // Let the existing 120ms portrait crossfade finish before applying a hit effect.
 timer=setTimeout(next,160);
}
