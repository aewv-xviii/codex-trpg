// B194-195: no default. Stored final Knife skill on the reviewed sheet includes CR.
export function fastDrawTarget(c,shock=0){
 const w=c.combatProfile.weapon;
 const specialty=w.fastDrawSpecialty||(/pistol|권총/i.test(w.skillId||w.name)?'Pistol':/rifle|shotgun|smg|소총|산탄총|기관단총/i.test(w.skillId||w.name)?'Long Arm':/knife|나이프|단검/i.test(w.skillId||w.name)?'Knife':/sword|검/i.test(w.skillId||w.name)?'Sword':'');
 if(!specialty)return null;
 const aliases={Pistol:'권총',Knife:'나이프|단검',Sword:'검', 'Long Arm':'장총|소총|산탄총'};
 const field=c.fields?.find(f=>/Fast-Draw|빠른 뽑기/i.test(f.name)&&new RegExp(specialty+'|'+(aliases[specialty]||specialty),'i').test(f.name));
 if(!field)return null;
 const match=/^\s*(\d+)/.exec(field.value);if(!match)return null;
 const finalKnife=specialty==='Knife'&&/B16\/B99\/B272/.test(c.combatProfileSource||'');
 const reflexes=!finalKnife&&c.fields?.some(f=>/Combat Reflexes|전투반사신경/.test(f.name+' '+f.value))?1:0;
 return Number(match[1])+reflexes+shock;
}
