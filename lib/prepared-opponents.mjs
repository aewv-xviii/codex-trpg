import {weaponDefinition,modeDamage} from '../public/play/weapon-rules.js';
import {hitLocations} from '../public/play/injury-state.js';
export function pistol(skill,ammo=0,definition=weaponDefinition({id:'WPN-02'})){
 const s=definition.stats;
 return {id:definition.id,name:'9mm 자동권총',kind:'firearm',skill,damage:s.damage.replace(/d(?!6)/,'d6'),type:s.damage_type,reach:s.max_range_yd,halfRange:s.half_damage_range_yd,acc:s.acc,rof:s.rof,recoil:s.rcl,bulk:s.bulk,caliberMm:9,ammo,capacity:s.magazine_capacity+s.chamber_capacity,magazineCapacity:s.magazine_capacity,reloadTurns:s.reload_seconds,reloadStyle:'magazine',ammoItemId:'ammo-standard'};
}
const batonDamage=basis=>{const d=weaponDefinition({id:'WPN-01'});return modeDamage(12,d.combat.modes.find(m=>m.damage_source===basis&&m.damage_type==='cr'&&m.attack_kind==='melee'),0,d.combat.minimum_st);};
export function baton(skill,swing=batonDamage('swing'),thrust=batonDamage('thrust')){const common={kind:'melee',skill,type:'cr',reach:1,halfRange:0,acc:0};const modes=[{...common,id:'swing',name:'휘두르기',damage:swing,damageBasis:'swing'},{...common,id:'thrust',name:'찌르기',damage:thrust,damageBasis:'thrust'}];return {...modes[0],id:'WPN-01',name:'곤봉',ammo:null,modes,defaultModeId:'swing'};}
export function punch(skill,damage){return {id:'brawling-punch',name:'주먹',kind:'melee',skill,damage:damage.replace(/d(?!6)/,'d6'),damageBasis:'thrust',type:'cr',reach:0,halfRange:0,acc:0,ammo:null,unarmed:true,limb:'hand'};}
export function enhanceTemplate(t,data){
 const s=data.combatants.find(e=>e.template.id===t.id)?.calculated,a=s?.attacks.find(a=>a.kind==='punch');
 if(a)t.unarmed={weapon:punch(a.level,a.damage),parry:s.defenses.unarmed_parry};
 if(t.id==='TPL-HM-01'){const modes=t.profile.weapon.modes;t.profile.weapon=baton(t.profile.weapon.skill,modes[0].damage,modes[1].damage);}
 t.fields=[...t.fields,...(s?.skills||[]).filter(x=>!t.fields.some(f=>f.name===x.name)).map(x=>({name:x.name,value:String(x.level)}))];
 return t;
}
export function specialTemplates(data){
 if(!data.audit.relocatedRulebooks.some(s=>s.sourceId==='SRC-B'&&s.contentHashMatches))return [];
 return ['TPL-GOV-01','TPL-PSI-01','TPL-YOKAI-01'].flatMap(id=>{
  const e=data.combatants.find(e=>e.template.id===id);if(!e||!['PASS','WARNING'].includes(e.calculated.validation_status)||e.calculated.unverified_calculations.length)return [];
  const {template:t,calculated:s}=e,a=s.attacks.find(a=>a.kind==='punch'),unarmed={weapon:punch(a.level,a.damage),parry:s.defenses.unarmed_parry};
  const profile={dx:s.attributes.DX,ht:s.attributes.HT,speed:s.secondary.BasicSpeed,move:s.move,dodge:s.defenses.dodge,parry:unarmed.parry,block:null,dr:0,weapon:unarmed.weapon,weaponHand:'right'};
  let loadout=[];
  if(id==='TPL-GOV-01'){
   profile.weapon=pistol(s.attacks.find(a=>a.item_id==='WPN-02').level,t.initial_state_defaults.weapon_resources['WPN-02'].loaded_rounds);profile.parry=null;
   const armor=s.defenses.armor[0];profile.armor=[{locations:armor.coverage,dr:armor.dr_rule.high,otherDr:armor.dr_rule.other,highTypes:armor.dr_rule.high_types,flexible:armor.flexible}];
   const attacks=s.attacks.filter(a=>a.item_id==='WPN-01');loadout=[{weapon:baton(attacks[0].level,attacks[0].damage.replace('d','d6'),attacks[1].damage.replace('d','d6')),parry:9,weaponHand:'right'}];
  }
  if(id==='TPL-PSI-01')profile.telekinesis=5;
  if(id==='TPL-YOKAI-01'){profile.dr=2;profile.drByLocation=Object.fromEntries(Object.keys(hitLocations).map(k=>[k,k.endsWith('Eye')?0:2]));}
  const fields=[...Object.entries(s.attributes),['Will',s.secondary.Will],['Per',s.secondary.Per],...s.skills.map(x=>[x.name,x.level])].map(([name,value])=>({name,value:String(value)}));
  return [{id,name:t.name,hp:s.secondary.HP,fp:s.secondary.FP,fields,profile,unarmed,loadout,verification:s.validation_status,houseRuleIds:t.house_rule_refs||[],source:`combat_database/inputs/combatants/${id}.md; ${s.source_hash}`,identityNotice:'검토된 수치 표본. 신원·소속·미정 능력을 자동 부여하지 않는다.'}];
 });
}
