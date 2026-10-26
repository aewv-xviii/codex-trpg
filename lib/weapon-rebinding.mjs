import {sheetSkill,brawlingLevel} from '../public/play/personal-combat.js';
import {validateWeapon} from './combat-weapons.mjs';
import {addDamage} from './combat-options.mjs';
// Basic B16, B198, B208, B209, B271-278. Recipient statistics never come from the donor.
import {strengthDamage} from '../public/play/gurps-damage.js';
import {weaponDefinition,catalogMode,catalogSkill,modeDamage,weaponMasterBonus} from '../public/play/weapon-rules.js';
const reflex=c=>c.fields?.some(f=>/Combat Reflexes|전투반사신경/.test(f.name)&&!/(없음|미구매)/.test(f.value))?1:0;
export function fallbackUnarmed(c){
 if(c.combatUnarmed)return structuredClone(c.combatUnarmed);
 const st=sheetSkill(c,/^ST$/),skill=brawlingLevel(c),dx=c.combatProfile?.dx;
 if(!strengthDamage(st,'thrust')||!Number.isInteger(skill))throw Error('무기 회수 후 원래 인물의 맨손 수치를 확인해야 합니다.');
 const trained=sheetSkill(c,/^(Brawling|격투)(?:\s|$|\()/i),bonus=trained>=dx+2?1:0;
 return {weapon:{id:'unarmed',name:'맨손',unarmed:true,limb:'hand',kind:'melee',skill,damage:addDamage(strengthDamage(st,'thrust'),-1+parseInt(strengthDamage(st,'thrust'))*bonus),damageBasis:'thrust',type:'cr',reach:0,ammo:null},parry:Math.floor(skill/2)+3+reflex(c)};
}
export function rebindWeapon(c,original,id,{weaponHand='right'}={}){
 const w=structuredClone(original),ruleId=w.catalogWeaponId||w.id,dx=sheetSkill(c,/^DX$/)??c.combatProfile?.dx,st=sheetSkill(c,/^ST$/);
 let skill,parry=null,minimum=0;
 if(w.kind==='firearm'){
  const definition=weaponDefinition(w),specialization=definition?.combat.skill_id==='SK-GUNS-PISTOL-7'?'Pistol':/Guns.*\(([^)]+)\)/i.exec(w.skillId||'')?.[1];
  if(!specialization)return null;
  const normalized=s=>s.replace(/[\s·]/g,'').toLowerCase();
  const field=c.fields?.find(f=>/Guns|총기/.test(f.name)&&(normalized(f.name).includes(normalized(specialization))||specialization==='Pistol'&&/권총/.test(f.name)));
  skill=field?Number.parseFloat(field.value):dx-4;minimum=definition?.combat.minimum_st||0;
  // Unknown equipment-specific minimum ST needs review before binding.
  if(!minimum&&w.minimumST===undefined)return null;minimum=w.minimumST??minimum;
  w.skillId='Guns ('+specialization+')';
  if(w.modes?.some(m=>m.kind!=='firearm'))return null;
 }else if(w.kind==='melee'){
  const definition=weaponDefinition(w);if(!definition)return null;
  const actorSkill=catalogSkill(c,definition.combat.skill_id);if(!actorSkill)return null;
  skill=actorSkill.level;minimum=definition.combat.minimum_st;
  const bonus=weaponMasterBonus(c,actorSkill.name,actorSkill.trained);
  const modes=(w.modes?.length?w.modes:[{...w,id:'default'}]).map(m=>{
   const source=catalogMode(w,m);if(!source||source.skill_id&&source.skill_id!==definition.combat.skill_id||source.hands_required===2&&weaponHand!=='both')return null;
   const damage=modeDamage(st,source,bonus,minimum);if(!damage)return null;
   return {...m,skill,skillId:actorSkill.name,damage,damageBasis:source.damage_source};
  });if(modes.some(m=>!m))return null;
  w.modes=modes;const base=modes.find(m=>m.id===w.defaultModeId)||modes[0];Object.assign(w,{damage:base.damage,type:base.type,reach:base.reach,damageBasis:base.damageBasis,defaultModeId:base.id});
  parry=definition.combat.parry_modifier;w.skillId=actorSkill.name;
 }else return null;
 if(!Number.isInteger(skill)||!Number.isInteger(st)||!Number.isInteger(dx))return null;
 const shortfall=Math.max(0,minimum-st);skill-=shortfall;if(skill<3)return null;
 w.skill=skill;if(w.modes)w.modes=w.modes.map(m=>({...m,skill,skillId:w.skillId}));
 return {weapon:{...validateWeapon({...w,id,inventoryItemId:id}),catalogWeaponId:ruleId,...(w.insertedMagazine?{insertedMagazine:structuredClone(w.insertedMagazine)}:{})},parry:parry===null?null:Math.floor(skill/2)+3+reflex(c)+parry,weaponHand};
}
