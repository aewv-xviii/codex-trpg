import {weaponReference} from './weapon-reference.js';
import {strengthDamage,addDamage} from './gurps-damage.js';
export const weaponDefinition=w=>weaponReference.weapons[w?.catalogWeaponId||w?.id]||null;
export function catalogMode(w,m){
 const d=weaponDefinition(w);if(!d)return null;
 const exact=d.combat.modes.find(x=>x.id===m.id);if(exact)return exact;
 const candidates=d.combat.modes.filter(x=>x.damage_source===m.damageBasis&&x.damage_type===m.type&&(!x.skill_id||x.skill_id===d.combat.skill_id));
 return candidates.length===1?candidates[0]:null;
}
const aliases={Knife:['단검'],Shortsword:['소검'],Broadsword:['브로드소드'],Staff:['스태프','봉술'],Spear:['창'],Brawling:['격투'],'Axe/Mace':['도끼/철퇴'],'Guns (Pistol)':['권총','총기 (권총)']};
const normalize=s=>s.replace(/\/TL\d+/ig,'').replace(/\s+/g,' ').trim().toLowerCase();
export function trainedLevel(c,name){
 const names=[name,...(aliases[name]||[])].map(normalize),f=c.fields?.find(f=>names.some(n=>normalize(f.name)===n||normalize(f.name).startsWith(n+' ')));
 const value=Number.parseFloat(f?.value);return Number.isInteger(value)?value:null;
}
export function catalogSkill(c,id){
 const skill=weaponReference.skills.find(x=>x.id===id);if(!skill)return null;
 const name=skill.name.replace(/\/TL\d+/ig,''),trained=trainedLevel(c,name),dx=trainedLevel(c,'DX')??c.combatProfile?.dx;
 if(trained!==null)return {level:trained,trained,name};
 const notation=weaponReference.defaults.find(x=>x.skill_id===id)?.notation;
 const values=(notation||'').split(';').flatMap(s=>{const m=/^\s*(.+?)-(\d+)\s*$/.exec(s);if(!m)return [];const level=m[1]==='DX'?dx:trainedLevel(c,m[1]);return Number.isInteger(level)?[level-Number(m[2])]:[];});
 // Guns DX-4 and Brawling's ordinary DX attack are the existing reviewed fallbacks.
 if(!values.length&&skill.specialization==='Pistol')values.push(dx-4);
 if(!values.length&&id==='SK-BRAWLING')values.push(dx);
 return values.length?{level:Math.max(...values),trained:null,name}:null;
}
export function weaponMasterBonus(c,skill,level){
 const names=[skill,...(aliases[skill]||[])];
 const master=c.fields?.some(f=>/Weapon Master|무기의 달인/i.test(f.name)&&names.some(n=>f.name.toLowerCase().includes(n.toLowerCase()))&&!/없음|미구매/.test(f.value));
 const dx=trainedLevel(c,'DX')??c.combatProfile?.dx;
 return master&&Number.isInteger(level)&&level>=dx+1?(level>=dx+2?2:1):0;
}
export function modeDamage(st,mode,bonus=0,minimumST=null){
 if(mode.damage_source==='fixed')return mode.fixed_damage?.replace(/d(?!6)/,'d6')||null;
 const basis=mode.damage_source,limited=minimumST?Math.min(st,minimumST*3):st,base=strengthDamage(limited,basis);
 return base&&Number.isInteger(mode.damage_add)?addDamage(base,mode.damage_add+parseInt(base)*bonus):null;
}
