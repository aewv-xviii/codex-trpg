// Per-character display labels never replace catalog names used by rules.
export const itemLabel=(c,i)=>c?.assets?.itemAliases?.[i?.id]||i?.name||i?.id||'';
export const weaponLabel=(c,w)=>c?.assets?.itemAliases?.[w?.inventoryItemId||w?.itemId]||w?.name||'';
export const labeledItem=(c,i)=>({...i,baseName:i.name,name:itemLabel(c,i)});
