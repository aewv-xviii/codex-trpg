import {strengthDamage,addDamage} from './gurps-damage.js';
import {largeKnife} from './knife-identity.js';
// Purchased sheet levels are final; shared Basic Set B16 damage, B203/271 attacks.
export const sheetSkill=(c,re)=>{const f=c.fields?.find(f=>re.test(f.name));const n=Number.parseFloat(f?.value);return Number.isInteger(n)?n:null;};
export const brawlingLevel=c=>sheetSkill(c,/^(Brawling|격투)(?:\s|$|\()/i)??c.combatProfile?.dx;
export const brawlingParry=c=>c.combatUnarmed?.parry??(Math.floor(brawlingLevel(c)/2)+3+(c.fields?.some(f=>/Combat Reflexes|전투반사신경/.test(f.name)&&!/(없음|미구매)/.test(f.value))?1:0));
export function personalModes(c){
 const st=sheetSkill(c,/^ST$/),dx=c.combatProfile?.dx,k=sheetSkill(c,/^(Karate|타격술)(?:\s|$)/i),out=[];
 const thrust=strengthDamage(st),dice=thrust?parseInt(thrust):0;
 if(thrust!==null&&k){const bonus=k>=dx+1?2:k>=dx?1:0,enc=c.combatProfile.encumbrance||0;
  const base={kind:'melee',skillId:'Karate',type:'cr',halfRange:0,acc:0,unarmed:true,source:'B16/B203/B271'};
  out.push({...base,id:'karate-punch',name:'타격술 주먹',skill:k-enc,damageBasis:'thrust',damage:addDamage(thrust,-1+dice*bonus),reach:0,limb:'hand'}, {...base,id:'karate-kick',name:'타격술 발차기',skill:k-2-enc,damageBasis:'thrust',damage:addDamage(thrust,dice*bonus),reach:1,limb:'foot'});
 }
 if(c.combatUnarmed?.weapon&&!c.combatProfile?.weapon?.unarmed){const {ammo,...m}=c.combatUnarmed.weapon;out.push(m);}
 if(thrust!==null&&!c.combatUnarmed&&!c.combatProfile?.weapon?.unarmed){const b=brawlingLevel(c),bonus=b>=dx+2?1:0,n=-1+dice*bonus;out.push({id:'brawling-punch',name:'맨손 주먹',kind:'melee',skill:b,damage:addDamage(thrust,n),damageBasis:'thrust',type:'cr',reach:0,halfRange:0,acc:0,unarmed:true,limb:'hand',source:'B16/B182/B271'});}
 const w=c.combatProfile?.weapon,thrown=sheetSkill(c,/^Thrown Weapon.*Knife|^단검 투척/i);
 if(st===12&&thrown&&largeKnife(c))out.push({id:'throw-knife',name:'단검 투척',skillId:'Thrown Weapon (Knife)',kind:'missile',skill:thrown,damage:'1d6-1',type:'imp',reach:18,halfRange:9.6,acc:0,bulk:-2,thrown:true,source:'B276 · ST12 Large Knife; default has no Weapon Master damage bonus'});
 return out;
}
