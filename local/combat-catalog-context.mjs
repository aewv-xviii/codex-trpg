import {combatCatalog as catalog,combatCatalogIndex,combatCatalogStatus} from '../lib/combat-catalog.mjs';

// Bounded reference retrieval, independent of inventory and live combat state.
export function combatCatalogContext(room){
 const kind=room.gmJob?.kind;
 if(['dialogue','combatReaction'].includes(kind)||kind==='request'&&room.gmJob?.requesterId!==room.owner)return null;
 const query=[room.gmJob?.requestText,...(room.actions||[]).filter(a=>room.gmJob?.actionIds?.includes(a.id)).map(a=>a.text)].filter(Boolean).join(' ').toLowerCase();
 const combatJob=['combat','combatReview'].includes(kind)||room.combat?.status==='active';
 const mechanical=/전투|무기|공격|판정|피해|단검|나이프|권총|곤봉|데이터베이스|카탈로그|wpn-|tpl-|combat|weapon|damage/i.test(query);
 if(!combatJob&&!mechanical)return null;
 const activeWeapons=new Set((room.characters||[]).flatMap(c=>[c.combatProfile?.weapon,...(c.combatLoadout||[]).map(x=>x.weapon)]).map(w=>w?.catalogWeaponId||w?.id).filter(Boolean));
 const ranked=catalog.weapons.weapons.map(w=>({w,score:activeWeapons.has(w.item.id)?1000:Math.max(0,...[w.item.id,w.item.name,...w.metadata.aliases||[]].filter(n=>n.length>=2&&query.includes(n.toLowerCase())).map(n=>n.length))})).filter(x=>x.score).sort((a,b)=>b.score-a.score);
 const picked=ranked.slice(0,2).map(({w})=>({id:w.item.id,name:w.item.name,verification:w.metadata.verification,source:`combat_database/weapons/inputs/${w.item.id}.md`,
  skillId:w.item.combat.skill_id,minimumST:w.item.combat.minimum_st,notes:w.metadata.notes,
  modes:w.item.combat.modes.map(m=>({...m,execution:'Reference only. Use only the character availableAttackModes IDs; this record does not equip or approve a mode.'}))}));
 // Never truncate a condition inside a record: omit entire remaining records.
 const weapons=[];let used=0;
 for(const w of picked){const size=JSON.stringify(w).length;if(used+size<=12000){weapons.push(w);used+=size;}}
 const requested=combatCatalogIndex.filter(t=>query.includes(t.id.toLowerCase())||query.includes(t.name.toLowerCase())).map(t=>{
  const record=catalog.combatants.find(e=>e.template.id===t.id);
  return {...t,attributes:record.calculated.attributes,secondary:record.calculated.secondary,attacks:record.calculated.attacks,defenses:record.calculated.defenses,powerProfiles:record.calculated.power_profiles};
 }).slice(0,1);
 return {status:combatCatalogStatus,combatants:combatCatalogIndex,requestedCombatants:requested,weapons,
  omittedWeaponMatches:ranked.length-weapons.length,
  instruction:'Reference data only. Never replace owned gear by alias, change live HP/FP/ammo/money, convert GURPS dollars to won, or treat WARNING/UNVERIFIED/GM_REVIEW/HOUSE_APPROVED as official PASS. Existing reviewed profiles and availableAttackModes remain authoritative. Only combatTemplates marked executable may instantiate NPC stats; other templates require an adapter. Preserve exact weapon/mode IDs, skill and hand choices, and all conditions. No invented damage or fallback to another attack type.'};
}
