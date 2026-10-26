// Read-only projection of the authoritative inventory. No extra balances to sync.
export function ammunitionLedger(r){
 const items=r.economy?.items||[],name=id=>items.find(i=>i.id===id)?.name||id;
 const magazine=m=>({...m,ammoName:name(m.ammoItemId),ballisticType:items.find(i=>i.id===m.ammoItemId)?.ballisticType||'standard'});
 return r.characters.filter(c=>c.combatProfile?.weapon?.kind==='firearm'||c.combatLoadout?.some(l=>l.weapon?.kind==='firearm')||c.assets?.magazines?.length||c.heldMagazine||items.some(i=>(i.kind==='ammo'||i.magazineSpec)&&(c.assets?.items?.[i.id]||0)>0)||(r.groundMagazines||[]).some(g=>g.ownerId===c.id)).map(c=>{
  const f=r.combat?.status==='active'?r.combat.fighters[c.id]:c.combatState;
  const weapons=[c.combatProfile?.weapon,...(c.combatLoadout||[]).map(l=>l.weapon)].filter(w=>w?.kind==='firearm');
  return {characterId:c.id,name:c.name,team:r.combat?.fighters[c.id]?.team||(r.partyCharacterIds.includes(c.id)?'party':'npc'),
   weapons:weapons.map(w=>({id:w.id,name:w.name,loaded:w.ammo,capacity:w.capacity,cartridge:w.cartridge||'',ammoItemId:w.ammoItemId,ammoName:name(w.ammoItemId),ballisticType:items.find(i=>i.id===w.ammoItemId)?.ballisticType||'standard',insertedMagazineId:w.insertedMagazine?.id||'',reloadStyle:w.reloadStyle,reloadMechanism:w.reloadMechanism})),
   magazines:(c.assets?.magazines||[]).map(magazine),held:c.heldMagazine?magazine(c.heldMagazine):null,
   loose:items.filter(i=>i.kind==='ammo'&&(c.assets?.items?.[i.id]||0)>0).map(i=>({itemId:i.id,name:i.name,cartridge:i.cartridge||'',ballisticType:i.ballisticType||'standard',rounds:c.assets.items[i.id]})),
   empty:items.filter(i=>i.magazineSpec&&(c.assets?.items?.[i.id]||0)>0).map(i=>({itemId:i.id,name:i.name,count:c.assets.items[i.id],...i.magazineSpec})),
   ground:(r.groundMagazines||[]).filter(g=>g.ownerId===c.id).map(g=>({id:g.id,magazine:magazine(g.magazine),position:g.position,placeId:g.placeId,mapId:g.mapId})),reload:f?.reload||null};
 });
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ammoLedgerMarkup(rows){return rows.map(c=>`<article class="entry"><b>${esc(c.name)} · ${esc(({party:'아군',enemy:'적',npc:'NPC'})[c.team]||c.team)}</b>${c.weapons.map(w=>`<p>${esc(w.name)}: ${w.loaded}/${w.capacity}발 · ${esc(w.ammoName)} (${esc(w.ballisticType)})</p>`).join('')}<p>예비 탄창 ${c.magazines.map(m=>`${m.rounds}/${m.capacity||'?'}발 ${esc(m.ammoName)} [${esc(m.id.slice(0,6))}]`).join(', ')||'없음'}</p><p>빈 탄창 ${c.empty.reduce((n,m)=>n+m.count,0)}개 · 낱발 ${c.loose.map(i=>`${esc(i.name)} ${i.rounds}발`).join(', ')||'없음'}</p>${c.held?`<p>손에 든 헌 탄창 ${c.held.rounds}발 · 보관 Ready 1회 남음</p>`:''}${c.ground.length?`<p>현장 탄창 ${c.ground.map(g=>`${g.magazine.rounds}발 [${esc(g.id.slice(0,6))}]`).join(', ')}</p>`:''}${c.reload?`<p>재장전 ${c.reload.progress}/${c.reload.seconds||2}${c.reload.phase==='stow'?' · 사격 가능, 보관 대기':''}</p>`:''}</article>`).join('')||'<p>추적할 총기·탄창 없음</p>';}
