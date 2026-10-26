import {fishRecord} from './aquarium-targets.mjs';
export function declarationEligible(r,id){
 const b=r.combat;if(b?.status!=='active')return true;
 if(b.pending?.kind==='critical')return false;
 const actor=b.pending?.targetId||b.order[b.index];return id===(fishRecord(r,actor)?.owner.id||actor);
}
export function queueDeclarations(r){
 if(['queued','running','applying','error'].includes(r.gmJob?.status))return false;
 const a=r.actions.find(a=>a.deferred&&a.status==='pending'&&!r.actionErrors?.[a.id]&&declarationEligible(r,a.actorId));if(!a)return false;
 delete a.deferred;r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'individual',at:new Date().toISOString(),requesterId:a.author,actorId:a.actorId,actionIds:[a.id],requestText:a.text};return true;
}
