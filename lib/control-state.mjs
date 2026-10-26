// Shared execution of already-authorized effects. Illusions never imply these flags.
export function controlFlags(c){
 const effects=(c.effects||[]).filter(e=>e.control&&e.remainingSeconds>0),types=effects.map(e=>e.control);
 return {noAction:types.some(x=>['stun','paralysis'].includes(x)),noMove:types.length>0,noDefense:types.includes('paralysis'),noSpeech:types.includes('paralysis'),stunned:types.includes('stun')};
}
export function requireControlAction(c,action){const f=controlFlags(c);if(f.noAction&&action!=='wait')throw Error('적용된 행동 제한 중에는 대기·회복만 가능합니다.');if(f.noMove&&action==='move')throw Error('적용된 이동 제한을 먼저 해제하세요.');}
export function controlProfileCommand(r,u,op,p){
 if(op!=='controlProfile')return null;
 if(u.id!==r.owner)throw Error('상태 능력 등록은 방장만 가능합니다.');
 const c=r.characters.find(c=>c.id===p.characterId),field=c?.fields?.find(f=>f.name===p.field);
 if(!field||field.value!==p.fieldValue||/미구매|미습득/.test(field.value))throw Error('현재 구매된 시트 항목과 일치해야 합니다.');
 const doc=r.documents?.find(d=>d.id===p.documentId&&d.content?.includes(p.quote));
 if(!doc||!p.quote?.trim()||p.quote.length>500||!p.id?.match(/^[a-z0-9-]{1,60}$/)||!['stun','paralysis','immobilized'].includes(p.effect)||!Number.isInteger(p.seconds)||p.seconds<1||p.seconds>86400||typeof p.reason!=='string'||!p.reason.trim())throw Error('등록할 효과·원문·기간을 확인하세요.');
 if(p.recoveryField&&(!Number.isInteger(p.recoveryModifier)||Math.abs(p.recoveryModifier)>100))throw Error('회복 보정을 확인하세요.');
 if(!['resistedContest','resistance'].includes(p.procedure)||!Number.isInteger(p.costFP)||p.costFP<0||p.costFP>100||!Number.isInteger(p.activationSeconds)||p.activationSeconds<1||p.activationSeconds>86400)throw Error('등록된 저항 절차·비용·발동 시간이 필요합니다.');
 c.controlProfiles??={};c.controlProfiles[p.id]={id:p.id,field:p.field,fieldValue:p.fieldValue,effect:p.effect,seconds:p.seconds,documentId:p.documentId,quote:p.quote,reason:p.reason,procedure:p.procedure,costFP:p.costFP,activationSeconds:p.activationSeconds,recoveryField:p.recoveryField||'',recoveryModifier:p.recoveryModifier||0};return {id:p.id};
}
export function recoverControls(r,c,die,roll,emit,seconds=1){
 for(const e of [...(c.effects||[])].filter(e=>e.control&&e.recoveryField)){
  const value=Number(c.fields?.find(f=>f.name===e.recoveryField)?.value);if(!Number.isInteger(value))continue;
  for(let n=0;n<Math.min(seconds,3600);n++){const result=roll(value+e.recoveryModifier,die);if(result.success){c.effects=c.effects.filter(x=>x.id!==e.id);emit(r,c,e.label+' 회복',{effectId:e.id,roll:result});break;}}
 }
}
