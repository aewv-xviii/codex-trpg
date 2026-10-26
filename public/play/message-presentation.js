import {isGMQuestion} from './message-purpose.js';
import {combatSpeaker} from './combat-speaker.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const gmIcon=(label='GM')=>`<span class="gm-emblem" role="img" aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z"/><path d="M12 7v10M7 12h10"/></svg></span>`;
export const isGMSpeaker=m=>isGMQuestion(m)||['narration','adminReply','whisper'].includes(m?.type)||(m?.type==='gm'&&!m.speakerId);
const people=r=>[...(r?.characters||[]),...(r?.cast||[])];
const unquote=s=>s.replace(/^(?:“([\s\S]*)”|"([\s\S]*)"|「([\s\S]*)」|『([\s\S]*)』)$/u,(_,a,b,c,d)=>a??b??c??d);
// Compatibility for authored openings. Only explicit labels or an unambiguous
// named speaker immediately introducing a quote establish an NPC identity.
function openingParts(room,m){
 const all=[...new Map(people(room).map(p=>[p.id,p])).values()],parts=[];
 const npc=p=>!p.controllers?.length&&(p.isNPC||room.cast?.some(c=>c.id===p.id));
 const add=(type,text,p)=>{if(text.trim())parts.push({...m,id:m.id+'~opening-'+parts.length,type,text:text.trim(),name:p?.name||'GM',speakerId:p?.id||'',expressionId:'',gmResponseId:m.gmResponseId||'scene:'+m.id,sourceMessageId:m.sourceMessageId||m.id});};
 for(const paragraph of String(m.text||'').split(/\n+/).map(s=>s.trim()).filter(Boolean)){
  const label=paragraph.match(/^([^:：\n]{1,60})\s*[:：]\s*([\s\S]+)$/u),name=label?.[1].trim();
  const named=all.filter(p=>p.name===name&&p.isNPC!==false);
  if(label&&['GM','GM 안내','GM 확인','나레이션','내레이션','상황 설명'].includes(name)){add(name.startsWith('GM')?'gmQuestion':'narration',label[2]);continue;}
  if(label&&named.length===1&&npc(named[0])){add('npcDialogue',unquote(label[2]),named[0]);continue;}
  const quotes=[...paragraph.matchAll(/“([^“”]+)”|"([^"\n]+)"|「([^「」]+)」|『([^『』]+)』/gu)];
  if(quotes.length===1){
   const q=quotes[0],before=paragraph.slice(0,q.index),mentioned=all.filter(p=>p.name&&before.includes(p.name));
   const p=mentioned.length===1?mentioned[0]:null;
   if(p&&npc(p)&&/(?:말한다|말했다|묻는다|물었다|속삭인다|속삭였다|외친다|외쳤다|대답한다|대답했다)[.。:]?\s*$/u.test(before)){
    add('narration',before);add('npcDialogue',q.slice(1).find(v=>v!==undefined),p);add('narration',paragraph.slice(q.index+q[0].length));continue;
   }
  }
  add('narration',paragraph);
 }
 return parts.some(p=>p.type!=='narration')?parts:[m];
}
function speaker(r,m){
 const all=people(r);if(m.speakerId)return all.find(p=>p.id===m.speakerId);
 const matches=all.filter(p=>p.name===m.name&&(p.isNPC||r?.cast?.some(c=>c.id===p.id)));
 return matches.length===1?matches[0]:null;
}
export function displayMessage(room,message){
 if(message.speakerPresentation)return {...message,name:message.speakerPresentation.name};
 if(message.type==='combat'){const id=combatSpeaker(room,message),person=people(room).find(c=>c.id===id);if(person)return {...message,speakerId:id,name:person.name};}
 if(message.sceneSnapshotId&&message.type!=='gm')return message;
 if(isGMSpeaker(message))return {...message,type:isGMQuestion(message)?'gmQuestion':message.type,name:'GM',speakerId:'',expressionId:''};
 if(['gm','npcDialogue'].includes(message.type)){
  const person=speaker(room,message);
  if(person)return {...message,type:room?.characters?.some(c=>c.id===person.id&&!c.isNPC)?'dialogue':'npcDialogue',speakerId:person.id,name:person.name};
  if(message.type==='gm')return {...message,type:'narration',name:'GM',speakerId:'',expressionId:''};
 }
 return message;
}
// Only explicit, standalone quoted paragraphs in an identified NPC's legacy scene.
// Player speech and unattributed quotations are never assigned to another character.
export function sceneMessageParts(room,message){
 let m=message;
 if(m.type==='gm'&&!m.speakerId){const p=speaker(room,m);if(p)m={...m,speakerId:p.id};}
 m=displayMessage(room,m);
 if(m.type==='narration'&&!isGMQuestion(m))return openingParts(room,m);
 if(m.type!=='npcDialogue'||!speaker(room,m))return [m];
 const paragraphs=String(m.text||'').split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
 const quote=s=>s.match(/^(?:“([\s\S]+)”|"([\s\S]+)"|「([\s\S]+)」|『([\s\S]+)』)$/);
 if(paragraphs.length<2||!paragraphs.some(quote)||paragraphs.every(quote))return [m];
 const parts=[];
 for(const paragraph of paragraphs){
  const q=quote(paragraph),type=q?'npcDialogue':'narration',body=q?q.slice(1).find(v=>v!==undefined):paragraph;
  const previous=parts.at(-1);
  if(previous?.type===type){previous.text+='\n\n'+body;continue;}
  parts.push({...m,id:m.id+'~'+parts.length,type,text:body,name:q?m.name:'GM',speakerId:q?m.speakerId:'',expressionId:q?m.expressionId:'',gmResponseId:m.gmResponseId||'scene:'+m.id,sourceMessageId:m.id});
 }
 return parts;
}
export const displayMessages=room=>(room?.messages||[]).flatMap(m=>sceneMessageParts(room,m));
export const messageLabel=m=>isGMQuestion(m)?'GM 안내':m?.type==='narration'?'나레이션':isGMSpeaker(m)?'GM':m.name;
export const messageNameMarkup=m=>`<b>${esc(messageLabel(m))}</b>`;
export const sceneSpeakerMarkup=scene=>scene?.speakerId?esc(scene.speaker):`${gmIcon('나레이션')}<span>나레이션</span>`;
