import {controlFlags} from './control-state.mjs';
import {sheetSkill} from '../public/play/personal-combat.js';
import {handDisabled} from '../public/play/injury-state.js';
import {attackModes} from '../public/play/weapon-modes.js';
const fail=s=>{throw Error(s);};
export const strength=c=>sheetSkill(c,/^ST$/)??fail('ST를 시트에 확인하세요.');
export const grappleSkill=c=>Math.max(c.combatProfile.dx,...['Judo','Wrestling','Sumo Wrestling','유도','레슬링','스모'].map(k=>sheetSkill(c,new RegExp('^'+k+'(?:\\s|$)','i'))||0));
export function grips(r,id,asTarget=false){return (r.combat?.grapples||[]).filter(g=>(asTarget?g.targetId:g.actorId)===id&&r.combat.fighters[g.actorId]?.status==='active'&&r.combat.fighters[g.targetId]?.status==='active');}
export function availableHands(r,c){
 const f=r.combat?.fighters[c.id],p=c.combatProfile,held=f?.dropped||p.weapon.unarmed?[]:p.weaponHand==='both'?['left','right']:[p.weaponHand==='left'?'left':'right'];
 return ['left','right'].filter(h=>!held.includes(h)&&!handDisabled(c,h)).slice(grips(r,c.id).reduce((n,g)=>n+g.hands,0));
}
export const freeHands=(r,c)=>availableHands(r,c).length;
export function requireMobile(r,c){if(controlFlags(c).noMove)fail('이동 제한 상태를 먼저 해제하세요.');if(grips(r,c.id,true).length||grips(r,c.id).length)fail('이동 전에 잡기를 해제하거나 빠져나오세요. 붙잡고 끌기는 별도 재정이 필요합니다.');}
export function defenseFeintSkill(r,c){const dropped=r.combat.fighters[c.id]?.dropped;return Math.max(c.combatProfile.dx,...attackModes(c).filter(m=>m.kind==='melee'&&(m.unarmed?freeHands(r,c)>0||m.limb==='foot':!dropped)).map(m=>m.skill),grappleSkill(c),c.combatProfile.block!==null?sheetSkill(c,/^(Shield|Cloak|방패|망토)(?:\s|$)/i)||0:0);}
export const grapplePenalty=(r,c)=>grips(r,c.id,true).length?-4:0;
export function validateHeldAction(r,c,action,w){
 const incoming=grips(r,c.id,true),outgoing=grips(r,c.id);
 if(!incoming.length&&!outgoing.length)return;
 if(['aim','feint','reload','stowMagazine','recoverMagazine','fillMagazine','emptyMagazine','concentrate','suppress'].includes(action))fail('잡기 중에는 이 기동을 할 수 없습니다.');
 if(action==='attack'&&(w.kind!=='melee'||!w.unarmed&&w.reach>0||outgoing.length&&freeHands(r,c)<=0&&!w.limb?.includes('foot')))fail('잡기 중에는 자유로운 손의 근접 C 공격을 사용하세요.');
}
