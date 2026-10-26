// Martial Arts p70 (PDF71). A Counterattack spends the next normal maneuver.
import {weaponDefinition,catalogSkill,trainedLevel} from '../public/play/weapon-rules.js';
import {isPreparedKnife} from './combat-techniques.mjs';
export function counterattackLevel(c,w){
 if(w.kind!=='melee')throw Error('Counterattack은 근접 공격 기술입니다.');
 const skill=w.skillId||(w.unarmed?'Brawling':isPreparedKnife(c,w)?'Knife':catalogSkill(c,weaponDefinition(c.combatProfile?.weapon)?.combat.skill_id)?.name||'');
 if(!skill)throw Error('Counterattack의 기반 기능 전문화를 무기에 연결하세요.');
 const field=c.fields?.find(f=>/^(Counterattack|Counter Attack|반격|카운터어택)\s*\(/i.test(f.name)&&f.name.includes('('+skill+')'));
 const prerequisite=trainedLevel(c,skill)??w.skill;
 const purchased=field&&!/미구매|미습득|없음/.test(field.value)?Number.parseFloat(field.value):null;
 if(purchased!==null&&(!Number.isInteger(purchased)||purchased>prerequisite||purchased<prerequisite-5))throw Error('Counterattack의 확정 기술 수치와 기반 기능을 확인하세요.');
 // Preserve attack-mode penalties (kick, encumbrance, etc.) already in w.skill.
 return {skill,level:purchased??prerequisite-5,modifier:(purchased??prerequisite-5)-prerequisite};
}
export function counterattackOpportunity(r,id,targetId){
 return r.combat?.fighters[id]?.counterattackTargets?.[targetId]?.ready===true;
}
export function recordCounterattackDefense(r,id,targetId){
 const f=r.combat.fighters[id];
 (f.counterattackTargets??={})[targetId]={ready:false};
}
