import {containerPanel,loadPanel} from './open-world.js';
import {openInventoryReload} from './inventory-reload.js';
import {magazineRows,magazineEditor} from './magazine-editor.js';
import {labeledItem,weaponLabel} from './equipment-labels.js';
import {itemIcon,itemKind,locationOf,baseHere,looseHere} from './item-view.js';
import {ammoVariant} from './ammo-compatibility.js';
import {canControl} from './character-control.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=v=>Number(v||0).toLocaleString('ko-KR')+'원';
let lastPage='';
let context,view='pack',selection='',filter='',shopId='',lastCharacter='',lastRoom='',quantityDraft='1',ammoDraft='',sliderBusy=false;
const button=(verb,label,extra='',disabled=false)=>`<button type="button" data-inventory-action="${verb}" ${extra} ${disabled?'disabled':''}>${label}</button>`;
const countInput=(max=99999)=>`<label class="inventory-quantity">수량<input id="inventory-quantity" type="number" value="${esc(quantityDraft)}" min="1" max="${Math.max(1,max)}" step="1" aria-label="물품 수량"></label>`;
const art=i=>`<span class="item-art">${itemIcon(i)}</span>`;
function rows(r,c){
 const catalog=id=>{const i=r.economy.items.find(i=>i.id===id)||{id,name:id,kind:'gear'};return view==='shop'?i:labeledItem(c,i);};
 if(view==='nearby')return [...(r.groundMagazines||[]).filter(g=>g.ownerId===c.id&&g.placeId===locationOf(r,c.id)&&g.mapId===(r.mapId||'')).map(g=>({id:g.magazine.itemId,key:'groundmag:'+g.id,lootId:g.id,name:(g.magazine.weaponName||'')+' 탄창',kind:'gear',quantity:1,verb:'recoverMagazine',location:'현장 탄창',description:g.magazine.rounds+'발'})),...(r.looseWeapons||[]).filter(x=>looseHere(r,c,x)||!x.recovered&&x.ownerId===c.id&&x.placeId===locationOf(r,c.id)&&x.mapId===r.mapId).map(x=>({...catalog(x.itemId),key:'loose:'+x.id,lootId:x.id,quantity:1,verb:'recover',location:x.located?'투척 무기':'투척 무기 · 위치 확인 필요'})),...(r.groundItems||[]).filter(x=>x.quantity>0&&x.placeId===locationOf(r,c.id)&&x.mapId===r.mapId&&x.ownerId===c.id).map(x=>({...catalog(x.itemId),key:'ground:'+x.id,lootId:x.id,quantity:x.quantity,verb:'pickup',location:'내려놓은 물품'}))];
 if(view==='shop')return (r.economy.shops.find(x=>x.id===shopId)?.offers||[]).map(o=>({...catalog(o.itemId),...o,key:o.itemId,quantity:o.stock,location:'상점 재고'}));
 const ordinary=Object.entries((view==='base'?c.assets?.storedItems:c.assets?.items)||{}).filter(([,n])=>n>0).map(([id,n])=>({...catalog(id),key:id,quantity:view==='pack'?Math.max(0,n-(c.assets?.containers||[]).reduce((sum,b)=>sum+(b.items[id]||0),0)):n,location:view==='base'?'거점 보관':'휴대 중'}));
 if(view!=='pack')return ordinary;
 return [...ordinary.filter(i=>!i.magazineSpec&&i.quantity>0),...magazineRows({...c,assets:{...c.assets,items:Object.fromEntries(ordinary.map(i=>[i.id,i.quantity]))}},r.economy.items),...(c.heldMagazine?[{id:c.heldMagazine.itemId,key:'held:'+c.heldMagazine.id,name:'손에 든 탄창',kind:'gear',quantity:1,held:true,lootId:c.heldMagazine.id,location:'보관 대기',description:c.heldMagazine.rounds+'발'}]:[])];
}
function equipped(r,c,battle,blocked){const w=c.combatProfile?.weapon;if(!w)return '';
 const f=r.combat?.fighters?.[c.id],reload=f?.reload;
 return `<section class="inventory-equipped">${art({name:w.name})}<div><small>현재 장비</small><strong>${esc(weaponLabel(c,w))}</strong><span>${w.kind==='firearm'?`장전 ${w.ammo??0} / ${w.capacity??'—'} · ${esc(ammoVariant(r.economy.items.find(i=>i.id===w.ammoItemId)))} · `:''}${battle?(f?.dropped?'준비 필요':reload?`탄창 교체 ${reload.progress}/${reload.seconds||w.reloadTurns}`:'전투 중'):'휴대 장비'}</span></div>${w.kind!=='melee'?`<button type="button" data-inventory-reload-picker ${blocked||battle?'disabled':''}>재장전</button>`:''}${!battle||f?.dropped?button('ready',battle?'무기 준비':'무기 꺼내기','',blocked):''}</section>`;
}
export function inventoryPage(ctx,c){
 context=ctx;if(lastPage!==ctx.page){view=ctx.page==='economy'?'shop':'pack';selection='';filter='';lastPage=ctx.page;}const r=ctx.room,e=r.economy,battle=r.combat?.status==='active',host=r.owner===ctx.me.id;
 if(lastCharacter!==c?.id||lastRoom!==r.id){selection='';filter='';quantityDraft='1';lastCharacter=c?.id;lastRoom=r.id;}
 const chars=r.characters.filter(x=>r.partyCharacterIds.includes(x.id)&&canControl(x,ctx.me));
 if(!c)return '<section class="inventory-desk"><h2>소지품</h2><p>조작할 파티 캐릭터가 없습니다.</p></section>';
 const pending=['queued','running'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'),turn=battle&&!r.combat.pending&&r.combat.order[r.combat.index]===c.id;
 const readOnly=!canControl(c,ctx.me)||!r.partyCharacterIds.includes(c.id);
 const blocked=readOnly||pending||!c.assets?.confirmed||(battle&&!turn),home=baseHere(r,c),base=e.bases?.[c.id];
 const shops=e.shops.filter(s=>s.enabled&&(!s.worldLibraryId||s.placeId===locationOf(r,c.id)));
 if(ctx.inventoryShopId&&shops.some(s=>s.id===ctx.inventoryShopId))shopId=ctx.inventoryShopId;
 if(!shops.some(s=>s.id===shopId))shopId=shops[0]?.id||'';
 const shop=shops.find(s=>s.id===shopId),visit=e.visits?.[c.id]||e.visit,clock=r.chronicle?.clock,now=clock?Date.parse(clock.date+'T'+clock.time+'Z'):0;
 const here=shop&&visit?.shopId===shop.id&&visit.caseId===(r.chronicle.activeCaseId||'')&&now>=visit.arrivedAt&&now<visit.expiresAt&&(shop.worldLibraryId?shop.placeId===locationOf(r,c.id):visit.mapId===r.mapId);
 const all=rows(r,c),visible=all.filter(i=>(i.name+' '+(i.baseName||'')).toLowerCase().includes(filter.toLowerCase()));
 if(!visible.some(i=>i.key===selection)){selection=visible.find(i=>i.magazine?.ids?.some(id=>'mag:'+id===selection))?.key||visible[0]?.key||'';quantityDraft='1';}
 const chosen=visible.find(i=>i.key===selection);const title={bags:'가방',pack:'소지품',nearby:'주변 물품',shop:'상점',base:'거점'}[view];
 const waiting=readOnly?'열람 전용':pending?'앞선 행동 처리 중':battle&&!turn?'현재 차례를 기다리는 중':!c.assets?.confirmed?'시작 자산 미확정':'';
 let actions='';
 if(chosen){
  const i=chosen,data=`data-item="${esc(i.id)}" data-loot="${esc(i.lootId||'')}"`;
  if(view==='pack'&&i.magazine)actions=magazineEditor(c,e.items,i.magazine,{blocked:blocked||sliderBusy,battle,ammoId:ammoDraft,open:document.querySelector('.magazine-editor')?.open||false});
  else if(view==='pack'&&i.held)actions=button('stowMagazine','보관',data,blocked);
  else if(view==='shop')actions=countInput(Math.max(i.stock,c.assets.items[i.id]||0))+`<div class="inventory-trade"><span>구매 ${won(i.price)}</span><span>판매 ${i.sellPrice?won(i.sellPrice):'매입 안 함'}</span></div>`+button('buy','구매',data,blocked||battle||!here||i.stock<1)+button('sell','판매',data,blocked||battle||!here||!i.sellPrice||!c.assets.items[i.id]);
  else if(view==='nearby')actions=countInput(i.quantity)+button(i.verb,battle&&r.combat.fighters[c.id]?.recovering===i.lootId?'회수 마무리':i.location.includes('확인 필요')?'찾아 회수':'회수',data,blocked||(battle&&i.verb==='pickup'));
  else if(view==='base')actions=countInput(i.quantity)+button('take','가져오기',data,blocked||battle||!home);
  else {
   actions=countInput(i.quantity)+(i.kind==='consumable'&&!i.food?button('use','사용',data,blocked||battle):'')+button('store','거점에 보관',data,blocked||battle||!home)+button('drop','내려놓기',data,blocked||battle);
   const w=c.combatProfile?.weapon;if(w&&w.kind!=='melee'&&i.id===(w.inventoryItemId||w.itemId||w.id))actions=`<button type="button" data-inventory-reload-picker ${blocked||battle?'disabled':''}>재장전</button>`+actions;
   const others=r.characters.filter(x=>x.id!==c.id&&r.partyCharacterIds.includes(x.id)&&x.assets?.confirmed&&locationOf(r,x.id)===locationOf(r,c.id));
   if(others.length)actions+=`<label>전달할 일행<select id="inventory-recipient">${others.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>`+button('give','전달',data,blocked||battle);
  }
 }
 return `<section class="inventory-desk" data-character="${esc(c.id)}"><header class="inventory-header"><div><small>${esc(c.name)}</small><h2>${ctx.page==='inventory'&&view==='pack'?'소지품':esc(title)}</h2></div><label class="inventory-character"><span class="sr-only">조작할 캐릭터</span>${readOnly?`<span>${esc(c.name)}</span>`:`<select id="economy-character">${chars.map(x=>`<option value="${esc(x.id)}" ${x.id===c.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`}<strong>${c.assets?.confirmed?won(c.assets.won):'자산 미확정'}</strong></label></header>
 ${ctx.page==='economy'?'':`<nav class="inventory-tabs" aria-label="물품 보관 위치">${[['pack','휴대품'],['bags','가방'],['nearby','주변'],['base','보관함']].map(([id,label])=>`<button type="button" data-inventory-tab="${id}" aria-pressed="${view===id}">${label}</button>`).join('')}</nav>`}
 ${ctx.page==='inventory'?equipped(r,c,battle,blocked):''}${waiting?`<p class="inventory-notice" role="status">${waiting}</p>`:''}
 ${view==='shop'?`<div class="inventory-location"><label><span class="sr-only">상점</span><select id="inventory-shop">${shops.map(s=>`<option value="${esc(s.id)}" ${s.id===shopId?'selected':''}>${esc(s.name)}</option>`).join('')||'<option>이 장소에 등록된 상점 없음</option>'}</select></label>${shop?here?'<span>방문 중</span>'+`<button data-economy="leave">나가기</button>`:`<button data-economy="visit" data-id="${esc(shop.id)}" ${blocked||battle||(!host&&!shop.worldLibraryId)?'disabled':''}>들어가기</button>`:''}${here&&shop.npcId?`<button data-economy="talk" data-id="${esc(shop.id)}">대화</button>`:''}</div>`:''}
 ${view==='base'?`<div class="inventory-location"><div><strong>${esc(base?.name||'거점 미연결')}</strong><small>${base?(home?'현재 거점 · 보관함 이용 가능':'보관품 열람 · 거점에서 가져올 수 있음'):'기존 보관품은 유지됩니다.'}</small></div>${home?button('rest','10분 휴식','',blocked||battle):''}${host?`<button data-inventory-base ${blocked||battle?'disabled':''}>${base?'거점 위치 변경':'현재 장소를 거점으로'}</button>`:''}</div>`:''}
 ${ctx.page==='inventory'?loadPanel(ctx,c):''}
 ${view==='bags'?containerPanel(ctx,c):`<div class="inventory-browser"><section class="inventory-list-pane"><label class="inventory-search"><span class="sr-only">물품 검색</span><input id="inventory-search" type="search" placeholder="물품 찾기" value="${esc(filter)}" autocomplete="off"></label><div class="inventory-list" aria-label="${title}">${visible.map(i=>`<button type="button" class="inventory-row" data-inventory-select="${esc(i.key)}" aria-current="${i.key===selection}">${art(i)}<span><strong>${esc(i.name)}</strong><small>${esc(i.subtitle||itemKind(i))}${view==='shop'?' · '+won(i.price):''}</small></span><b>${i.partial?'':i.kind==='ammo'?i.quantity+'발':'×'+i.quantity}</b></button>`).join('')||`<p class="inventory-empty">${filter?'검색 결과가 없습니다.':view==='nearby'?'확인된 주변 물품이 없습니다.':'등록된 물품이 없습니다.'}</p>`}</div></section>
 <section class="inventory-detail" aria-label="물품 상세">${chosen?`${art(chosen)}<small>${esc(chosen.location)}</small><h3>${esc(chosen.name)}</h3>${chosen.baseName&&chosen.baseName!==chosen.name?`<p>원래 장비: ${esc(chosen.baseName)}</p>`:''}<p>${itemKind(chosen)} · ${view==='shop'?'보유 '+(c.assets.items[chosen.id]||0)+' / 재고 ':''}${chosen.kind==='ammo'?chosen.quantity+'발':chosen.quantity+'개'}</p>${chosen.description?`<p>${esc(chosen.description)}</p>`:''}${Number.isFinite(chosen.weightKg)?`<p>개당 ${chosen.weightKg} kg</p>`:''}<div class="inventory-actions">${actions}${chosen.food&&view==='pack'?`<button data-world-plan="eat" data-character="${esc(c.id)}" data-id="${esc(chosen.id)}" ${blocked||battle?'disabled':''}>식사 · ${chosen.food.minutes}분</button>`:''}</div>${battle?'<p class="inventory-hint">전투 행동은 현재 차례와 준비 시간을 적용합니다.</p>':''}`:'<div class="inventory-empty">물품을 선택하면 여기에 표시됩니다.</div>'}</section></div>`}
 ${ctx.page==='inventory'?`<details class="inventory-fold"><summary>전투 수치</summary><button type="button" data-inventory-combat>전투 수치 보기</button><button type="button" data-inventory-sheet>캐릭터 시트</button></details>`:''}
 <details class="inventory-fold"><summary>거래 · 물품 기록</summary>${e.ledger.filter(x=>!x.characterId||x.characterId===c.id).slice(-15).reverse().map(x=>`<article><small>${esc(x.gameClock?.date||'')} ${esc(x.gameClock?.time||'')}</small><p>${esc(x.description)}</p></article>`).join('')||'<p>기록 없음</p>'}</details>
 ${host?'<details class="inventory-fold"><summary>물품 관리</summary><div class="entry-actions"><button data-economy="assets">시작 자산 확정</button><button data-economy="adjust">자산 정정</button><button data-economy="alias">별칭 설정</button><button data-economy="shop">상점 추가</button><button data-economy="item">물품 추가</button><button data-economy="magazine">탄창 규격 등록</button></div></details>':''}</section>`;
}
document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-inventory-tab]');if(tab){view=tab.dataset.inventoryTab;selection='';filter='';quantityDraft='1';context.render();return;}
 const row=e.target.closest('[data-inventory-select]');if(row){selection=row.dataset.inventorySelect;quantityDraft='1';ammoDraft='';context.render();return;}
 const root=e.target.closest('.inventory-desk');if(!root||!context)return;
 if(e.target.closest('[data-inventory-combat]'))return context.openCombatProfile?.(root.dataset.character);
 if(e.target.closest('[data-inventory-sheet]'))return context.openSheet?.(root.dataset.character);
 const characterId=root.dataset.character,c=context.room.characters.find(c=>c.id===characterId);
 if(e.target.closest('[data-inventory-base]')){
  context.modal('거점 연결',`<form id="inventory-base-form"><p>현재 장소에 이 캐릭터의 보관함을 연결합니다. 기존 보관품은 유지됩니다.</p><label>캐릭터<select name="characterId">${context.room.characters.filter(x=>context.room.partyCharacterIds.includes(x.id)&&x.assets?.confirmed).map(x=>`<option value="${esc(x.id)}" ${x.id===characterId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>거점 이름<input name="name" maxlength="80" value="${esc(context.room.economy.bases?.[characterId]?.name||'주거지')}" required></label><button type="submit">연결</button></form>`,()=>{document.getElementById('inventory-base-form').onsubmit=async ev=>{ev.preventDefault();const data=new FormData(ev.currentTarget),name=data.get('name'),target=data.get('characterId');if(await context.command('setInventoryBase',{characterId:target,name}))context.closeModal();};});return;
 }
 const reloadButton=e.target.closest('[data-inventory-reload-picker]');if(reloadButton){if(!reloadButton.disabled&&c.combatProfile?.weapon)return openInventoryReload(context,c);return;}
 const b=e.target.closest('[data-inventory-action]');if(!b||b.disabled)return;
 const verb=b.dataset.inventoryAction,shop=context.room.economy.shops.find(s=>s.id===shopId),offer=shop?.offers.find(o=>o.itemId===b.dataset.item);
 const quantity=b.dataset.quantity?Number(b.dataset.quantity):verb==='rest'?10:['reload','unload','fillMagazine','emptyMagazine'].includes(verb)?Number(document.getElementById('inventory-rounds')?.value||1):Number(document.getElementById('inventory-quantity')?.value||1);
 await context.command('inventoryAction',{verb,reloadMode:'retain',ammoItemId:b.dataset.ammo||'',characterId:c.id,itemId:b.dataset.item||'',lootId:b.dataset.loot||'',quantity,shopId:shopId||'',targetId:document.getElementById('inventory-recipient')?.value||'',expectedUnitPrice:verb==='buy'?offer?.price:verb==='sell'?offer?.sellPrice:0});
});
document.addEventListener('input',e=>{if(e.target.id==='inventory-quantity'){quantityDraft=e.target.value;return;}if(e.target.id==='magazine-rounds'){const x=e.target,n=Number(x.value),root=x.closest('.magazine-editor');root.querySelector('[data-magazine-count]').textContent=n+' / '+x.dataset.capacity+'발';x.setAttribute('aria-valuetext',n+' / '+x.dataset.capacity+'발');root.querySelector('[data-magazine-reserve]').textContent='탄창 '+n+' / 사용 가능 '+x.dataset.total+'발 · 남는 낱발 '+(Number(x.dataset.total)-n)+'발';return;}if(e.target.id!=='inventory-search')return;filter=e.target.value;const start=e.target.selectionStart;context.render();const field=document.getElementById('inventory-search');field?.focus();try{field?.setSelectionRange(start,start);}catch{}});
document.addEventListener('change',e=>{if(e.target.id==='inventory-shop'){shopId=e.target.value;selection='';context.render();}});

document.addEventListener('change',async e=>{
 if(e.target.id==='magazine-ammo'){ammoDraft=e.target.value;context.render();return;}
 if(e.target.id!=='magazine-rounds'||sliderBusy||!context)return;
 const x=e.target,characterId=x.closest('.inventory-desk').dataset.character,previousIds=new Set(context.room.characters.find(c=>c.id===characterId).assets.magazines?.map(m=>m.id)||[]);
 sliderBusy=true;x.disabled=true;
 try{const data=await context.command('inventoryAction',{verb:'setMagazineRounds',characterId,itemId:x.dataset.item,lootId:x.dataset.loot,ammoItemId:x.dataset.ammo,quantity:Number(x.value)});
 if(data&&!x.dataset.loot){const created=context.room.characters.find(c=>c.id===characterId).assets.magazines?.find(m=>!previousIds.has(m.id));if(created)selection='mag:'+created.id;}
 }finally{sliderBusy=false;context.render();}
});
