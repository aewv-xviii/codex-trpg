import {conditionLabels,conditionBadges} from './conditions-view.js';
import {portraitMarkup} from './portrait-crop.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const people=room=>[...room.characters,...room.characters.flatMap(c=>c.aquarium?.fish||[])];
const statusNames={unconscious:'의식 없음',dead:'사망',dying:'치명상',withdrawn:'이탈'};
export function combatants(room){
 const b=room?.combat;if(!b)return [];
 return [...(b.order||[]),...Object.keys(b.fighters).filter(id=>b.fighters[id].summon)].flatMap((id,index)=>{
  const c=people(room).find(c=>c.id===id),f=b.fighters[id];if(!c||!f)return [];
  const states=conditionLabels(c,f);
  return [{id,offMap:c.offMapPosition,name:c.name,hp:c.hp,maxHp:c.maxHp,percent:Number.isFinite(c.hp)&&c.maxHp>0?Math.max(0,Math.min(100,c.hp/c.maxHp*100)):0,
   portrait:c.portraits?.find(p=>p.id===c.expressionId)||c.portraits?.[0],team:f.team==='party'?'party':'enemy',
   badges:conditionBadges(c,f,{limit:3,overflowLabel:'…'}),current:index===b.index,reacting:b.pending?.targetId===id,states}];
 });
}
export function combatCard(c){
 const health=Number.isFinite(c.hp)&&Number.isFinite(c.maxHp)?`${c.hp} / ${c.maxHp}`:'—';
 return `<div class="battle-person ${c.team} ${c.current?'is-current':''} ${c.reacting?'is-reacting':''}" data-combat-person="${esc(c.id)}" role="listitem" ${c.current?'aria-current="step"':''}>
 <span class="battle-avatar">${c.portrait?portraitMarkup(c.portrait,'','token'):esc(c.name.slice(0,1))}</span>
 <div class="battle-vitals"><div class="battle-name"><b title="${esc(c.name)}">${esc(c.name)}</b><small>${c.reacting?'방어 대기':c.current?'현재':c.team==='party'?'아군':'적'}</small></div>
 <div class="battle-hp"><span title="${esc(c.offMap?c.offMap.label+' · 약 '+c.offMap.distanceYards+'yd':'HP')}">${c.offMap?'밖 '+c.offMap.distanceYards+'yd':'HP'}</span><strong>${health}</strong></div><span class="battle-meter" aria-hidden="true"><i style="width:${c.percent}%"></i></span>
 <span class="battle-condition">${c.badges||''}</span></div></div>`;
}
export function combatStatus(room){
 const b=room.combat,person=id=>people(room).find(c=>c.id===id)?.name||'인물';
 if(b.pending?.kind==='critical')return 'GM 특수 판정 중';
 if(b.pending)return person(b.pending.targetId)+' · 방어 대기';
 return person(b.order[b.index])+'의 차례';
}
export function combatClock(b){return `${b.round}라운드 · ${b.elapsedSeconds||0}초 경과 · 1턴 ${b.roundSeconds===6?6:1}초`;}
export function battlePair(room){
 const b=room?.combat;if(!b)return null;
 if(b.pending?.actorId)return [b.pending.actorId,b.pending.targetId];
 const events=(room.messages||[]).filter(m=>m.combatId===b.id&&!m.recipient&&m.channel!=='admin'&&m.combatDetails?.event?.actorId);
 const e=events.at(-1)?.combatDetails?.event;
 if(e&&e.actorId===b.order[b.index])return [e.actorId,e.targetId];
 const actor=b.order[b.index],target=b.order.find(id=>b.fighters[id].team!==b.fighters[actor]?.team);
 return [actor,target];
}
// Only structured, public, server-confirmed results can produce effects.
export function visualEvents(room){
 const groups=new Map();
 for(const m of room?.messages||[]){
  const e=m.combatDetails?.event;
  if(m.type!=='combat'||m.recipient||m.channel==='admin'||m.combatId!==room.combat?.id||!e?.actorId||!e.targetId||!e.attackId||e.result==='preparation')continue;
  if(!room.characters.some(c=>c.id===e.actorId)||!room.characters.some(c=>c.id===e.targetId))continue;
  const key=m.combatId+':'+e.attackId;
  const value=groups.get(key)||{key,actorId:e.actorId,targetId:e.targetId,at:m.at,result:e.result};
  if(e.phase==='hit')value.result=e.result;
  if(m.combatDetails.impact){value.result='applied';value.damage=(value.damage||0)+m.combatDetails.impact.damage;value.impact={...m.combatDetails.impact,damage:value.damage,hpBefore:value.impact?.hpBefore??m.combatDetails.impact.hpBefore};}
  value.at=m.at;groups.set(key,value);
 }
 return [...groups.values()];
}
export function createEffectCursor(){
 let roomId,known=new Map();
 return (room,now=Date.now())=>{
  const events=visualEvents(room),next=new Map(events.map(e=>[e.key,e.result]));
  if(roomId!==room?.id){roomId=room?.id;known=next;return [];}
  const changed=events.filter(e=>known.get(e.key)!==e.result&&now-Date.parse(e.at)<30000&&now-Date.parse(e.at)>=-5000)
   .map(e=>({...e,attack:!known.has(e.key)}));
  known=next;return changed.slice(-6);
 };
}
