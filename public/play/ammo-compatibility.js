// Cartridge case specification, not bullet diameter or projectile construction.
export const cartridgeKey=v=>String(v||'').trim().toLowerCase().replace(/×/g,'x').replace(/\s+/g,'');
export const ammoVariant=i=>({standard:'일반',ap:'AP',hp:'HP',aphc:'APHC'})[i?.ballisticType||'standard']||'미확인';
export function ammoFits(spec,ammo,items=[]){
 if(!ammo||ammo.kind!=='ammo')return false;
 const expected=cartridgeKey(spec.cartridge||items.find(i=>i.id===spec.ammoItemId)?.cartridge),actual=cartridgeKey(ammo.cartridge);
 return expected||actual?!!expected&&expected===actual:spec.ammoItemId===ammo.id;
}
export function magazineCompatible(w,m,items=[]){
 const physical=m.weaponKey?m.weaponKey===(w.catalogWeaponId||w.id||w.name):m.weaponName===w.name;
 const a=cartridgeKey(w.cartridge||items.find(i=>i.id===w.ammoItemId)?.cartridge),b=cartridgeKey(m.cartridge||items.find(i=>i.id===m.ammoItemId)?.cartridge);
 return physical&&(a||b?!!a&&a===b:m.ammoItemId===w.ammoItemId)&&Number.isInteger(m.rounds)&&m.rounds>=0&&m.rounds<=(w.magazineCapacity||w.capacity)&&(!m.capacity||m.capacity===(w.magazineCapacity||w.capacity));
}
