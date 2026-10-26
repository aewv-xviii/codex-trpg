// Reviewed runtime subset: Basic Set B99/B370/B376; Martial Arts p.68.
// Numeric sheet values are final purchased levels, not an invitation to add CP.
export function isPreparedKnife(c,w=c.combatProfile?.weapon){
 return w?.kind==='melee'&&!w.unarmed&&(!w.skillId||w.skillId==='Knife')&&(/B16\/B99\/B272/.test(c.combatProfileSource||'')&&/컴뱃나이프/.test(c.combatProfile?.weapon?.name||'')||w?.skillId==='Knife');
}
export function knifeMaster(c,w){return isPreparedKnife(c,w)&&c.fields?.some(f=>/무기의 달인.*단검|Weapon Master.*Kniv/i.test(f.name)&&!/(미구매|없음)/.test(f.value));}
export const parryStep=c=>knifeMaster(c,c.combatProfile?.weapon)?2:4;
export function targetedVitals(c,w,location){
 if(location!=='vitals'||w.type!=='imp'||!isPreparedKnife(c,w))return null;
 const field=c.fields?.find(f=>/Targeted Attack.*Knife Thrust\/Vitals|단검 찌르기\s*\/\s*급소/i.test(f.name));
 if(!field||/미구매|없음|미습득/.test(field.value))return null;
 const value=Number.parseFloat(field.value);
 if(!Number.isInteger(value)||value<=w.skill-3)return null;
 if(value>w.skill-1)throw Error('급소 찌르기 기술이 기능-1 상한을 넘습니다. 시트를 확인하세요.');
 return {id:'knife-thrust-vitals',level:value};
}
export function techniqueCapabilities(c){
 return {revision:'combat-options-v4',turnPlans:{onePerActor:true,kinds:['reload','counterattack'],interruptOnInjury:true},counterattack:{source:'Martial Arts p70',defaultPenalty:-5,nextOwnTurnOnly:true,sameSuccessfullyDefendedFoe:true,parryPenalty:2,blockDodgePenalty:1,grapplingContests:false},extraEffort:{options:['heroicCharge','giantStep','greatLunge','flurry','mightyBlow','feverishDefense','rapidRecovery'],source:'Basic B357; Martial Arts p131',ordinaryDescriptionCostsFP:false,confirmBelowOneThird:true,rapidStrikeBoost:'both attacks; 1 FP per executed attack',giantStep:'approach only'},rapidStrike:{attacks:2,sameTarget:true,sameMode:true,sameLocation:true,moveAttack:false},deceptiveAttack:{skillCostPerLevel:2,defensePenaltyPerLevel:1,minimumEffectiveSkill:10},knifeMaster:!!knifeMaster(c,c.combatProfile?.weapon),parryPenaltyPerRepeat:parryStep(c),targetedAttack:'Purchased Knife Thrust/Vitals only; exact effective level is validated by server.',supported:['reverse grip Ready','Evaluate','All-Out determined/strong/double','Committed determined/strong','Defensive Attack','Telegraphic Attack','postures','groin/jaw/joints','disarm','TK5 strike/grapple/lift/move','Feint','torso grapple','breakFree','takedown','Karate ST12','thrown large knife ST12','retreat','acrobatics'],unimplemented:['mixed attack sequences','full critical tables','grappling locks and pins','dragging while grappling']};
}
export function attackOptions(c,w,p){
 if(p.rapidStrike!==undefined&&typeof p.rapidStrike!=='boolean')throw Error('연속 공격 선택을 확인하세요.');
 const deceptive=p.deceptiveLevels??0;
 if(!Number.isInteger(deceptive)||deceptive<0||deceptive>20)throw Error('기만 공격 단계를 확인하세요.');
 if((p.rapidStrike||deceptive)&&w.kind!=='melee')throw Error('연속·기만 공격은 근접 공격만 지원합니다.');
 if(p.rapidStrike&&p.maneuver==='moveAttack')throw Error('이동 공격에는 연속 공격을 사용할 수 없습니다.');
 return {rapidPenalty:p.rapidStrike?(knifeMaster(c,w)?3:6):0,deceptive};
}
