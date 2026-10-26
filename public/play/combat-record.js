const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const section=(id,label,rows)=>({id,label,rows});
// Old records stay immutable. Only known server log formats are summarized.
export function combatRecord(message){
 const text=String(message.text||''),first=text.split('\n')[0];
 const damage=text.match(/^(.+)\n명중 (\d+)\/(\d+) · 피해 (.+?) \[([^\]]+)\] → (\d+) · DR (\d+) · 부상 (\d+) · HP (-?\d+)\/(\d+)(?:\n([\s\S]*))?$/);
 if(damage){const [,title,roll,target,formula,dice,raw,dr,injury,hp,maxHp,effect]=damage;
  return {title,metrics:[['결과','명중'],['피해',injury+' HP'],['남은 HP',hp+' / '+maxHp]],sections:[
   section('hit','명중 상세',[['명중 굴림',roll+' / 목표 '+target]]),
   section('damage','피해 상세',[['피해식',formula],['주사위',dice],['기본 피해',raw],['적용 DR',dr],['실제 HP 피해',injury],['남은 HP',hp+' / '+maxHp]]),
   ...(effect?[section('effects','상태·효과',[['별도 검토',effect]])]:[])
  ]};
 }
 const hit=text.match(/^(.+) · 명중 ([\d+]+)=(\d+) \/ (\d+) · (명중 판정 성공|실패)$/);
 if(hit)return {title:hit[1],metrics:[['명중',hit[5]==='실패'?'빗나감':'판정 성공']],sections:[section('hit','명중 상세',[['주사위',hit[2]+' = '+hit[3]],['목표',hit[4]],['결과',hit[5]]])]};
 const check=text.match(/^(.+) · (회피|받아내기|막기|생존|중상|의식 유지|기절 회복) ([\d+]+)=(\d+) \/ (-?\d+) · (성공|실패)$/);
 if(check){const defense=['회피','받아내기','막기'].includes(check[2]);return {title:check[1],metrics:[[check[2],check[6]]],sections:[section(defense?'hit':'effects',defense?'방어 상세':'상태·효과',[[check[2]+' 굴림',check[3]+' = '+check[4]],['목표',check[5]],['결과',check[6]]])]};}
 const effect=/대성공|대실패|기절|의식|사망|치명상|전투 불능|특수 판정|보정|빠른 뽑기/.test(text);
 return {title:first.length>90?first.slice(0,90)+'…':first,metrics:[],sections:effect?[section('effects','상태·효과',[['기록',text]])]:[]};
}
export function combatRecordMarkup(message){
 if(message.combatGroup)return groupedMarkup(message.combatGroup);
 const report=combatRecord(message),extra=message.combatDetails||{};
 for(const [id,label] of [['hit','명중 상세'],['damage','피해 상세'],['effects','상태·효과']])if(Array.isArray(extra[id])&&extra[id].length){
  const existing=report.sections.find(s=>s.id===id);if(existing)existing.rows.push(...extra[id]);else report.sections.push(section(id,label,extra[id]));
 }
 return `<div class="combat-record"><div class="combat-record-title">${esc(report.title)}</div>${report.metrics.length?`<div class="combat-outcome">${report.metrics.map(([label,value])=>`<span><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`).join('')}</div>`:''}<div class="combat-breakdowns">${report.sections.map(s=>`<details data-combat-detail="${s.id}"><summary>${esc(s.label)}</summary><dl>${s.rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></details>`).join('')}<details data-combat-detail="original"><summary>원문 기록</summary><p>${esc(message.text)}</p></details></div></div>`;
}
function groupedMarkup(group){
 const damage=group.members.map(combatRecord).find(r=>r.metrics.some(([label])=>label==='피해'));
 const impacts=group.members.map(m=>m.combatDetails?.impact).filter(Boolean);
 const amount=impacts.length?impacts.reduce((n,i)=>n+i.damage,0)+' HP':damage?.metrics.find(([label])=>label==='피해')?.[1];
 const result=(group.role==='defense'?{hit:'명중 허용',defended:'방어 성공',review:'특수 판정 확인 중'}:{hit:'피해 처리 중',miss:'빗나감',defended:'상대 방어 성공',pendingDefense:'방어 대기',review:'특수 판정 확인 중'})[group.outcome]||'처리 중';
 const metrics=amount!==undefined?[['피해',amount]]:[['결과',result]];
 const label='판정 상세';
 return `<div class="combat-record combat-group"><div class="combat-record-title">${esc(group.title)}</div><div class="combat-outcome">${metrics.map(([key,value])=>`<span><small>${esc(key)}</small><strong>${esc(value)}</strong></span>`).join('')}</div><div class="combat-breakdowns"><details data-combat-detail="attack"><summary>${label}</summary><div class="combat-checks">${group.members.map(m=>{
  const extra=m.combatDetails||{},rows=[...(extra.hit||[]),...(extra.damage||[]),...(extra.effects||[])];
  return `<div class="combat-check"><p>${esc(m.text)}</p>${rows.length?`<dl>${rows.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}</div>`;
 }).join('')}</div></details></div></div>`;
}
