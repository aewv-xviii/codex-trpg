import {magazineGroups} from './magazine-view.js';
import {ammoFits,ammoVariant} from './ammo-compatibility.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function magazineRows(c,items){return magazineGroups(c,items).map(m=>{
 const item=items.find(i=>i.id===m.itemId),ammo=items.find(i=>i.id===m.ammoItemId);
 return {id:m.itemId,key:'mag:'+(m.id||m.itemId),lootId:m.id||'',magazine:m,kind:'gear',quantity:m.count,name:(item?.name||m.weaponName||'탄창')+' · '+(m.empty?'빈 탄창':ammoVariant(ammo)),location:'휴대 중',description:(m.cartridge||ammo?.cartridge||'등록된 전용 규격')+' · '+(m.weaponName||'전용 탄창'),subtitle:`${m.rounds} / ${m.capacity||'?'}발`,partial:!m.empty&&!m.full};
 });}
export function magazineEditor(c,items,m,{blocked=false,battle=false,ammoId='',open=false}={}){
 const options=items.filter(i=>ammoFits(m,i,items)&&(m.rounds?i.id===m.ammoItemId:(c.assets.items[i.id]||0)>0||i.id===m.ammoItemId));
 const chosen=options.find(i=>i.id===(m.rounds?m.ammoItemId:ammoId))||options.find(i=>(c.assets.items[i.id]||0)>0)||options[0];
 const id=chosen?.id||m.ammoItemId,reserve=c.assets.items[id]||0,total=m.rounds+reserve,max=Math.min(m.capacity||0,total),w=c.combatProfile?.weapon;
 const roundsAll=total+(c.assets.magazines||[]).filter(x=>x.id!==m.id&&x.ammoItemId===id).reduce((n,x)=>n+x.rounds,0)+[w,...(c.combatLoadout||[]).map(l=>l.weapon)].filter(x=>x?.ammoItemId===id).reduce((n,x)=>n+(x.ammo||0),0)+(c.heldMagazine?.ammoItemId===id?c.heldMagazine.rounds:0);
 const disabled=blocked||battle;
 return `<details class="magazine-editor" ${open?'open':''}><summary role="button">삽탄 <b data-magazine-count>${m.rounds} / ${m.capacity}발</b></summary>
 <label>탄종<select id="magazine-ammo" ${disabled||m.rounds?'disabled':''}>${options.map(i=>`<option value="${esc(i.id)}" ${i.id===id?'selected':''}>${esc(i.name)} · ${ammoVariant(i)} (${c.assets.items[i.id]||0}발)</option>`).join('')}</select></label>
 <div class="magazine-range-label"><span>비우기</span><span>채우기</span></div><input id="magazine-rounds" type="range" min="0" max="${max}" step="1" value="${m.rounds}" aria-label="탄창 장전량" aria-valuetext="${m.rounds} / ${m.capacity}발" data-total="${total}" data-capacity="${m.capacity}" data-item="${esc(m.itemId)}" data-loot="${esc(m.id||'')}" data-ammo="${esc(id)}" ${disabled||!max?'disabled':''}>
 <p data-magazine-reserve>탄창 ${m.rounds} / 사용 가능 ${total}발 · 남는 낱발 ${reserve}발</p><small>이 탄종 전체 보유 ${roundsAll}발 · 슬라이더를 놓으면 반영됩니다.</small>
 ${battle?'<p class="inventory-hint">전투 중에는 삽탄·재장전을 행동으로 선언하세요.</p>':m.rounds?'<p class="inventory-hint">탄종을 바꾸려면 먼저 0발로 비우세요.</p>':''}</details>`;
}
