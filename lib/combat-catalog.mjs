import {enhanceTemplate,specialTemplates,pistol} from './prepared-opponents.mjs';
import catalog from './data/combat-catalog.mjs';

export {catalog as combatCatalog};
const basicSourceMatches=catalog.audit.relocatedRulebooks.some(s=>s.sourceId==='SRC-B'&&s.contentHashMatches);

// Only this existing NPC adapter is executable. Other records retain their full
// sheets in the catalog; importing data must not claim powers/ammo/armor support.
export function preparedCombatTemplates(data=catalog){
 const entry=data.combatants.find(e=>e.template.id==='TPL-HM-01');
 if(!entry||entry.calculated.validation_status!=='PASS'||!data.audit.relocatedRulebooks.some(s=>s.sourceId==='SRC-B'&&s.contentHashMatches))return [];
 const {template:t,calculated:s}=entry;
 const weapon=data.weapons.weapons.find(w=>w.item.id==='WPN-01')?.item;
 const selected=s.attacks.filter(a=>a.item_id==='WPN-01');
 if(selected.length!==2||s.defenses.armor.length||s.defenses.natural_dr.length||s.power_profiles.length)return [];
 const modes=selected.map(a=>{
  const source=t.attacks.find(x=>x.id===a.id),mode=weapon?.combat.modes.find(m=>m.id===source?.mode_id);
  if(!mode||mode.verification!=='OFFICIAL'||a.attack_kind!=='melee'||a.reach!=='1'||a.conditional_modifiers?.length||a.damage_type!=='cr'||!/^\d+d([+-]\d+)?$/.test(a.damage))throw Error('NPC catalog needs a reviewed runtime adapter');
  return {id:mode.id,name:a.name,kind:'melee',skill:a.level,damage:a.damage.replace('d','d6'),type:a.damage_type,reach:1,halfRange:0,acc:0,source:`WPN-01/${mode.id}; ${a.rule_refs.join(', ')}`};
 });
 const parry=s.defenses.weapon_parries.find(p=>p.item_id==='WPN-01'&&p.mode_id===modes[0].id);
 if(!parry||parry.modifier!==0||parry.flags.length)return [];
 return [{id:t.id,name:t.name,source:`combat_database/inputs/combatants/${t.id}.md; calculated source ${s.source_hash}`,
  catalogRevision:data.revision,verification:s.validation_status,identityNotice:'수치 템플릿만 적용하며 소속·정체를 새로 부여하지 않는다.',
  hp:s.secondary.HP,fp:s.secondary.FP,fields:[...Object.entries(s.attributes),['Will',s.secondary.Will],['Per',s.secondary.Per],...s.skills.map(x=>[x.name,x.level])].map(([name,value])=>({name,value:String(value)})),profile:{dx:s.attributes.DX,ht:s.attributes.HT,speed:s.secondary.BasicSpeed,move:s.move,
   dodge:s.defenses.dodge,parry:parry.level,block:null,dr:0,
   weapon:{...modes[0],id:'WPN-01',name:weapon.name,ammo:null,modes,defaultModeId:modes[0].id}}}];
}

export function preparedFirearmTemplates(data=catalog){
 if(!data.audit.relocatedRulebooks.some(s=>s.sourceId==='SRC-B'&&s.contentHashMatches))return [];
 const e=data.combatants.find(e=>e.template.id==='TPL-HM-02');if(!e||e.calculated.validation_status!=='PASS')return [];
 const {template:t,calculated:s}=e,a=s.attacks.find(a=>a.item_id==='WPN-02'),w=data.weapons.weapons.find(w=>w.item.id==='WPN-02')?.item;
 const initial=t.initial_state_defaults?.weapon_resources?.['WPN-02'];
 if(!w||!a||a.damage!=='2d+2'||a.damage_type!=='pi'||a.rof!==3||a.rcl!==2||initial?.loaded_rounds!==16||initial.spare_magazines!==0||s.power_profiles.length||s.defenses.armor.length||s.defenses.natural_dr.length)return [];
 return [{id:t.id,name:t.name,source:`combat_database/inputs/combatants/${t.id}.md; ${s.source_hash}`,catalogRevision:data.revision,verification:s.validation_status,
  identityNotice:'수치만 적용. 새 개체에만 시작 장전 16발, 예비 0. 기존 개체에 재지급 금지.',hp:s.secondary.HP,fp:s.secondary.FP,
  fields:[...Object.entries(s.attributes),['Will',s.secondary.Will],['Per',s.secondary.Per]].map(([name,value])=>({name,value:String(value)})),
  profile:{dx:s.attributes.DX,ht:s.attributes.HT,speed:s.secondary.BasicSpeed,move:s.move,dodge:s.defenses.dodge,parry:null,block:null,dr:0,weaponHand:'right',
   weapon:{...pistol(a.level,initial.loaded_rounds,{id:w.id,stats:w.official.stats}),name:w.name}}}];
}
export const combatTemplates=[...preparedCombatTemplates(),...preparedFirearmTemplates(),...specialTemplates(catalog)].map(t=>enhanceTemplate(t,catalog));
export function connectLegacyTemplateDetails(c){
 const t=combatTemplates.find(t=>t.id===c.combatTemplateId),p=c.combatProfile;
 if(!t||!p||p.dx!==t.profile.dx||p.ht!==t.profile.ht)return;
 c.fields||=[];for(const f of t.fields)if(!c.fields.some(x=>x.name===f.name))c.fields.push(structuredClone(f));
 if(!c.combatUnarmed&&t.unarmed)c.combatUnarmed=structuredClone(t.unarmed);
 // New adapters never issue the template's loadout or ammunition to old instances.
}
export const combatCatalogIndex=catalog.combatants.map(({template:t,calculated:s})=>({
 id:t.id,name:t.name,verification:s.validation_status,houseRuleIds:t.house_rule_refs||[],
 executable:combatTemplates.some(p=>p.id===t.id),
 ...(!combatTemplates.some(p=>p.id===t.id)?{reason:'자료 등록 완료; 전용 전투·장비 어댑터 검토 필요'}:{}),
 source:`combat_database/inputs/combatants/${t.id}.md`,sourceHash:s.source_hash
}));

export const combatCatalogStatus={revision:catalog.revision,arithmetic:catalog.audit.arithmetic.status,
 sourceAudit:catalog.audit.source.status,basicSourceHashMatches:basicSourceMatches,
 notice:'원본 감사 ERROR/UNVERIFIED는 보존됨. 이동된 룰북의 해시 일치는 재감사가 아님. 카탈로그는 소유 장비나 실행 권한이 아님.'};
