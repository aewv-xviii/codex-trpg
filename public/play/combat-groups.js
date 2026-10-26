// Presentation-only grouping. Persisted messages and game results remain untouched.
const attack=/^(.+?) → (.+?) · (.+) · 명중 [\d+]+=\d+ \/ \d+ · (명중 판정 성공|실패)$/;
const damage=/^(.+)\n명중 \d+\/\d+ · 피해 /;
const defense=/^(.+) · (회피|받아내기|막기) [\d+]+=\d+ \/ -?\d+ · (성공|실패)$/;
const health=/^(.+) · (생존|중상) [\d+]+=\d+ \/ -?\d+ · (성공|실패)$/;
const draw=/^(.+) · 빠른 뽑기 [\d+]+=\d+ \/ -?\d+ · 성공$/;
const event=m=>m.combatDetails?.event;
function withEvent(m,e){return {...m,combatDetails:{...m.combatDetails,event:e}};}
export function groupCombatMessages(input){
 const messages=input.map(m=>({...m}));let previous=null;
 // Bounded adapter for old sequential logs: exact actor/target, same encounter,
 // and no intervening non-combat message. Unknown entries are never swallowed.
 for(let i=0;i<messages.length;i++){
  const m=messages[i];if(m.type!=='combat'){previous=null;continue;}
  if(event(m)){previous=null;continue;}
  const h=m.text?.match(attack),d=m.text?.match(damage),f=m.text?.match(defense),hp=m.text?.match(health);
  if(h){
   previous={attackId:'legacy:'+m.id,title:h[1]+' → '+h[2]+' · '+h[3],actor:h[1],target:h[2],combatId:m.combatId};
   messages[i]=withEvent(m,{...previous,phase:'hit',result:h[4]==='실패'?'miss':'pendingDefense'});
   const prior=messages[i-1],quick=prior?.type==='combat'&&prior.text?.match(draw);
   if(quick&&quick[1]===previous.actor&&prior.combatId===m.combatId)messages[i-1]=withEvent(prior,{...previous,phase:'hit',result:'preparation'});
  }else if(previous&&previous.combatId===m.combatId){
   if(d&&d[1]===previous.title)messages[i]=withEvent(m,{...previous,phase:'damage',result:'applied'});
   else if(f&&f[1]===previous.target)messages[i]=withEvent(m,{...previous,phase:'hit',result:f[3]==='성공'?'defended':'hit'});
   else if(hp&&hp[1]===previous.target)messages[i]=withEvent(m,{...previous,phase:'damage',result:'effect'});
   else if(m.text===previous.target+' · 방어하지 않음'||m.text===previous.target+' · 공격을 인지하지 못해 능동방어 없음')messages[i]=withEvent(m,{...previous,phase:'hit',result:'hit'});
   else if(/^대성공·대실패표|^방어 대실패/.test(m.text))messages[i]=withEvent(m,{...previous,phase:'hit',result:'review'});
   else previous=null;
  }
 }
 const groups=new Map(),attacks=new Map();
 const attackKey=m=>String(m.combatId||'')+'|'+event(m).attackId;
 const key=m=>String(m.combatId||'')+'|'+event(m).attackId+(m.speakerId?'|'+m.speakerId:'');
 for(const m of messages){const e=event(m);if(!e?.attackId||!['hit','damage'].includes(e.phase))continue;const k=key(m);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(m);const a=attackKey(m);if(!attacks.has(a))attacks.set(a,[]);attacks.get(a).push(m);}
 const seen=new Set(),out=[];
 for(const m of messages){
  const e=event(m);if(!e?.attackId||!['hit','damage'].includes(e.phase)){out.push(m);continue;}
  const k=key(m);if(seen.has(k))continue;seen.add(k);
  const role=m.speakerId&&m.speakerId===e.targetId&&e.actorId!==e.targetId?'defense':'attack';
  const members=groups.get(k),all=role==='defense'?members:attacks.get(attackKey(m)),hitEvents=all.filter(x=>event(x).phase==='hit');
  const applied=all.some(x=>event(x).result==='applied');
  const latest=hitEvents.filter(x=>event(x).result!=='preparation').at(-1);
  const outcome=applied?'hit':event(latest||m).result;
  out.push({...m,id:'combat-group:'+k,text:members.map(x=>x.text).join('\n\n'),combatGroup:{title:role==='defense'?m.name+' · 방어':e.title,role,phase:applied?'damage':'hit',members,outcome}});
 }
 return out;
}
