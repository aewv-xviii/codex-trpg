// Explicit rule and inventory IDs survive display-name changes.
export function largeKnife(c){
 const w=c.combatProfile?.weapon;
 return (w?.catalogWeaponId||w?.id)==='WPN-05'||(!w?.id&&!w?.source&&/B16\/B99\/B272/.test(c.combatProfileSource||'')&&/컴뱃나이프/.test(w?.name||''));
}
export function ownedKnife(r,c){
 const id=c.combatProfile?.weapon?.inventoryItemId;
 return r.economy?.items.find(i=>(id?i.id===id:/컴뱃나이프/.test(i.name))&&(c.assets?.items?.[i.id]||0)>0);
}
