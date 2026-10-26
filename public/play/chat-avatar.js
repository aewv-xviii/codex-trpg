import {isGMSpeaker,gmIcon,messageLabel} from './message-presentation.js';
import {portraitMarkup} from './portrait-crop.js';
import {combatSpeaker} from './combat-speaker.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function messageAvatar(room,message){
 if(isGMSpeaker(message))return `<span class="message-seal gm-avatar">${gmIcon(messageLabel(message))}</span>`;
 const roll=room?.rolls?.find(r=>r.id===message.rollId);
 const action=['action','plan','roll'].includes(message.type)?room?.actions?.find(a=>a.id===(message.actionId||roll?.actionId)):null;
 const id=message.speakerId||combatSpeaker(room||{},message)||roll?.actorId||action?.actorId;
 let person=[...(room?.characters||[]),...(room?.cast||[]),...(room?.characters||[]).flatMap(c=>c.aquarium?.fish||[])].find(c=>c.id===id);
 // Older free rolls lack an actor ID. Only use an unambiguous owner/name match.
 if(!id&&roll?.free){
  const matches=(room?.characters||[]).filter(c=>c.owner===roll.author&&c.name===roll.name);
  if(matches.length===1)person=matches[0];
 }
 const portrait=message.speakerPresentation?.identified===false?null:person?.portraits?.find(p=>p.id===(message.expressionId||person.expressionId))||person?.portraits?.[0];
 return portrait?`<span class="message-seal message-avatar portrait-avatar">${portraitMarkup(portrait,person.name+' 토큰 아이콘','token')}</span>`:`<span class="message-seal">${['gm','gmQuestion'].includes(message.type)?'✧':esc(message.name?.slice(0,1)||'·')}</span>`;
}
