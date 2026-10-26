// Compatibility for older GM responses; new responses use an explicit gmQuestion type.
export function isGMQuestion(message){
 if(message?.type==='gmQuestion')return true;
 if(message?.type!=='narration')return false;
 const body=String(message.text||'').trim();
 // Only standalone, direct player clarification questions. Never reclassify NPC speech,
 // quoted dialogue, descriptive passages or arbitrary sentences ending in a question mark.
 return body.length<=400&&!/["“”「」『』.。!]/u.test(body)&&
  /^(?:어디로\s*(?:향|가|이동)|누구(?:에게|한테)\s*(?:말|이야기|대화)|어느\s*(?:쪽|장소|인물)|어떤\s*(?:대상|행동|방법)|무엇을\s*(?:조사|확인|하려))/u.test(body)&&
  /(?:나요|가요|까요|습니까|세요)[?？]$/u.test(body);
}
export function presentMessage(message){return isGMQuestion(message)?{...message,type:'gmQuestion',name:'GM 확인',speakerId:'',expressionId:''}:message;}
