// Canonical identity is scenario data; perception is presentation, not a rules engine.
const people=r=>[...(r.characters||[]),...(r.cast||[])];
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export function scenarioNPCs(r){
 const entry=r.chronicle?.cases?.find(c=>c.id===r.chronicle.activeCaseId);
 const pack=r.contentPacks?.find(p=>p.id===entry?.contentRef?.packId);
 const scenario=pack?.cases?.find(c=>c.id===entry.contentRef.caseId);
 return people(r).filter(c=>!c.controllers?.length&&(c.isNPC||r.cast?.some(a=>a.id===c.id))).filter(c=>{
  if(c.companion?.status==='recruited')return true;
  if(c.id.startsWith('world:')&&r.worldLibrary?.definition?.people?.some(n=>c.id===`world:${r.worldLibrary.definition.id}:${n.id}`))return true;
  if(scenario)return c.contentRef?.packId===pack.id&&scenario.actorIds.includes(c.contentRef.actorId);
  if(entry?.npcIds)return entry.npcIds.includes(c.id);
  if(entry&&r.characters?.some(a=>a.caseId===entry.id))return c.caseId===entry.id;
  // Legacy manually authored rooms still use registered IDs, never generated names.
  return !c.caseId||c.caseId===entry?.id;
 });
}
export function requireScenarioNPC(r,id){
 const c=scenarioNPCs(r).find(c=>c.id===id);
 if(!c)fail('시나리오 명단에 등록된 NPC ID가 필요합니다. 준비 자료를 확인하세요.');
 return c;
}
// Check entity references, not free prose or the choice of rule/mechanic.
export function validateNPCReferences(r,op,p){
 if(!['possessionAction','npcIntent','stealthAction','awarenessUpdate','controlAction','observeNPC','npcDialogue','sourceRuling','abilityPlan','aquariumAction','aquariumSequence','aquariumObserve','combatAction','combatAct','mapAction','plan','inventoryAction','recruitCompanion'].includes(op))return;
 const ids=new Set(people(r).filter(c=>c.isNPC||r.cast?.some(a=>a.id===c.id)).filter(c=>!c.controllers?.length).map(c=>c.id));
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  for(const [key,v] of Object.entries(value)){
   if(['sourceId','targetId','opponentId','characterId','speakerId','fromId'].includes(key)&&ids.has(v))requireScenarioNPC(r,v);
   else if(v&&typeof v==='object')visit(v);
  }
 };
 visit(p);
}
export function npcPresentation(c){
 const identified=c.npcIdentity?c.npcIdentity.state==='identified':c.contentRevealed!==false;
 return {identified,name:identified?c.name:c.npcIdentity?.state==='heard'?'정체불명의 목소리':'정체불명의 인물'};
}
// Generated combat receipts must respect the same identity boundary as portraits.
// The GM retains canonical IDs and sheets; only displayed log names are masked.
export function combatIdentityText(r,value){
 let text=value;
 for(const c of people(r).filter(c=>c.isNPC||r.cast?.includes(c)).sort((a,b)=>(b.name?.length||0)-(a.name?.length||0))){
  const view=npcPresentation(c);if(c.name&&!view.identified)text=text.split(c.name).join(view.name);
 }
 return text;
}
export function observeNPC(r,p){
 const c=requireScenarioNPC(r,p.characterId);
 if(!['heard','detected','seen'].includes(p.mode)||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>1000)fail('NPC 확인 방식과 관찰 근거가 필요합니다.');
 if(c.npcIdentity?.state==='identified'||c.contentRevealed===true)return c;
 c.npcIdentity={state:p.mode==='seen'?'identified':p.mode,reason:p.reason,at:new Date().toISOString()};
 if(p.mode==='seen')c.contentRevealed=true;
 return c;
}
export function identifyVisibleNPC(c){
 if(!c?.isNPC)return;
 if(c.npcIdentity||c.contentRef){c.npcIdentity={state:'identified',reason:'직접 시야 확인',at:new Date().toISOString()};c.contentRevealed=true;}
}
export function npcRosterContext(r){
 return scenarioNPCs(r).map(c=>({id:c.id,name:c.name,description:c.description||'',source:c.contentRef||{caseId:c.caseId||''},presentation:npcPresentation(c),placeId:r.worldLibrary?.characterPlaces?.[c.id]||c.placeId||'',mapIds:(r.maps||[]).filter(m=>m.tokens?.some(t=>t.characterId===c.id)).map(m=>m.id)}));
}
export function maskUnidentifiedNPCs(r){
 for(const c of people(r))if(c.isNPC||r.cast?.includes(c)){
  const view=npcPresentation(c);if(view.identified)continue;
  c.name=view.name;c.description='';c.portraits=[];c.expressionId='';
  for(const m of r.maps||[])for(const t of m.tokens||[])if(t.characterId===c.id)t.name=view.name;
 }
}
