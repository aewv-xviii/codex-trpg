// Disclosed information, not inventory, dice or automatic story outcomes.
const text=(v,max,label)=>{
 if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`단서 ${label}을 확인하세요.`);
 return v.trim();
};
export function recordClue(room,p){
 const people=[...(room.characters||[]),...(room.cast||[])];
 if(!Array.isArray(p.knownTo)||!p.knownTo.length||p.knownTo.length>30||p.knownTo.some(id=>!people.some(c=>c.id===id)))throw Error('단서를 실제로 아는 인물 ID가 필요합니다.');
 if(!['confirmed','belief','unknown'].includes(p.certainty))throw Error('단서의 확인 상태가 필요합니다.');
 if(typeof p.id!=='string'||p.id.length>100)throw Error('단서 ID를 확인하세요.');
 const data={title:text(p.title,100,'이름'),text:text(p.text,2000,'내용'),usage:text(p.usage,1000,'사용 방법'),source:text(p.source,1000,'출처'),knownTo:[...new Set(p.knownTo)].sort(),certainty:p.certainty};
 const caseId=room.chronicle?.activeCaseId||'';
 room.notes||=[];
 let entry=p.id?room.notes.find(n=>n.id===p.id&&n.recordType==='discoveredClue'):room.notes.find(n=>n.recordType==='discoveredClue'&&n.caseId===caseId&&n.title===data.title&&JSON.stringify(n.knownTo)===JSON.stringify(data.knownTo));
 if(p.id&&!entry)throw Error('기존 단서를 찾을 수 없습니다.');
 if(!entry){
  if(room.notes.length>=100)throw Error('사건 기록은 100개까지 가능합니다. 기존 단서를 갱신하세요.');
  entry={id:crypto.randomUUID(),recordType:'discoveredClue',kind:'clue',visibility:'public',caseId,episodeId:room.chronicle?.activeEpisodeId||'',at:new Date().toISOString()};
  room.notes.push(entry);
 }
 Object.assign(entry,data,{updatedAt:new Date().toISOString(),sourceJobId:room.gmJob?.id||'',gameClock:structuredClone(room.chronicle?.clock||null)});
 return entry;
}

// Explicit owner maintenance for information already disclosed in play.
export function restoreClue(room,p){
 if(['queued','running','applying'].includes(room.gmJob?.status))throw Error('GM 작업이 끝난 뒤 단서를 복구하세요.');
 if(!Array.isArray(p.evidence)||!p.evidence.length||p.evidence.length>10)throw Error('기존 공개 대화 근거가 필요합니다.');
 for(const expected of p.evidence){
  const m=room.messages.find(m=>m.id===expected.id);
  if(!m||m.text!==expected.text||m.recipient||m.channel==='admin'||!['narration','npcDialogue','dialogue','gm'].includes(m.type))throw Error('단서 근거가 변경되었거나 공개된 대화가 아닙니다.');
 }
 const reason=text(p.reason,1000,'복구 이유');
 const entry=recordClue(room,p.clue);
 entry.sourceMessageIds=[...new Set(p.evidence.map(m=>m.id))];entry.sourceJobId='';entry.restoration={reason,at:new Date().toISOString()};
 return {clueId:entry.id};
}
