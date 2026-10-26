import {ammoFits,ammoVariant,magazineCompatible} from './ammo-compatibility.js';
import {weaponLabel} from './equipment-labels.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reloadChoices(c,items){
 const w=c.combatProfile?.weapon;if(!w||w.kind==='melee')return [];
 const magazines=(c.assets?.magazines||[]).filter(m=>m.rounds>0&&magazineCompatible(w,m,items)).map(m=>({lootId:m.id,quantity:1,label:(items.find(i=>i.id===m.itemId)?.name||m.weaponName||'탄창')+' · '+ammoVariant(items.find(i=>i.id===m.ammoItemId))+' · '+m.rounds+'/'+m.capacity+'발'}));
 const loose=w.reloadStyle==='individual'?items.filter(i=>(c.assets?.items?.[i.id]||0)>0&&ammoFits(w,i,items)&&(!w.ammo||w.ammoItemId===i.id)).map(i=>({ammoItemId:i.id,quantity:Math.min(w.capacity-w.ammo,c.assets.items[i.id]),label:i.name+' · '+Math.min(w.capacity-w.ammo,c.assets.items[i.id])+'발 장전'})).filter(x=>x.quantity>0):[];
 return [...magazines,...loose];
}
export function openInventoryReload(context,c){
 const choices=reloadChoices(c,context.room.economy.items),w=c.combatProfile?.weapon;
 context.modal('재장전',`<form id="inventory-reload-form"><p>${esc(weaponLabel(c,w))} · 현재 ${w.ammo||0} / ${w.capacity||'—'}발</p>${choices.length?`<label>장전할 탄창·탄약<select name="choice">${choices.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('')}</select></label><p>교환한 탄창과 잔탄은 소지품에 보관합니다. 다른 탄종으로 교환할 때 약실의 기존 탄도 회수합니다.</p><button type="submit">재장전</button>`:'<p>장전 가능한 탄창·탄약이 없습니다. 탄창을 선택해 삽탄하거나 호환 탄약을 준비하세요.</p>'}</form>`,()=>{
  const form=document.getElementById('inventory-reload-form');form.onsubmit=async e=>{e.preventDefault();const choice=choices[Number(new FormData(form).get('choice'))];if(!choice)return;
   const submit=form.querySelector('button');if(submit.disabled)return;submit.disabled=true;
   try{if(await context.command('inventoryAction',{verb:'reload',reloadMode:'retain',characterId:c.id,lootId:choice.lootId||'',ammoItemId:choice.ammoItemId||'',quantity:choice.quantity}))context.closeModal();}finally{submit.disabled=false;}
  };
 });
}
