// B279, B409. Ammo effects come from the stocked ammunition record, never attack input.
const fail=m=>{throw Error(m);};
export function projectilePlan(r,c,w,shells,distance){
 if(w.kind!=='firearm')return {weapon:w,projectiles:shells};
 const ammo=r.economy?.items?.find(i=>i.id===c.combatProfile.weapon.ammoItemId);
 const type=ammo?.ballisticType||'standard';
 if(type!=='standard'&&(!c.assets?.confirmed||!w.ammo))fail('확인된 소지 탄약을 장전하세요.');
 const weapon={...w};
 const ladder=['pi-','pi','pi+','pi++'],i=ladder.indexOf(w.type);
 if(type==='hp'){if(i<0)fail('이 무기에는 HP 탄종을 적용할 수 없습니다.');weapon.type=ladder[Math.min(3,i+1)];weapon.armorDivisor=.5;}
 if(type==='aphc'||type==='ap'){if(i<0||!Number.isFinite(w.caliberMm)||w.caliberMm>=20)fail('AP/APHC에는 20mm 미만의 확인된 구경이 필요합니다.');weapon.type=ladder[Math.max(0,i-1)];weapon.armorDivisor=2;if(type==='ap')weapon.ammoDamageMultiplier=.7;}
 if(!w.pellets)return {weapon,projectiles:shells};
 if(type!=='standard')fail('산탄과 특수탄 조합은 별도 탄도 자료가 필요합니다.');
 if(!w.halfRange)fail('산탄에는 반감 사거리가 필요합니다.');
 if(distance<w.halfRange*.1){
  const factor=Math.floor(w.pellets/2),[,dice,add='0']=/^(\d+)d6([+-]\d+)?$/.exec(w.damage),bonus=Number(add)*factor;
  weapon.damage=Number(dice)*factor+'d6'+(bonus>0?'+'+bonus:bonus<0?bonus:'');weapon.shotgunDRFactor=factor;
  return {weapon,projectiles:shells};
 }
 return {weapon,projectiles:shells*w.pellets};
}
export function projectileDR(armor,w){const scaled=armor*(w.shotgunDRFactor||1),divisor=w.armorDivisor||1;return Math.max(divisor<1?1:0,Math.floor(scaled/divisor));}
