import {fishRecord} from './aquarium-targets.mjs';
import {canControl} from '../public/play/character-control.js';
export function promoteDialogue(room,original,payload){
 const job=original.gmJob,m=room.messages.find(m=>m.id===job.messageId);
 const actor=room.characters.find(c=>c.id===job.actorId);
 if(job.kind!=='dialogue'||!m||m.type!=='dialogue'||m.audience==='party'||m.channel==='admin'||m.recipient||m.author!==job.requesterId||m.speakerId!==job.actorId||m.text!==job.requestText||!actor||!canControl(actor,{id:job.requesterId}))throw Error('원래 대화와 캐릭터 조작 권한을 확인하세요.');
 if(m.actionId||room.actions.some(a=>a.sourceMessageId===m.id))throw Error('이미 판정에 연결된 대화입니다.');
 if(typeof payload.reason!=='string'||!payload.reason.trim()||payload.reason.length>500)throw Error('대화 판정의 이유가 필요합니다.');
 if(room.combat?.status==='active'){
  const b=room.combat;if(b.pending?.kind==='critical'||actor.id!==(fishRecord(room,b.pending?.targetId)?.owner.id||b.pending?.targetId||b.order[b.index]))throw Error('현재 행동 또는 방어 차례에 선언하세요.');
 }
 const id=crypto.randomUUID(),at=new Date().toISOString();
 room.actions.push({id,actorId:actor.id,author:m.author,text:m.text,scope:'individual',status:'pending',at,sourceMessageId:m.id,dialogueTargetId:job.targetId||'',adjudicationReason:payload.reason.trim()});
 m.actionId=id;
 return {id:crypto.randomUUID(),kind:'individual',status:'queued',at,requesterId:m.author,actorId:actor.id,targetId:job.targetId||'',messageId:m.id,requestText:m.text,actionIds:[id],fromDialogueId:job.id};
}
