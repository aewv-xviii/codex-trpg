import {hitLocations} from '../public/play/injury-state.js';
export function validateArmor(layers=[]){
 if(!Array.isArray(layers)||layers.length>1)throw Error('검토된 방어구 한 겹만 등록하세요.');
 return layers.map(a=>{
  if(!Array.isArray(a.locations)||a.locations.some(k=>!Object.hasOwn(hitLocations,k))||![a.dr,a.otherDr].every(n=>Number.isInteger(n)&&n>=0&&n<=1000)||!Array.isArray(a.highTypes)||a.highTypes.some(t=>!['cr','cut','imp','pi-','pi','pi+','pi++','burn'].includes(t)))throw Error('방어구의 부위·피해 유형별 방호력을 확인하세요.');
  return {locations:[...a.locations],dr:a.dr,otherDr:a.otherDr,highTypes:[...a.highTypes],flexible:a.flexible===true};
 });
}
export function armorAt(c,location,type){const a=c.combatProfile?.armor?.find(a=>a.locations.includes(location));return a?{dr:a.highTypes.includes(type)?a.dr:a.otherDr,flexible:a.flexible}:{dr:0,flexible:false};}
