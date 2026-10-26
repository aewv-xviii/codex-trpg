import {weaponDefinition,modeDamage,weaponMasterBonus} from './weapon-rules.js';
import {largeKnife} from './knife-identity.js';
import {personalModes} from './personal-combat.js';
// Runtime attack modes, not the author's weapon database format. Explicit data wins.
const field=(c,re)=>Number.parseFloat(c.fields?.find(f=>re.test(f.name))?.value);
export function preparedKnifeModes(c,skill){
 const st=field(c,/^ST$/)||12,bonus=weaponMasterBonus(c,'Knife',skill),definition=weaponDefinition({id:'WPN-05'});
 const common={reverseGrip:true,kind:'melee',skill,halfRange:0,acc:0,source:'compat:large-knife-ST12-v1 · B16/B99/B272'};
 return [['thrust','찌르기','imp',0],['cut','베기','cut',1]].map(([id,name,type,reach])=>{
  const mode=definition.combat.modes.find(m=>m.damage_source===(id==='cut'?'swing':'thrust')&&m.damage_type===type&&m.attack_kind==='melee');
  return {...common,id,name,type,reach,damageBasis:mode.damage_source,damage:modeDamage(st,mode,bonus,definition.combat.minimum_st)};
 });
}
export function weaponModes(c){
 const w=c.combatProfile?.weapon;if(!w)return [];
 if(Array.isArray(w.modes)&&w.modes.length)return w.modes;
 // Only the exact previously prepared recipe gets a compatibility adapter.
 // Never infer modes for arbitrary knives, daggers, firearms or imported weapons.
 if(largeKnife(c)&&field(c,/^ST$/)===12)
  return preparedKnifeModes(c,w.skill);
 const firearm=w.kind==='firearm'&&/WPN-02/.test(c.combatProfileSource||'')&&/9mm/.test(w.name)?{caliberMm:9,rof:3,recoil:2,bulk:-2,reloadTurns:3,reloadStyle:'magazine',magazineCapacity:15}:{};
 return [{...firearm,...w,id:'default',name:w.name}];
}
export function attackModes(c){const base=weaponModes(c);return [...base,...personalModes(c).filter(m=>!base.some(b=>b.id===m.id))];}
export function defaultAttackMode(c){
 const modes=attackModes(c),id=c.combatProfile?.weapon.defaultModeId;
 return modes.find(m=>m.id===id)||modes[0];
}
