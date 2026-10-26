import {weaponLabel} from '../public/play/equipment-labels.js';
import {attackModes,defaultAttackMode} from '../public/play/weapon-modes.js';
const fail=m=>{throw Error(m);};
const n=(v,min,max,integer=false)=>Number.isFinite(v)&&v>=min&&v<=max&&(!integer||Number.isInteger(v))?v:fail('무기 수치를 확인하세요.');
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('무기 식별자와 이름을 확인하세요.');
function stats(w){
 if(!['melee','firearm','missile'].includes(w.kind)||!['cr','cut','imp','pi-','pi','pi+','pi++','burn'].includes(w.type))fail('지원하는 무기와 피해 유형을 선택하세요.');
 if(!/^(?:[1-9]|[12]\d|30)d6(?:[+-]\d{1,3})?$/.test(w.damage))fail('피해는 1d6+2 형식으로 입력하세요.');
 return {...(w.reloadMechanism?{reloadMechanism:['gate','swingOut','breakOpen','tube','internal','breech','ejector'].includes(w.reloadMechanism)?w.reloadMechanism:fail('장전 구조를 확인하세요.')} :{}),...(w.fastDrawSpecialty?{fastDrawSpecialty:text(w.fastDrawSpecialty,30)}:{}),...(w.damageBasis?{damageBasis:['thrust','swing'].includes(w.damageBasis)?w.damageBasis:fail('ST 피해 기반을 확인하세요.')} :{}),...(w.reverseGrip?{reverseGrip:true}:{}),...(w.unbalanced?{unbalanced:true}:{}),...(w.pellets!==undefined?{pellets:n(w.pellets,2,100,true)}:{}),...(w.caliberMm!==undefined?{caliberMm:n(w.caliberMm,.1,100)}:{}),...(w.unarmed?{unarmed:true,limb:w.limb==='foot'?'foot':'hand'}:{}),...(w.thrown?{thrown:true}:{}),...(w.magazineCapacity!==undefined?{magazineCapacity:n(w.magazineCapacity,1,1000,true)}:{}),...(w.rof!==undefined?{rof:n(w.rof,1,100,true)}:{}),...(w.recoil!==undefined?{recoil:n(w.recoil,1,20,true)}:{}),...(w.minimumBurst!==undefined?{minimumBurst:n(w.minimumBurst,1,w.rof||1,true)}:{}),...(w.reloadTurns!==undefined?{reloadTurns:n(w.reloadTurns,1,120,true)}:{}),...(w.reloadStyle?{reloadStyle:['magazine','individual'].includes(w.reloadStyle)?w.reloadStyle:fail('장전 방식을 확인하세요.')} :{}),name:text(w.name,60),kind:w.kind,skill:n(w.skill,3,100,true),damage:w.damage,type:w.type,reach:n(w.reach,0,10000),halfRange:n(w.halfRange||0,0,10000),acc:n(w.acc||0,0,30,true),...(w.bulk!==undefined?{bulk:n(w.bulk,-20,0,true)}:{}),...(w.source?{source:text(w.source,500)}:{})};
}
export function validateWeapon(w){
 if(!w)fail('주 무기를 등록하세요.');
 const result={...stats(w),ammo:w.kind==='melee'?null:n(w.ammo,0,1000,true)};
 if(w.skillId)result.skillId=text(w.skillId,100);
 if(w.id)result.id=text(w.id,100);
 if(w.catalogWeaponId)result.catalogWeaponId=text(w.catalogWeaponId,100);
 if(w.minimumST!==undefined)result.minimumST=n(w.minimumST,1,100,true);
 if(w.inventoryItemId)result.inventoryItemId=text(w.inventoryItemId,100);
 if(w.ammoItemId)result.ammoItemId=text(w.ammoItemId,100);
 if(w.cartridge)result.cartridge=text(w.cartridge,60).toLowerCase().replace(/×/g,'x').replace(/\s+/g,'');
 if(w.magazineItemId)result.magazineItemId=text(w.magazineItemId,100);
 if(w.capacity!==undefined)result.capacity=n(w.capacity,1,1000,true);
 if(w.modes!==undefined){
  if(!Array.isArray(w.modes)||!w.modes.length||w.modes.length>24)fail('공격 방식은 1~24개입니다.');
  result.modes=w.modes.map(m=>({...stats(m),...(m.skillId?{skillId:text(m.skillId,100)}:{}),id:text(m.id,100)}));
  if(new Set(result.modes.map(m=>m.id)).size!==result.modes.length)fail('공격 방식 ID가 중복됩니다.');
  result.defaultModeId=w.defaultModeId||result.modes[0].id;
  if(!result.modes.some(m=>m.id===result.defaultModeId))fail('기본 공격 방식이 없습니다.');
  if(w.kind==='melee'&&result.modes.some(m=>m.kind!=='melee'))fail('발사 방식에는 장전 정보를 가진 무기가 필요합니다.');
 }
 return result;
}
export function selectAttackWeapon(c,modeId=''){
 const w=c.combatProfile.weapon,m=modeId?attackModes(c).find(m=>m.id===modeId):defaultAttackMode(c);
 if(!m)fail('등록된 공격 방식을 선택하세요.');
 return {...stats(m),...(m.skillId?{skillId:m.skillId}:{}),modeId:m.id,name:m.unarmed?m.name:m.id==='default'?weaponLabel(c,w):weaponLabel(c,w).replace(/ · 찌르기$/,'')+' · '+m.name,ammo:m.kind==='melee'?null:w.ammo};
}
