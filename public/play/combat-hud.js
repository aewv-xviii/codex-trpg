import {combatants,combatCard,combatStatus,combatClock} from './combat-view.js';
import {planMarkup} from './combat-plans-view.js';
import {renderCombatEffects} from './combat-motion.js';
let resizeObserver;
let previousTurn='',previousRoom='',lastMarkup='',lastRoster='',rosterOpen=false;
export function renderCombat(context){
 const {room}=context,root=document.getElementById('combat-hud'),main=root?.closest('.main');if(!root)return;
 if(!resizeObserver){resizeObserver=new ResizeObserver(()=>{const height=Math.ceil(root.getBoundingClientRect().height);if(height>0)main?.style.setProperty('--battle-height',height+'px');});resizeObserver.observe(root);}
 const active=room?.campaign?.system==='gurps4'&&room.combat?.status==='active';
 if(previousRoom!==room?.id){rosterOpen=false;previousRoom=room?.id;previousTurn='';lastMarkup='';lastRoster='';}
 let panel=document.getElementById('battle-roster-panel');
 if(!panel){panel=document.createElement('section');panel.id='battle-roster-panel';panel.className='battle-roster-panel';panel.setAttribute('aria-label','전투 참가자');document.querySelector('.chat-panel')?.prepend(panel);}
 root.hidden=!active;main?.classList.toggle('in-combat',active);panel.hidden=!active||!rosterOpen;
 if(!active){main?.style.removeProperty('--battle-height');root.innerHTML='';lastMarkup='';lastRoster='';previousTurn='';renderCombatEffects(room);return;}
 const b=room.combat,people=combatants(room),turn=b.id+':'+b.round+':'+b.index+':'+(b.pending?.targetId||'');
 const markup=`<div class="battle-heading"><button type="button" class="battle-roster-toggle" aria-controls="battle-roster-panel" aria-expanded="${rosterOpen}" title="전체 참가자 상태 펼치기"><span class="battle-round">${b.round} 라운드</span><span class="battle-current" role="status"></span><small class="battle-reaction"></small></button></div><div class="battle-strip" role="list" aria-label="전투 순서" tabindex="0">${people.map(combatCard).join('')}</div><div class="battle-plans">${planMarkup(room,context.me)}</div>`;
 const scroll=root.querySelector('.battle-strip')?.scrollLeft||0,focused=document.activeElement?.className;
 const oldMeters=new Map([...root.querySelectorAll('[data-combat-person]')].map(el=>[el.dataset.combatPerson,el.querySelector('.battle-meter i')?.style.width]));
 root.className='battle-hud';
 if(lastMarkup!==markup){root.innerHTML=markup;lastMarkup=markup;root.querySelector('.battle-strip').scrollLeft=scroll;
  if(focused==='battle-strip')root.querySelector('.battle-strip').focus({preventScroll:true});
  if(focused==='battle-roster-toggle')root.querySelector('.battle-roster-toggle').focus({preventScroll:true});
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const el of root.querySelectorAll('[data-combat-person]')){const meter=el.querySelector('.battle-meter i'),before=oldMeters.get(el.dataset.combatPerson);if(before&&before!==meter.style.width)meter.animate([{width:before},{width:meter.style.width}],{duration:420,easing:'ease-out'});}
 }
 root.querySelector('.battle-current').textContent=(people.find(c=>c.id===b.order[b.index])?.name||'인물')+'의 차례';
 root.querySelector('.battle-current').title=root.querySelector('.battle-current').textContent;
 root.querySelector('.battle-reaction').textContent=b.pending?combatStatus(room):'';
 root.querySelector('.battle-reaction').title=root.querySelector('.battle-reaction').textContent;
 for(const button of root.querySelectorAll('[data-cancel-combat-plan]'))button.onclick=()=>context.command('combatPlan',{characterId:button.dataset.cancelCombatPlan,kind:'cancel'});
 root.querySelector('.battle-round').title=combatClock(b);
 root.querySelector('.battle-roster-toggle').onclick=()=>{rosterOpen=!rosterOpen;renderCombat(context);};
 const roster=`<header><strong>전투 참가자</strong><button type="button" aria-label="참가자 목록 닫기">×</button></header><div class="battle-roster-list" role="list" tabindex="0" aria-label="전체 참가자 상태">${people.map(combatCard).join('')}</div>`;
 if(lastRoster!==roster){const top=panel.querySelector('.battle-roster-list')?.scrollTop||0;panel.innerHTML=roster;panel.querySelector('.battle-roster-list').scrollTop=top;lastRoster=roster;}
 panel.querySelector('button').onclick=()=>{rosterOpen=false;renderCombat(context);root.querySelector('.battle-roster-toggle')?.focus();};
 panel.onkeydown=e=>{if(e.key==='Escape'){rosterOpen=false;renderCombat(context);root.querySelector('.battle-roster-toggle')?.focus();}};
 if(turn!==previousTurn){const el=root.querySelector('.is-reacting')||root.querySelector('.is-current'),strip=root.querySelector('.battle-strip');if(el)strip.scrollLeft=Math.max(0,el.offsetLeft-strip.offsetLeft-strip.clientWidth/2+el.offsetWidth/2);previousTurn=turn;}
 const help=document.getElementById('compose-help');if(help&&context.composeKind==='action')help.textContent=b.pending?'방어할 행동을 입력하세요. GM이 해석하고 서버가 판정합니다.':'행동을 입력하면 GM이 해석하고 서버가 판정합니다.';
 renderCombatEffects(room);
}
