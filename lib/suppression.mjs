import {position,yards,visibleLine} from './aquarium-space.mjs';
export function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function crosses(a,b,c,d){const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));}
export function exposed(zone,from,to){return from?.space===zone.origin.space&&to?.space===from.space&&(crosses(from,to,zone.origin,zone.center)||Math.min(segmentDistance(from,zone.origin,zone.center),segmentDistance(to,zone.origin,zone.center),segmentDistance(zone.origin,from,to),segmentDistance(zone.center,from,to))<=1);}
export function suppressionThreats(r,id,from=position(r,id),to=position(r,id)){
 return (r.combat?.suppression||[]).filter(z=>z.actorId!==id&&z.remaining>0&&!z.checked.includes(id)&&r.combat.fighters[z.actorId]?.status==='active'&&!r.combat.fighters[z.actorId]?.stunned&&yards(z.origin,to)<=z.weapon.reach&&visibleLine(r,z.origin,to)&&exposed(z,from,to));
}
export function randomLocation(die){const n=die(6)+die(6)+die(6);return n<=4?'skull':n===5?'face':n<=7?'rightLeg':n===8?'rightArm':n<=10?'torso':n===11?'groin':n===12?'leftArm':n<=14?'leftLeg':n===15?(die(6)<=3?'rightHand':'leftHand'):n===16?(die(6)<=3?'rightFoot':'leftFoot'):'neck';}
