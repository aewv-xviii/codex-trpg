import {canControl} from './character-control.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function planMarkup(room,me){
 return room.characters.filter(c=>canControl(c,me)&&room.combat?.fighters[c.id]?.plan).map(c=>{
  const f=room.combat.fighters[c.id],p=f.plan,ongoing=['queued','paused'].includes(p.status);
  const progress=p.kind==='reload'&&f.reload?` · ${f.reload.progress}/${f.reload.seconds||c.combatProfile.weapon.reloadTurns} Ready`:'';
  const status={queued:p.kind==='counterattack'?'방어 성공 후 다음 자기 턴 대기':'자기 차례마다 계속',paused:'중단',completed:'완료',cancelled:'취소'}[p.status]||p.status;
  return `<div class="battle-plan" role="status"><span><b>${esc(c.name)} · ${p.kind==='reload'?'재장전':'Counterattack'}</b> ${esc(status)}${progress}${p.reason?` · ${esc(p.reason)}`:''}</span>${ongoing?`<button type="button" data-cancel-combat-plan="${esc(c.id)}">예약 취소</button>`:''}</div>`;
 }).join('');
}
