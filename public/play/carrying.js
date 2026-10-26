export const burdenNames=['무부담','가벼운 부담','보통 부담','무거운 부담','매우 무거운 부담'];
export function carriedLoad(c,items=[]){
 let kg=c.carrying?.extraKg||0;const unknown=new Set(),catalog=new Map(items.map(i=>[i.id,i]));
 const add=(id,n,label)=>{if(!n)return;const item=catalog.get(id),weight=item?.physical?.weightKg??item?.weightKg;if(Number.isFinite(weight)&&weight>=0)kg+=weight*n;else unknown.add(label||item?.name||id||'장비');};
 for(const [id,n] of Object.entries(c.assets?.items||{}))add(id,n);
 const magazine=m=>{if(!m)return;add(m.itemId,1,'탄창 '+(catalog.get(m.itemId)?.name||m.itemId));add(m.ammoItemId,m.rounds,'장전 탄약');};
 for(const m of c.assets?.magazines||[])magazine(m);magazine(c.heldMagazine);
 const weapons=[c.combatProfile?.weapon,...(c.combatLoadout||[]).map(l=>l.weapon)].filter(Boolean);
 const represented={};
 for(const w of weapons){
  if(w.unarmed)continue;
  const id=w.inventoryItemId||w.itemId||w.id;represented[id]=(represented[id]||0)+1;
  if((c.assets?.items?.[id]||0)<represented[id])add(id,1,w.name);
  if(w.insertedMagazine)add(w.insertedMagazine.itemId,1,'장착 탄창');
  add(w.ammoItemId,w.ammo||0,'장전 탄약');
 }
 const config=c.carrying,bl=config?.basicLiftKg;
 const level=bl?[1,2,3,6,10].findIndex(n=>kg<=bl*n+1e-8):null,overloaded=level===-1;
 return {kg,unknown:[...unknown],complete:unknown.size===0&&!!config,basicLiftKg:bl,level:overloaded?4:level,overloaded};
}
// B17: 1/2/3/6/10 x Basic Lift, Move fractions, Dodge -level. Never compound.
export function syncCarrying(r){
 for(const c of r.characters){
  if(!c.carrying||!c.combatProfile)continue;
  c.carriedLoad=carriedLoad(c,r.economy?.items);
  const l=c.carriedLoad,b=c.carrying;
  if(l.complete&&!l.overloaded){c.combatProfile.encumbrance=l.level;c.combatProfile.move=l.overloaded?0:Math.max(b.basicMove===0?0:1,Math.floor(b.basicMove*(5-l.level)/5));c.combatProfile.dodge=Math.max(1,b.basicDodge-l.level);}
  else {c.combatProfile.move=b.fallbackMove;c.combatProfile.dodge=b.fallbackDodge;c.combatProfile.encumbrance=b.fallbackEncumbrance;}
 }
}
