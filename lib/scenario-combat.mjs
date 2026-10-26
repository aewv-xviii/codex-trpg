import roster,{packId} from './data/e02-combat-roster.mjs';
import {pistol,baton,punch} from './prepared-opponents.mjs';
export const scenarioCombatIndex=roster.map(a=>({id:a.id,actorId:a.packActorId,name:a.name,packId,sourceLine:a.sourceLine,ammunitionDefined:a.loadedAmmo!==null,specialPowers:a.specialPowers}));
export function scenarioCombatProfile(a){
 const skill=(pattern,fallback)=>a.skills.find(s=>pattern.test(s.name))?.level??fallback;
 const unarmed={weapon:punch(skill(/격투|Brawling/i,a.DX),a.punchDamage.split(' ')[0]),parry:a.unarmedParry};
 const p={dx:a.DX,ht:a.HT,speed:a.speed,move:a.move,dodge:a.dodge,parry:unarmed.parry,block:null,dr:0,weapon:unarmed.weapon,weaponHand:'right'};
 if(a.weaponId==='WPN-01'){p.weapon=baton(skill(/Shortsword/));p.parry=Math.floor(p.weapon.skill/2)+3;}
 if(a.weaponId==='WPN-04'){
  const common={kind:'melee',skill:12,damage:'1d6-2',reverseGrip:true,halfRange:0,acc:0};
  const modes=[{...common,id:'thrust',name:'찌르기',type:'imp',reach:0,damageBasis:'thrust'},{...common,id:'cut',name:'베기',type:'cut',reach:1,damageBasis:'swing'}];
  p.weapon={...modes[0],id:a.weaponId,name:'소형 나이프',modes,defaultModeId:'thrust',ammo:null};p.parry=8;
 }
 if(a.weaponId==='WPN-SCENARIO-CROWBAR'){p.weapon={id:a.weaponId,name:'쇠지렛대',kind:'melee',skill:10,damage:'1d6+3',damageBasis:'swing',unbalanced:true,type:'cr',reach:1,halfRange:0,acc:0,ammo:null};p.parry=8;}
 if(a.weaponId==='WPN-02'){const level={'NPC-CASE01-009':13,N07:12,'NPC-CASE01-015':11}[a.id];p.weapon=pistol(level,0);p.parry=null;}
 const fields=[...['ST','DX','IQ','HT','Will','Per'].map(k=>({name:k,value:String(a[k])})),...a.skills.map(s=>({name:s.name,value:String(s.level)}))];
 return {profile:p,fields,unarmed,source:`E02 v0.3 ${a.id}; line ${a.sourceLine}; B271/B278/B289`,unresolvedPowers:a.specialPowers};
}
// Only the stable source reference can connect a named sheet. Never name matching,
// never replace an existing reviewed profile, health, inventory or identity.
export function connectScenarioCombat(c){
 if(c.combatProfile||!c.isNPC||c.controllers?.length||c.contentRef?.packId!==packId)return false;
 const a=roster.find(a=>a.packActorId===c.contentRef.actorId);if(!a)return false;
 const prepared=scenarioCombatProfile(a);
 for(const f of prepared.fields){const old=c.fields?.find(x=>x.name===f.name);if(old&&old.value!==f.value)throw Error(c.name+'의 기존 시트와 확정 자료가 다릅니다. GM 검토가 필요합니다.');}
 c.fields=[...(c.fields||[]),...prepared.fields.filter(f=>!c.fields?.some(x=>x.name===f.name))];
 c.combatProfile=prepared.profile;c.combatUnarmed=prepared.unarmed;c.combatProfileSource=prepared.source;c.statsPending=false;
 c.combatUnresolved=prepared.unresolvedPowers;c.combatRosterId=a.id;
 if(a.weaponId==='WPN-02'&&a.loadedAmmo===null)c.npcAmmoPending=true;
 c.assets??={won:0,items:{}};c.assets.confirmed=true;
 return true;
}
