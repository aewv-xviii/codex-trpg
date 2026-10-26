// Presentation-only cues from settled server state. These are not GURPS modifiers
// or victory predictions; no model is needed to decide whether to request a beat.
const inactive=new Set(['unconscious','dead','dying','withdrawn']);
const pick=(value,keys)=>Object.fromEntries(keys.map(k=>[k,value?.[k]]));
function snapshot(room){
 const b=room.combat;
 return {status:b.status,winnerTeam:b.winnerTeam??null,round:b.round,fighters:Object.fromEntries(Object.entries(b.fighters).filter(([,f])=>!f.summon).map(([id,f])=>{
  const c=room.characters.find(c=>c.id===id);
  return [id,{...pick(f,['team','status','stunned','prone','dropped']),hp:c.hp,maxHp:c.maxHp}];
 }))};
}
function advantage(state,previous='balanced'){
 const power={party:0,enemy:0};
 for(const f of Object.values(state.fighters)){
  if(inactive.has(f.status))continue;
  power[f.team]+=Math.max(.15,Math.min(1,f.hp/f.maxHp))*(f.stunned ? .25 : 1)*(f.prone ? .65 : 1)*(f.dropped ? .5 : 1);
 }
 const total=power.party+power.enemy,difference=total?(power.party-power.enemy)/total:0;
 // A dead band prevents minor HP fluctuations from repeatedly flipping the cue.
 if(difference>=.3)return 'party';if(difference<=-.3)return 'enemy';
 if(previous==='party'&&difference>.15||previous==='enemy'&&difference<-.15)return previous;
 return 'balanced';
}
export function initializeCombatReactions(room){
 const state=snapshot(room);
 room.combat.reactionState={...state,advantage:advantage(state),lastMessageId:room.messages.at(-1)?.id,seen:[],lastRound:-100};
}
export function combatReactionSpeakers(room){
 return room.characters.filter(c=>c.isNPC&&!c.controllers?.length&&room.combat?.fighters[c.id]&&!inactive.has(room.combat.fighters[c.id].status)&&!room.combat.fighters[c.id].stunned).map(c=>c.id);
}
export function combatReactionKey(room){
 return JSON.stringify({id:room.combat?.id,...(room.combat?snapshot(room):{}),pending:room.combat?.pending||null});
}
export function queueCombatReaction(room){
 const b=room.combat;
 if(!b||b.pending||!['active','ended'].includes(b.status)||['queued','running','applying'].includes(room.gmJob?.status))return false;
 // Completed encounters remain in history even after participants are removed.
 if(b.status==='ended'&&(!b.reactionState||b.reactionState.status==='ended'))return false;
 // Reconciliation can cancel an obsolete queued defense in a legacy encounter.
 // Preserve that cancellation instead of converting it into new model work.
 if(b.status==='ended'&&room.gmJob?.status==='cancelled'&&['combat','combatReview'].includes(room.gmJob.kind)){initializeCombatReactions(room);return false;}
 if(!b.reactionState){initializeCombatReactions(room);return false;}
 const before=b.reactionState,after=snapshot(room),edge=advantage(after,before.advantage);
 const start=room.messages.findIndex(m=>m.id===before.lastMessageId);
 const records=room.messages.slice(start+1).filter(m=>m.type==='combat'&&m.combatId===b.id);
 if(!records.length){b.reactionState={...before,...after,advantage:edge,lastMessageId:room.messages.at(-1)?.id};return false;}
 let reasons=[];const seen=new Set(before.seen||[]);
 const add=(key,reason)=>{if(!seen.has(key)){reasons.push(reason);seen.add(key);}};
 for(const [id,f] of Object.entries(after.fighters)){
  const old=before.fighters[id];if(!old)continue;
  const impacts=records.filter(m=>m.combatDetails?.event?.targetId===id&&m.combatDetails?.impact);
  const large=impacts.some(m=>m.combatDetails.impact.damage>=f.maxHp/2);
  const threshold=old.hp>0&&f.hp<=0?'zero':old.hp>=f.maxHp/3&&f.hp<f.maxHp/3?'low':null;
  if(large||threshold)add(`injury:${id}:${threshold||Math.floor(f.hp/(f.maxHp/3))}`,{kind:'majorInjury',characterId:id,hpBefore:old.hp,hpAfter:f.hp,maxHp:f.maxHp});
  const effects=['stunned','prone','dropped'].filter(k=>f[k]&&!old[k]);
  if(effects.length)add(`control:${id}:${effects.join(',')}`,{kind:'control',characterId:id,effects});
  if(inactive.has(f.status)&&!inactive.has(old.status))add(`incapacitated:${id}:${f.status}`,{kind:'incapacitated',characterId:id,status:f.status});
  const npc=room.characters.find(c=>c.id===id);
  const terminal=['unconscious','dying','dead'].includes(f.status)&&f.status!==old.status;
  if(npc?.isNPC&&!npc.controllers?.length&&(terminal||threshold==='zero')){
   add(`lastMoment:${id}:${terminal?f.status:'defeated'}`,{kind:'lastMoment',characterId:id,status:f.status,from:old.status,defeated:threshold==='zero',canSpeak:!['unconscious','dead','withdrawn'].includes(old.status)});
  }
 }
 const shift=edge!=='balanced'&&edge!==before.advantage;
 if(shift)reasons.push({kind:'advantageShift',from:before.advantage,to:edge});
 const ended=before.status!=='ended'&&after.status==='ended';
 const available=combatReactionSpeakers(room);
 const closingSpeakerId=ended&&b.winnerTeam==='enemy'?b.order.find(id=>b.fighters[id].team==='enemy'&&available.includes(id))||'':'';
 // A casualty's final beat is distinct from the winner's closing line.
 // Party wins/draws/manual endings never trigger general victory commentary.
 if(ended){
  reasons=reasons.filter(reason=>reason.kind==='lastMoment');
  if(closingSpeakerId)reasons.push({kind:'combatEnded',winnerTeam:'enemy',speakerId:closingSpeakerId,reason:b.reason});
 }
 const lastMoments=reasons.filter(reason=>reason.kind==='lastMoment');
 const lastWordIds=lastMoments.filter(reason=>reason.canSpeak).map(reason=>reason.characterId);
 b.reactionState={...after,advantage:edge,lastMessageId:room.messages.at(-1)?.id,seen:[...seen].slice(-80),lastRound:before.lastRound};
 // No audience NPC, no new turning point, or a repeated beat: zero extra calls.
 const npcs=room.characters.filter(c=>c.isNPC&&!c.controllers?.length&&b.fighters[c.id]);
 if(!npcs.length||!reasons.length||!ended&&!shift&&!lastMoments.length&&b.round-before.lastRound<2)return false;
 b.reactionState.lastRound=b.round;
 room.gmJob={id:crypto.randomUUID(),kind:'combatReaction',status:'queued',combatId:b.id,requesterId:room.owner,at:new Date().toISOString(),
  reaction:{reasons,closingSpeakerId,lastWordIds,speakerIds:[...new Set([...(ended?(closingSpeakerId?[closingSpeakerId]:[]):available),...lastWordIds])],stateKey:combatReactionKey(room),records:records.slice(-12).map(m=>pick(m,['id','text','combatDetails']))}};
 return true;
}
export function validateCombatReaction(room,proposal){
 const job=room.gmJob;
 if(job.combatId!==room.combat?.id||room.combat.pending||job.reaction?.stateKey!==combatReactionKey(room))throw Error('전투 상황이 변경되어 이전 결과의 반응을 생략합니다.');
 if(proposal.commands.length>2)throw Error('전투 반응은 짧은 서술·대사 두 개까지입니다.');
 const lastWordIds=(job.reaction.reasons||[]).filter(reason=>reason.kind==='lastMoment'&&reason.canSpeak&&room.combat.fighters[reason.characterId]?.status===reason.status).map(reason=>reason.characterId);
 const speakers=[...combatReactionSpeakers(room),...lastWordIds.filter(id=>room.characters.some(c=>c.id===id&&c.isNPC&&!c.controllers?.length))];
 const spoken=new Set();
 for(const c of proposal.commands){
  if(!['narration','npcDialogue'].includes(c.op)||typeof c.payload?.text!=='string'||c.payload.text.length>400)throw Error('전투 반응에는 짧은 서술·대사만 사용할 수 있습니다.');
  if(c.op==='npcDialogue'&&(!speakers.includes(c.payload.speakerId)||!job.reaction.speakerIds.includes(c.payload.speakerId)))throw Error('현재 반응할 수 있는 NPC만 말할 수 있습니다.');
  if(c.op==='npcDialogue'){
   const id=c.payload.speakerId;
   if(spoken.has(id))throw Error('전투 반응은 NPC 한 명당 한 번만 말할 수 있습니다.');
   if(room.combat.status==='ended'&&id!==job.reaction.closingSpeakerId&&!lastWordIds.includes(id))throw Error('종료 반응은 상대팀 대표 한 명과 막 쓰러진 NPC의 마지막 반응만 허용합니다.');
   spoken.add(id);
  }
 }
}
