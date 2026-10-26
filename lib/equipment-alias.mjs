import {itemLabel} from '../public/play/equipment-labels.js';
const fail=m=>{throw Error(m);};
export function setEquipmentAlias(r,p){
 const c=r.characters.find(c=>c.id===p.characterId&&r.partyCharacterIds.includes(c.id));
 const i=r.economy.items.find(i=>i.id===p.itemId&&i.kind==='gear');
 if(!c?.assets?.confirmed||!i||!((c.assets.items?.[i.id]||0)+(c.assets.storedItems?.[i.id]||0)))fail('소지품 또는 보관함의 장비를 선택하세요.');
 if(typeof p.name!=='string'||p.name.trim().length>50||/[\r\n\x00-\x1f\x7f]/.test(p.name))fail('별칭은 한 줄, 50자 이내로 입력하세요.');
 const name=p.name.trim(),before=itemLabel(c,i);
 // Bind only an unambiguous legacy equipment label; combat statistics stay exact.
 const sameName=r.economy.items.filter(x=>x.name===i.name);
 for(const w of [c.combatProfile?.weapon,...(c.combatLoadout||[]).map(x=>x.weapon)].filter(Boolean)){
  if(!w.inventoryItemId&&!w.itemId&&sameName.length===1&&(w.name===i.name||w.name.startsWith(i.name+' ·')))w.inventoryItemId=i.id;
 }
 if(name&&name!==i.name){(c.assets.itemAliases||={})[i.id]=name;}
 else if(c.assets.itemAliases){delete c.assets.itemAliases[i.id];if(!Object.keys(c.assets.itemAliases).length)delete c.assets.itemAliases;}
 return {characterId:c.id,itemId:i.id,before,name:itemLabel(c,i),baseName:i.name};
}
