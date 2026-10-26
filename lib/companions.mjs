import {npcPresent} from '../public/play/npc-presence.js';
import {canControl,isCompanion} from '../public/play/character-control.js';
import {normalizeParty} from './party.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const log=(r,text,extra={})=>r.messages.push({id:crypto.randomUUID(),type:'system',text,author:r.owner,name:'GM',at:new Date().toISOString(),...extra});
export function recruitmentActions(r){
 if(r.combat?.status==='active'||!['individual','turn','narration'].includes(r.gmJob?.kind))return [];
 return r.actions.filter(a=>r.gmJob.actionIds?.includes(a.id)&&!a.companionRecruitment&&
  (a.status==='pending'||a.status==='resolved'&&r.rolls.some(x=>x.id===a.resolutionId&&x.actionId===a.id&&x.success===true)));
}
export function recruitmentCandidates(r){
 const people=[...r.characters.filter(c=>c.isNPC),...(r.cast||[]).filter(c=>!r.characters.some(x=>x.id===c.id))];
 return people.filter(c=>!isCompanion(c));
}
// Only the authenticated GM job application path calls this operation.
export function recruitCompanion(r,original,p){
 const source=recruitmentActions(original).find(a=>a.id===p.actionId),a=r.actions.find(a=>a.id===p.actionId);
 if(!source||!a||a.companionRecruitment||a.status!==source.status)fail('이번 GM 요청의 미처리 영입 의사 또는 성공한 판정이 필요합니다.');
 const actor=r.characters.find(c=>c.id===source.actorId),member=r.members.find(m=>m.id===source.author);
 if(!actor||!member||!canControl(actor,member)||!r.partyCharacterIds.includes(actor.id))fail('영입에 동의한 플레이어의 현재 캐릭터를 확인하세요.');
 if(source.dialogueTargetId&&source.dialogueTargetId!==p.characterId)fail('합의한 대화 상대와 영입할 NPC가 다릅니다.');
 if(p.playerAgreed!==true||p.npcAgreed!==true||typeof p.agreement!=='string'||!p.agreement.trim()||p.agreement.length>1000)fail('플레이어와 NPC의 동의 및 공개 가능한 합의 근거가 필요합니다.');
 if(!recruitmentCandidates(original).some(c=>c.id===p.characterId&&npcPresent(original,c,original.worldLibrary?.characterPlaces?.[actor.id]||original.worldLibrary?.placeId)))fail('영입할 NPC를 확인하세요.');
 let c=r.characters.find(c=>c.id===p.characterId);
 if(c&&!c.isNPC||isCompanion(c))fail('이미 영입했거나 NPC가 아닌 인물입니다.');
 if(!c){
  const npc=r.cast.find(c=>c.id===p.characterId);if(!npc||r.characters.length>=60)fail('동료 인물 등록 한도를 확인하세요.');
  // Same unreviewed placeholder sheet as scenario NPCs; never supplies combat stats.
  c={id:npc.id,owner:r.owner,isNPC:true,name:npc.name,description:npc.description||'',portraits:structuredClone(npc.portraits||[]),expressionId:npc.expressionId||'',hp:10,maxHp:10,fp:10,maxFp:10,statsPending:true,fields:[],...(npc.worldLibraryId?{worldLibraryId:npc.worldLibraryId}:{})};
  r.characters.push(c);
 }
 c.companion={status:'recruited',actionId:a.id,recruitedBy:member.id,agreement:p.agreement.trim(),at:new Date().toISOString()};
 c.controllers=member.id===c.owner?[]:[member.id];
 a.companionRecruitment={characterId:c.id,agreement:p.agreement.trim()};
 if(a.status==='pending'){a.status='resolved';a.reason=p.agreement.trim();}
 normalizeParty(r);
 log(r,`${c.name}이 동료로 등록됐습니다. 캐릭터 탭에서 파티에 참가시킬 수 있습니다.`,{actionId:a.id});
 return {characterId:c.id};
}
export function dismissCompanion(r,u,p){
 const c=r.characters.find(c=>c.id===p.characterId);
 if(!isCompanion(c))fail('영입한 동료를 선택하세요.');
 if(r.owner!==u.id&&!canControl(c,u))fail('방장 또는 동료 담당자만 방출할 수 있습니다.',403);
 if(r.combat?.status==='active'||['queued','running','applying'].includes(r.gmJob?.status)||r.actions.some(a=>a.status!=='resolved'&&(a.actorId===c.id||a.plan?.targetId===c.id||a.dialogueTargetId===c.id)))fail('관련 행동과 GM 처리, 전투를 마친 뒤 방출하세요.',409);
 c.companion={...c.companion,status:'dismissed',dismissedAt:new Date().toISOString(),dismissedBy:u.id};
 c.controllers=[];r.partyCharacterIds=r.partyCharacterIds.filter(id=>id!==c.id);r.turn.ready=[];normalizeParty(r);
 log(r,`${c.name}을 동료에서 방출했습니다. 인물과 기존 기록은 유지됩니다.`);
 return {characterId:c.id};
}
