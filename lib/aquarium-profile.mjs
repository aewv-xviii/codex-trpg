// Purchased sheet facts. Fictional applicability belongs to the GM.
export function aquariumProfile(c){
 const field=c.fields?.find(f=>/거짓 수족관 Talent\s*\d+/.test(f.name));
 const talent=Number(field?.name.match(/Talent\s*(\d+)/)?.[1]||1);
 if(!Number.isInteger(talent)||talent<0||talent>10)throw Error('구매한 수족관 Talent를 확인하세요.');
 const value=name=>Number(c.fields?.find(f=>f.name===name)?.value);
 return {talent,visual:!!c.abilityGrants?.['predator-visual-1'],predatorTarget:value('IQ')+talent,detectTarget:value('Per')+talent,refractionTarget:(Number.isFinite(value('Innate Attack (Projectile)'))?value('Innate Attack (Projectile)'):value('DX')-4)+talent};
}
export function commandPenalty(distance){
 if(!Number.isFinite(distance)||distance<0)throw Error('같은 공간의 명령 거리 근거가 필요합니다.');
 const limits=[200,880,1760,5280,17600,52800,176000,528000,1760000];
 const index=limits.findIndex(n=>distance<=n);
 return index===0?0:index>0?-index:-(8+Math.ceil(2*Math.log10(distance/1760000)));
}
export function perceptionContext(r){
 return r.characters.flatMap(c=>(c.effects||[]).filter(e=>e.key==='predator'&&e.remainingSeconds>0).map(e=>({effectId:e.id,observerId:c.id,sourceId:e.sourceId,sense:e.sense,description:e.description,remainingSeconds:e.remainingSeconds,disbelieved:!!e.disbelieved,adjudication:'이 관찰자에게만 적용되는 실제 성공한 감각 편집이다. 관련 단서의 인지와 NPC의 선택을 재정할 때 반영한다. 다른 감각·기존 기억·경고·급박한 위험은 유지된다. 자동 명중·방어불가·정신지배나 일괄 수치 페널티를 부여하지 않는다. 모순 확인 시에만 별도 불신 Will 판정을 고려하며, 이미 판정한 단서는 반복 굴리지 않는다.'})));
}
