export const MEMORY_KINDS=['fact','npc','relationship','promise','clue','event','location','time'];
const fail=()=>{throw Error('GM 기억 항목을 확인하세요.');};
const str=(v,n,empty=false)=>typeof v==='string'&&v.length<=n&&(empty||v.trim())?v.trim():fail();
export function updateMemory(room,p){
 if(!MEMORY_KINDS.includes(p.kind)||!['confirmed','belief','unknown'].includes(p.certainty)||!['active','resolved','retired'].includes(p.status))fail();
 const people=[...room.characters,...(room.cast||[])].map(c=>c.id);
 const subjectId=str(p.subjectId,100,true);
 if(subjectId&&!people.includes(subjectId))fail();
 if(!Array.isArray(p.knownTo)||p.knownTo.length>30||p.knownTo.some(id=>!['gm','all',...people].includes(id)))fail();
 const title=str(p.title,100),text=str(p.text,2000),id=str(p.id,100,true);
 room.gmMemory||=[];
 let entry=id?room.gmMemory.find(m=>m.id===id):room.gmMemory.find(m=>m.kind===p.kind&&m.subjectId===subjectId&&m.title===title);
 if(id&&!entry)fail();
 if(!entry){if(room.gmMemory.length>=150)throw Error('GM 기억 한도에 도달했습니다. 기존 항목을 갱신하세요.');entry={id:crypto.randomUUID()};room.gmMemory.push(entry);}
 Object.assign(entry,{kind:p.kind,subjectId,title,text,certainty:p.certainty,knownTo:[...new Set(p.knownTo)],status:p.status,updatedAt:new Date().toISOString()});
}
