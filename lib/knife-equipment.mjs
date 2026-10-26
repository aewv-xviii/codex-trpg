import {largeKnife,ownedKnife} from '../public/play/knife-identity.js';
import {preparedKnifeModes} from '../public/play/weapon-modes.js';
import {validateWeapon} from './combat-weapons.mjs';
const fail=m=>{throw Error(m);};
// Called by the host-only economy command after its idle-state checks.
export function configureKnife(r,p){
 const c=r.characters.find(c=>c.id===p.characterId&&r.partyCharacterIds.includes(c.id));
 const i=c&&ownedKnife(r,c),w=c?.combatProfile?.weapon;
 if(!c?.assets?.confirmed||!i||i.id!==p.itemId||!largeKnife(c)||Number.parseFloat(c.fields?.find(f=>f.name==='ST')?.value)!==12)fail('검토된 ST12 대형 나이프와 실제 휴대품을 선택하세요.');
 if(p.baseWeaponId!=='WPN-05')fail('이 장비 설정은 대형 나이프 규칙만 지원합니다.');
 if(!Number.isSafeInteger(p.quantity)||p.quantity<1||p.quantity>99999)fail('수량을 확인하세요.');
 const name=typeof p.name==='string'?p.name.trim():'';
 if(!name||name.length>50)fail('무기 이름은 1~50자로 입력하세요.');
 if(r.characters.some(x=>x.id!==c.id&&((x.assets?.items?.[i.id]||0)>0||(x.assets?.storedItems?.[i.id]||0)>0))||(c.assets.storedItems?.[i.id]||0)>0||r.economy.shops.some(s=>s.offers?.some(o=>o.itemId===i.id))||r.looseWeapons?.some(x=>x.itemId===i.id&&!x.recovered)||r.groundItems?.some(x=>x.itemId===i.id&&x.quantity>0))fail('다른 소유자·보관함·상점·주변 물품과 공유하는 항목은 개별 분리 후 변경하세요.');
 const before={name:i.name,quantity:c.assets.items[i.id]};
 const modes=preparedKnifeModes(c,w.skill).map(m=>({...m,skillId:'Knife',source:'WPN-05 · Basic Set B16/B99/B272'}));
 c.combatProfile.weapon=validateWeapon({...w,...modes[0],name,id:'WPN-05',inventoryItemId:i.id,skillId:'Knife',modes,defaultModeId:'thrust',ammo:null});
 i.name=name;i.baseWeaponId='WPN-05';c.assets.items[i.id]=p.quantity;
 const escaped=before.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const re=new RegExp(escaped+'\\s*\\d+\\s*(?:자루|개)');
 const description=`${name} ${p.quantity}자루(대형 나이프; WPN-05)`;
 c.inventory=re.test(c.inventory||'')?c.inventory.replace(re,description):[c.inventory,description].filter(Boolean).join('\n');
 c.sheetRevision=(c.sheetRevision||0)+1;
 return {characterId:c.id,itemId:i.id,before,name,quantity:p.quantity,baseWeaponId:'WPN-05'};
}
